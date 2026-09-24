import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { code: 'METODO_NAO_PERMITIDO' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith('Bearer ')) return json(401, { code: 'RECEPCAO_NAO_AUTORIZADA' })

  const accessToken = authorization.slice('Bearer '.length)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const callerClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken)
  if (userError || !userData.user) return json(401, { code: 'RECEPCAO_NAO_AUTORIZADA' })

  const { data: owner } = await adminClient.from('profiles').select('barbearia_id,role,ativo').eq('id', userData.user.id).maybeSingle()
  if (!owner?.barbearia_id || !owner.ativo || !['admin', 'master'].includes(owner.role)) return json(403, { code: 'RECEPCAO_NAO_AUTORIZADA' })

  const { data: entitlement } = await adminClient.from('barbearia_modulos').select('status_contrato,ativo_na_unidade,trial_ate,vigente_ate').eq('barbearia_id', owner.barbearia_id).eq('modulo', 'recepcao').maybeSingle()
  const now = Date.now()
  const commerciallyValid = entitlement?.status_contrato === 'ativo'
    ? (!entitlement.vigente_ate || new Date(entitlement.vigente_ate).getTime() >= now)
    : entitlement?.status_contrato === 'trial' && Boolean(entitlement.trial_ate) && new Date(entitlement.trial_ate).getTime() >= now
  if (!entitlement?.ativo_na_unidade || !commerciallyValid) return json(403, { code: 'RECEPCAO_MODULO_INATIVO' })

  let input: Record<string, unknown>
  try { input = await request.json() } catch { return json(400, { code: 'RECEPCAO_DADOS_INVALIDOS' }) }
  const nome = String(input.nome ?? '').trim()
  const email = String(input.email ?? '').trim().toLowerCase()
  const telefone = String(input.telefone ?? '').trim() || null
  if (nome.length < 2 || nome.length > 120) return json(400, { code: 'RECEPCAO_NOME_INVALIDO' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(400, { code: 'RECEPCAO_EMAIL_INVALIDO' })
  if (telefone && (telefone.length < 8 || telefone.length > 30)) return json(400, { code: 'RECEPCAO_TELEFONE_INVALIDO' })

  const { data: existing } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return json(409, { code: 'RECEPCAO_EMAIL_EM_USO' })

  const requestOrigin = request.headers.get('Origin')
  const localOrigin = requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin) ? requestOrigin : null
  const appUrl = Deno.env.get('APP_URL') || localOrigin || 'http://localhost:5173'
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: new URL('/definir-senha', appUrl).toString(),
    data: { nome, role: 'recepcao', barbearia_id: owner.barbearia_id },
  })
  if (inviteError || !invited.user) return json(inviteError?.message?.toLowerCase().includes('already') ? 409 : 502, { code: inviteError?.message?.toLowerCase().includes('already') ? 'RECEPCAO_EMAIL_EM_USO' : 'RECEPCAO_CONVITE_FALHOU' })

  const { data: profile, error: profileError } = await adminClient.from('profiles').insert({
    id: invited.user.id, barbearia_id: owner.barbearia_id, role: 'recepcao', nome, email, telefone, ativo: true, updated_at: new Date().toISOString(),
  }).select('id,nome,email,telefone,ativo,created_at,updated_at').single()
  if (profileError || !profile) {
    await adminClient.auth.admin.deleteUser(invited.user.id)
    return json(500, { code: 'RECEPCAO_CADASTRO_FALHOU' })
  }
  return json(201, { profile, inviteSent: true })
})
