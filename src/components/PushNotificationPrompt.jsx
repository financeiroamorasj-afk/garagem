import { useEffect, useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import Button from './ui/Button'
import { ativarPush, estadoPush } from '../lib/push/api'

export default function PushNotificationPrompt() {
  const [status, setStatus] = useState('carregando')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    estadoPush().then((next) => { if (active) setStatus(next) }).catch(() => { if (active) setStatus('disponivel') })
    return () => { active = false }
  }, [])

  if (status === 'carregando' || status === 'indisponivel' || status === 'ativo') return null

  async function enable() {
    setBusy(true); setError('')
    try { await ativarPush(); setStatus('ativo') }
    catch (failure) {
      if (failure?.message === 'PUSH_BLOQUEADO') setStatus('bloqueado')
      else setError('Não foi possível ativar agora. Tente novamente.')
    } finally { setBusy(false) }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-copper/40 bg-copper/8 p-4 sm:flex-row sm:items-center" aria-label="Notificações da agenda">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper/15 text-copper">
        {status === 'bloqueado' ? <BellOff size={21} aria-hidden="true" /> : <BellRing size={21} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-body text-warm-white">Avisos de novos agendamentos</strong>
        <p className="mt-1 text-body-sm text-steel">{status === 'bloqueado'
          ? 'As notificações estão bloqueadas neste navegador. Libere-as nas configurações do site.'
          : 'Ative para receber avisos do portal mesmo quando o Garagem não estiver aberto.'}</p>
        {error && <p role="alert" className="mt-2 text-body-sm text-danger">{error}</p>}
      </div>
      {status === 'disponivel' && <Button size="sm" loading={busy} onClick={enable}><BellRing size={16} /> Ativar avisos</Button>}
    </section>
  )
}
