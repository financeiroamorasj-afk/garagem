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

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  })

  const accessToken = authorization.slice('Bearer '.length)
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

  const professionalId = String(input.profissional_id ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(professionalId)) {
    return json(400, { code: 'BARBEIROS_DADOS_INVALIDOS' })
  }

  const { data: professional, error: professionalError } = await adminClient
    .from('profissionais')
    .select('id, user_id, nome, ativo')
    .eq('id', professionalId)
    .eq('barbearia_id', adminProfile.barbearia_id)
    .maybeSingle()
  if (professionalError || !professional?.user_id) return json(404, { code: 'BARBEIROS_NAO_ENCONTRADO' })
  if (!professional.ativo) return json(409, { code: 'BARBEIROS_ACESSO_INATIVO' })

  const { data: profile, error: barberProfileError } = await adminClient
    .from('profiles')
    .select('email, nome, role, ativo')
    .eq('id', professional.user_id)
    .eq('barbearia_id', adminProfile.barbearia_id)
    .maybeSingle()
  if (barberProfileError || profile?.role !== 'barbeiro' || !profile.email) {
    return json(404, { code: 'BARBEIROS_NAO_ENCONTRADO' })
  }
  if (profile.ativo === false) return json(409, { code: 'BARBEIROS_ACESSO_INATIVO' })

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(professional.user_id)
  if (authError || !authData.user) return json(404, { code: 'BARBEIROS_NAO_ENCONTRADO' })
  if (authData.user.email_confirmed_at || authData.user.confirmed_at) {
    return json(409, { code: 'BARBEIROS_ACESSO_CONFIRMADO' })
  }

  const requestOrigin = request.headers.get('Origin')
  const localOrigin = requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin)
    ? requestOrigin
    : null
  const appUrl = Deno.env.get('APP_URL') || localOrigin || 'http://localhost:5173'
  const redirectTo = new URL('/definir-senha', appUrl).toString()
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo,
    data: {
      nome: profile.nome || professional.nome,
      role: 'barbeiro',
      barbearia_id: adminProfile.barbearia_id,
    },
  })
  if (inviteError || !invited.user) return json(502, { code: 'BARBEIROS_CONVITE_FALHOU' })

  return json(200, { inviteSent: true, email: profile.email })
})
