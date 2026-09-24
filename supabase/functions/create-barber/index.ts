import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function optionalText(value: unknown, maxLength: number) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (normalized.length > maxLength) throw new Error('BARBEIROS_DADOS_INVALIDOS')
  return normalized
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { code: 'METODO_NAO_PERMITIDO' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith('Bearer ')) {
    return json(401, { code: 'BARBEIROS_NAO_AUTORIZADO' })
  }

  const accessToken = authorization.slice('Bearer '.length)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  })

  const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken)
  if (userError || !userData.user) return json(401, { code: 'BARBEIROS_NAO_AUTORIZADO' })

  const { data: adminProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('barbearia_id, role')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError || adminProfile?.role !== 'admin' || !adminProfile.barbearia_id) {
    return json(403, { code: 'BARBEIROS_NAO_AUTORIZADO' })
  }

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return json(400, { code: 'BARBEIROS_DADOS_INVALIDOS' })
  }

  try {
    const nome = String(input.nome ?? '').trim()
    const email = String(input.email ?? '').trim().toLowerCase()
    const professionalId = input.profissional_id ? String(input.profissional_id) : null
    const apelido = optionalText(input.apelido, 60)
    const telefone = optionalText(input.telefone, 30)
    const especialidade = optionalText(input.especialidade, 100)
    const commissionInput = input.comissao_percentual
    const productCommissionInput = input.comissao_produtos_percentual
    const comissao = commissionInput === '' || commissionInput === null || commissionInput === undefined
      ? null
      : Number(commissionInput)
    const comissaoProdutos = productCommissionInput === '' || productCommissionInput === null || productCommissionInput === undefined
      ? null
      : Number(productCommissionInput)

    if (nome.length < 2 || nome.length > 120) throw new Error('BARBEIROS_NOME_INVALIDO')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('BARBEIROS_EMAIL_INVALIDO')
    if (apelido && apelido.length < 2) throw new Error('BARBEIROS_APELIDO_INVALIDO')
    if (telefone && telefone.length < 8) throw new Error('BARBEIROS_TELEFONE_INVALIDO')
    if (comissao !== null && (!Number.isFinite(comissao) || comissao < 0 || comissao > 100)) {
      throw new Error('BARBEIROS_COMISSAO_INVALIDA')
    }
    if (comissaoProdutos !== null && (!Number.isFinite(comissaoProdutos) || comissaoProdutos < 0 || comissaoProdutos > 100)) {
      throw new Error('BARBEIROS_COMISSAO_PRODUTOS_INVALIDA')
    }

    if (professionalId) {
      const { data: existingProfessional, error: existingProfessionalError } = await adminClient
        .from('profissionais')
        .select('id, user_id')
        .eq('id', professionalId)
        .eq('barbearia_id', adminProfile.barbearia_id)
        .maybeSingle()
      if (existingProfessionalError || !existingProfessional) throw new Error('BARBEIROS_NAO_ENCONTRADO')
      if (existingProfessional.user_id) throw new Error('BARBEIROS_ACESSO_JA_CRIADO')
    }

    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, barbearia_id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfile) return json(409, { code: 'BARBEIROS_EMAIL_EM_USO' })

    const requestOrigin = request.headers.get('Origin')
    const localOrigin = requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin)
      ? requestOrigin
      : null
    const appUrl = Deno.env.get('APP_URL') || localOrigin || 'http://localhost:5173'
    const redirectTo = new URL('/definir-senha', appUrl).toString()
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { nome, role: 'barbeiro', barbearia_id: adminProfile.barbearia_id },
    })

    if (inviteError || !invited.user) {
      const duplicate = inviteError?.message?.toLowerCase().includes('already')
      return json(duplicate ? 409 : 502, { code: duplicate ? 'BARBEIROS_EMAIL_EM_USO' : 'BARBEIROS_CONVITE_FALHOU' })
    }

    const userId = invited.user.id
    const { error: insertProfileError } = await adminClient.from('profiles').insert({
      id: userId,
      barbearia_id: adminProfile.barbearia_id,
      role: 'barbeiro',
      nome,
      email,
    })

    if (insertProfileError) {
      await adminClient.auth.admin.deleteUser(userId)
      return json(500, { code: 'BARBEIROS_CADASTRO_FALHOU' })
    }

    const professionalValues = {
      user_id: userId,
      nome,
      apelido,
      telefone,
      especialidade,
      comissao_percentual: comissao,
      comissao_produtos_percentual: comissaoProdutos,
      ativo: true,
      updated_at: new Date().toISOString(),
    }
    const professionalRequest = professionalId
      ? adminClient
        .from('profissionais')
        .update(professionalValues)
        .eq('id', professionalId)
        .eq('barbearia_id', adminProfile.barbearia_id)
        .is('user_id', null)
      : adminClient
        .from('profissionais')
        .insert({ ...professionalValues, barbearia_id: adminProfile.barbearia_id })

    const { data: professional, error: professionalError } = await professionalRequest
      .select('id, nome, apelido, ativo, user_id, criado_em, updated_at')
      .single()

    if (professionalError || !professional) {
      await adminClient.auth.admin.deleteUser(userId)
      return json(500, { code: 'BARBEIROS_CADASTRO_FALHOU' })
    }

    return json(201, { professional, email, inviteSent: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'BARBEIROS_DADOS_INVALIDOS'
    return json(400, { code })
  }
})
