import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, CheckCheck, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  listarComunicados,
  marcarComunicadoLido,
  marcarTodosComunicadosLidos,
  mensagemErroComunicados,
} from '../lib/comunicados/api'

const PRIORITY_CLASS = {
  informativo: 'border-info/35 bg-info/10 text-info',
  importante: 'border-warning/35 bg-warning/10 text-warning',
  urgente: 'border-danger/40 bg-danger/10 text-danger',
}

function formatarData(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value))
}

export default function AppNotificationBell({ contexto }) {
  const navigate = useNavigate()
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      setItems((await listarComunicados(contexto)) ?? [])
    } catch (requestError) {
      setError(mensagemErroComunicados(requestError))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [contexto])

  useEffect(() => {
    load()
    const handleFocus = () => load({ quiet: true })
    const handleUpdated = () => load({ quiet: true })
    window.addEventListener('focus', handleFocus)
    window.addEventListener('garagem:comunicados-atualizados', handleUpdated)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('garagem:comunicados-atualizados', handleUpdated)
    }
  }, [load])

  useEffect(() => {
    if (!open) return undefined
    function handlePointer(event) {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const unread = items.filter((item) => !item.lido).length

  async function openItem(item) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (!item.lido) await marcarComunicadoLido(item.id, contexto)
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, lido: true } : row))
      window.dispatchEvent(new CustomEvent('garagem:comunicados-atualizados'))
      setOpen(false)
      if (item.destino) navigate(item.destino)
    } catch (requestError) {
      setError(mensagemErroComunicados(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function markAll() {
    if (!unread || busy) return
    setBusy(true)
    setError('')
    try {
      await marcarTodosComunicadosLidos(contexto)
      setItems((current) => current.map((item) => ({ ...item, lido: true })))
      window.dispatchEvent(new CustomEvent('garagem:comunicados-atualizados'))
    } catch (requestError) {
      setError(mensagemErroComunicados(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        aria-label={unread ? `Atualizações: ${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Atualizações'}
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); if (!open) load({ quiet: true }) }}
        className="relative flex h-11 w-11 items-center justify-center rounded-sm border border-transparent text-steel transition-colors hover:border-line hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"
      >
        {unread ? <BellRing size={20} className="text-copper" aria-hidden="true" /> : <Bell size={20} aria-hidden="true" />}
        {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface-1 bg-danger px-1 text-[10px] font-bold leading-none text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && createPortal(
        <section ref={panelRef} className="fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[80] mx-auto flex max-h-[min(34rem,calc(100dvh-6rem-env(safe-area-inset-top)))] w-auto max-w-[23rem] flex-col overflow-hidden rounded-md border border-line-strong bg-surface-1 shadow-overlay sm:left-auto sm:right-6 sm:mx-0 sm:w-[23rem]" aria-label="Central de atualizações">
          <header className="flex items-center justify-between gap-3 border-b border-line p-4">
            <div><span className="text-label text-copper">NOVIDADES</span><h2 className="mt-1 text-h3 text-warm-white">Atualizações e avisos</h2></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar atualizações" className="flex h-10 w-10 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"><X size={19} /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? <p className="p-5 text-center text-body-sm text-steel">Carregando atualizações...</p> : error && items.length === 0 ? <div className="space-y-3 p-3 text-body-sm text-danger"><p>{error}</p><button type="button" onClick={() => load()} className="inline-flex min-h-10 items-center gap-2 text-copper"><RefreshCw size={15} /> Tentar novamente</button></div> : items.length === 0 ? <div className="p-6 text-center"><Bell size={25} className="mx-auto text-steel" /><p className="mt-3 text-body font-semibold text-warm-white">Tudo em dia</p><p className="mt-1 text-body-sm text-steel">Novas atualizações aparecerão aqui.</p></div> : <div className="space-y-2">{items.map((item) => (
              <button key={item.id} type="button" disabled={busy} onClick={() => openItem(item)} className={`w-full rounded-sm border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:cursor-wait ${item.lido ? 'border-line bg-surface-0/55' : 'border-copper/35 bg-copper/8 hover:border-copper/60'}`}>
                <span className="flex items-start gap-3">
                  <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.lido ? 'bg-line-strong' : 'bg-copper'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><strong className="text-body-sm text-warm-white">{item.titulo}</strong><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${PRIORITY_CLASS[item.prioridade] || PRIORITY_CLASS.informativo}`}>{item.prioridade}</span></span>
                    <span className="mt-1.5 block text-body-sm leading-relaxed text-steel">{item.resumo}</span>
                    <span className="mt-3 flex items-center justify-between gap-3"><span className="text-label text-steel">{formatarData(item.publicado_em)}</span><span className="inline-flex items-center gap-1 text-label text-copper">{item.rotulo_acao || 'Ver atualização'}<ChevronRight size={14} /></span></span>
                  </span>
                </span>
              </button>
            ))}</div>}
            {error && items.length > 0 && <p role="alert" className="mt-3 rounded-sm border border-danger/35 bg-danger/10 p-3 text-body-sm text-danger">{error}</p>}
          </div>

          {unread > 0 && <footer className="border-t border-line p-3"><button type="button" disabled={busy} onClick={markAll} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-sm text-body-sm font-semibold text-copper hover:bg-copper/10 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"><CheckCheck size={16} /> Marcar todas como lidas</button></footer>}
        </section>,
        document.body,
      )}
    </div>
  )
}
