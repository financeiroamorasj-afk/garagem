import { createClient } from 'npm:@supabase/supabase-js@2.95.3'
import webpush from 'npm:web-push@3.6.7'

type WebhookPayload = {
  type?: string
  table?: string
  schema?: string
  record?: { id?: string }
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function appointmentTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { code: 'METODO_NAO_PERMITIDO' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:systemgaragem@gmail.com'
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json(503, { code: 'PUSH_NAO_CONFIGURADO' })
  }

  let payload: WebhookPayload
  try { payload = await request.json() } catch { return json(400, { code: 'PUSH_PAYLOAD_INVALIDO' }) }
  const appointmentId = payload.record?.id
  if (payload.type !== 'INSERT' || payload.table !== 'agendamentos' || !appointmentId) {
    return json(202, { ignored: true })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: appointment, error: appointmentError } = await admin
    .from('agendamentos')
    .select('id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora')
    .eq('id', appointmentId)
    .maybeSingle()
  if (appointmentError || !appointment) {
    return json(202, { ignored: true })
  }

  const [clientResult, serviceResult, professionalResult, adminsResult] = await Promise.all([
    admin.from('clientes').select('nome').eq('id', appointment.cliente_id).maybeSingle(),
    admin.from('servicos').select('nome').eq('id', appointment.servico_id).maybeSingle(),
    admin.from('profissionais').select('user_id,nome,apelido').eq('id', appointment.profissional_id).maybeSingle(),
    admin.from('profiles').select('id,role').eq('barbearia_id', appointment.barbearia_id).eq('ativo', true).in('role', ['admin', 'master']),
  ])
  const professional = professionalResult.data
  const recipients = new Map<string, string>()
  for (const profile of adminsResult.data || []) recipients.set(profile.id, profile.role)
  if (professional?.user_id) recipients.set(professional.user_id, 'barbeiro')
  if (recipients.size === 0) return json(200, { sent: 0 })

  const { data: subscriptions, error: subscriptionError } = await admin
    .from('notificacoes_push_assinaturas')
    .select('id,usuario_id,endpoint,p256dh,auth')
    .eq('barbearia_id', appointment.barbearia_id)
    .eq('ativo', true)
    .in('usuario_id', [...recipients.keys()])
  if (subscriptionError) return json(500, { code: 'PUSH_ASSINATURAS_FALHARAM' })

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  let sent = 0
  for (const subscription of subscriptions || []) {
    const { data: existing } = await admin
      .from('notificacoes_push_entregas')
      .select('id,status,tentativas')
      .eq('agendamento_id', appointment.id)
      .eq('assinatura_id', subscription.id)
      .maybeSingle()
    if (existing?.status === 'enviado' || existing?.status === 'processando') continue

    let deliveryId = existing?.id
    if (deliveryId) {
      await admin.from('notificacoes_push_entregas').update({
        status: 'processando', erro: null, tentativas: Number(existing.tentativas || 1) + 1, atualizado_em: new Date().toISOString(),
      }).eq('id', deliveryId)
    } else {
      const { data: created, error: createError } = await admin.from('notificacoes_push_entregas').insert({
        agendamento_id: appointment.id, assinatura_id: subscription.id,
      }).select('id').single()
      if (createError) continue
      deliveryId = created.id
    }

    const role = recipients.get(subscription.usuario_id)
    const destination = role === 'barbeiro' ? '/barber/dashboard' : '/admin/agenda'
    const body = `${clientResult.data?.nome || 'Cliente'} · ${serviceResult.data?.nome || 'Serviço'} · ${appointmentTime(appointment.data_hora)}`
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: 'Novo agendamento na sua agenda', body, url: destination,
        tag: `agendamento-${appointment.id}`,
      }), { TTL: 300, urgency: 'high' })
      sent += 1
      await admin.from('notificacoes_push_entregas').update({ status: 'enviado', atualizado_em: new Date().toISOString() }).eq('id', deliveryId)
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0)
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('notificacoes_push_assinaturas').update({ ativo: false, atualizado_em: new Date().toISOString() }).eq('id', subscription.id)
      }
      await admin.from('notificacoes_push_entregas').update({
        status: 'falhou', erro: `HTTP_${statusCode || 'ERRO'}`, atualizado_em: new Date().toISOString(),
      }).eq('id', deliveryId)
    }
  }

  return json(200, { sent })
})
