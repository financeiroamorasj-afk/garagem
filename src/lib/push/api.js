import { supabase } from '../supabase'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BH65y31MokN9BGEvvgwfJI0z1ZbpXJmCGwDKe3druHisNE7dOYXirRwO-mWn-tON3efQzm6ERErjBZp0MUdxQw0'

function applicationServerKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

export function suportePush() {
  return Boolean(vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
}

export async function estadoPush() {
  if (!suportePush()) return 'indisponivel'
  if (Notification.permission === 'denied') return 'bloqueado'
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return 'disponivel'
  await salvar(subscription)
  return 'ativo'
}

async function salvar(subscription) {
  const serialized = subscription.toJSON()
  const { error } = await supabase.rpc('notificacao_push_salvar', {
    p_endpoint: subscription.endpoint,
    p_p256dh: serialized.keys?.p256dh,
    p_auth: serialized.keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 500),
  })
  if (error) throw error
}

export async function ativarPush() {
  if (!suportePush()) throw new Error('PUSH_INDISPONIVEL')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'PUSH_BLOQUEADO' : 'PUSH_NAO_AUTORIZADO')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(vapidPublicKey),
    })
  }
  await salvar(subscription)
  return subscription
}
