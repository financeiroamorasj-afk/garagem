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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json(500, { code: 'PORTAL_FOTO_CONFIGURACAO_INVALIDA' })

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return json(400, { code: 'PORTAL_FOTO_DADOS_INVALIDOS' })
  }

  const token = String(input.token ?? '')
  const cutId = String(input.corte_id ?? '')
  if (!/^[a-f0-9]{64}$/i.test(token) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cutId)) {
    return json(400, { code: 'PORTAL_FOTO_DADOS_INVALIDOS' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: path, error: validationError } = await adminClient.rpc('portal_corte_foto_path', {
    p_token: token,
    p_corte_id: cutId,
  })
  if (validationError || !path) {
    const expired = validationError?.message?.includes('PORTAL_SESSAO_INVALIDA')
    return json(expired ? 401 : 404, { code: expired ? 'PORTAL_SESSAO_INVALIDA' : 'PORTAL_FOTO_NAO_ENCONTRADA' })
  }

  const { data, error } = await adminClient.storage.from('cortes-clientes').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return json(404, { code: 'PORTAL_FOTO_NAO_ENCONTRADA' })

  return json(200, { signed_url: data.signedUrl, expires_in: 300 })
})
