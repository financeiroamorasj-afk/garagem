import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clock3, Expand, MonitorPlay, RefreshCw, Scissors, Users } from 'lucide-react'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { iniciarPareamentoTv, lerEstadoTv } from '../lib/tv/api'
import { dataLocalKey, statusAgenda } from '../lib/agenda/ui'
import garagemSymbol from '../assets/brand/garagem-symbol.png'

const STORAGE_KEY = 'garagem:tv:token'
const POLL_MS = 10_000
const PAGE_MS = 15_000
const ALERT_MS = 45_000
const EMPTY_ROWS = []

function pageSize() {
  if (window.innerWidth >= 2200) return 6
  if (window.innerWidth >= 1680) return 5
  if (window.innerWidth >= 1200) return 4
  if (window.innerWidth >= 760) return 2
  return 1
}

function time(value) { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function dateLabel(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(year, month - 1, day))
}
function personName(value) {
  const parts = String(value || 'Cliente').trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0]
}
function momentOf(row, now) {
  if (row.status === 'em_atendimento') return 'live'
  if (['concluido', 'cancelado'].includes(row.status)) return 'past'
  const start = new Date(row.data_hora)
  const end = new Date(start.getTime() + Number(row.duracao_minutos || 30) * 60_000)
  return now >= start && now < end ? 'live' : now >= end ? 'past' : 'next'
}
function embedUrl(videoId, playlistId) {
  if (!videoId && !playlistId) return ''
  const base = videoId ? `https://www.youtube.com/embed/${videoId}` : 'https://www.youtube.com/embed/videoseries'
  const params = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', loop: '1' })
  if (playlistId) params.set('list', playlistId)
  else if (videoId) params.set('playlist', videoId)
  params.set('origin', window.location.origin)
  return `${base}?${params}`
}

function Column({ professional, rows, now }) {
  const live = rows.find((row) => momentOf(row, now) === 'live')
  return <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface-1">
    <header className={`border-b px-4 py-4 ${live ? 'border-copper/50 bg-copper/10' : 'border-line bg-surface-2'}`}>
      <span className="text-label text-copper">CADEIRA</span>
      <div className="flex items-center justify-between gap-3"><h2 className="truncate font-display text-2xl text-warm-white">{professional.apelido || professional.nome}</h2><span className="font-mono text-xl text-copper">{rows.filter((row) => row.status !== 'cancelado').length}</span></div>
      <p className="mt-1 truncate text-sm text-steel">{live ? `Atendendo ${personName(live.cliente_nome)}` : rows.length ? 'Agenda atualizada' : 'Sem horários para hoje'}</p>
    </header>
    <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
      {rows.slice(0, 9).map((row) => {
        const moment = momentOf(row, now)
        return <article key={row.id} className={`rounded-md border p-3 ${moment === 'live' ? 'border-copper bg-copper/10' : moment === 'past' ? 'border-line bg-surface-0/45 opacity-60' : 'border-line bg-surface-0'}`}>
          <div className="flex gap-3"><time className="shrink-0 font-mono text-lg font-semibold text-copper">{time(row.data_hora)}</time><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><strong className="truncate text-warm-white">{personName(row.cliente_nome)}</strong><span className="shrink-0 text-xs text-steel">{moment === 'live' ? 'Agora' : statusAgenda(row.status).label}</span></div><p className="mt-1 truncate text-sm text-steel">{row.servico_nome}</p></div></div>
        </article>
      })}
      {rows.length > 9 && <p className="text-center text-label text-steel">+ {rows.length - 9} horários depois</p>}
      {rows.length === 0 && <p className="flex h-40 items-center justify-center gap-2 text-steel"><Scissors size={18} /> Cadeira livre</p>}
    </div>
  </section>
}

export default function TvScreen() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [columns, setColumns] = useState(pageSize)
  const [page, setPage] = useState(0)
  const [focus, setFocus] = useState('video')
  const [notice, setNotice] = useState('')
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const previousIds = useRef(null)
  const announced = useRef(new Set())
  const returnTimer = useRef(null)
  const inFlight = useRef(false)

  const start = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const result = await iniciarPareamentoTv()
      localStorage.setItem(STORAGE_KEY, result.token)
      setState({ estado: 'pendente', codigo: result.codigo, expira_em: result.expira_em })
    } catch { setError('Não foi possível gerar o código. Confira a internet e tente novamente.') }
    finally { setBusy(false) }
  }, [])

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const token = localStorage.getItem(STORAGE_KEY)
      if (!token) { await start(); return }
      const result = await lerEstadoTv(token)
      setState(result)
      setError('')
      if (result.estado === 'invalido' || result.estado === 'expirado' || result.estado === 'revogado') localStorage.removeItem(STORAGE_KEY)
    } catch { setError('Sem conexão com o sistema. A TV tentará novamente.') }
    finally { inFlight.current = false }
  }, [start])

  useEffect(() => {
    refresh()
    const polling = window.setInterval(refresh, POLL_MS)
    const clock = window.setInterval(() => setNow(new Date()), 1000)
    const resize = () => setColumns(pageSize())
    const full = () => setFullscreen(Boolean(document.fullscreenElement))
    window.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', full)
    return () => { window.clearInterval(polling); window.clearInterval(clock); window.clearTimeout(returnTimer.current); window.removeEventListener('resize', resize); document.removeEventListener('fullscreenchange', full) }
  }, [refresh])

  const team = state?.equipe || EMPTY_ROWS
  const appointments = state?.agenda || EMPTY_ROWS
  const mode = state?.modo_video || 'split'
  const video = useMemo(() => embedUrl(state?.video_id, state?.playlist_id), [state?.video_id, state?.playlist_id])
  const smart = Boolean(video) && mode === 'smart'
  const showAgenda = !video || mode === 'split' || focus === 'agenda'
  const showVideo = Boolean(video) && (!smart || focus === 'video')
  const pageSizeValue = video && mode === 'split' ? 1 : columns
  const pages = Math.max(1, Math.ceil(team.length / pageSizeValue))
  const visible = team.slice(page * pageSizeValue, (page + 1) * pageSizeValue)
  const grouped = useMemo(() => {
    const result = new Map(team.map((person) => [person.id, []]))
    appointments.forEach((row) => { if (result.has(row.profissional_id)) result.get(row.profissional_id).push(row) })
    return result
  }, [team, appointments])

  useEffect(() => { setPage((current) => Math.min(current, pages - 1)) }, [pages])
  useEffect(() => { setFocus('video'); setNotice('') }, [video])
  useEffect(() => {
    if (pages <= 1) return undefined
    const timer = window.setInterval(() => setPage((current) => (current + 1) % pages), PAGE_MS)
    return () => window.clearInterval(timer)
  }, [pages])
  useEffect(() => {
    if (!smart || state?.estado !== 'conectado') { previousIds.current = null; return }
    const ids = new Set(appointments.map((row) => row.id))
    const fresh = previousIds.current && appointments.some((row) => !previousIds.current.has(row.id))
    previousIds.current = ids
    const upcoming = appointments.find((row) => {
      if (['cancelado','concluido','nao_compareceu','em_atendimento'].includes(row.status)) return false
      const minutes = (new Date(row.data_hora).getTime() - now.getTime()) / 60000
      if (minutes < 0 || minutes > 10 || announced.current.has(row.id)) return false
      announced.current.add(row.id)
      return true
    })
    if (!fresh && !upcoming) return
    setNotice(fresh ? 'Novo agendamento recebido' : `${personName(upcoming.cliente_nome)} em breve`)
    setFocus('agenda')
    window.clearTimeout(returnTimer.current)
    returnTimer.current = window.setTimeout(() => { setFocus('video'); setNotice('') }, ALERT_MS)
  }, [appointments, now, smart, state?.estado])

  if (state?.estado !== 'conectado') return <div className="flex min-h-dvh items-center justify-center bg-surface-0 p-6 text-warm-white">
    <div className="w-full max-w-xl rounded-lg border border-line bg-surface-1 p-6 text-center shadow-overlay sm:p-10">
      <MonitorPlay size={44} className="mx-auto text-copper" />
      <p className="mt-4 text-label text-copper">GARAGEM SYSTEM · MODO TV</p>
      <h1 className="mt-2 font-display text-3xl">{state?.estado === 'pendente' ? 'Conecte esta TV' : 'Pronta para conectar'}</h1>
      {state?.estado === 'pendente' ? <><p className="mt-4 text-body text-steel">No celular do dono, acesse <strong>Modo TV</strong> no menu do sistema e informe este código:</p><p className="mt-6 rounded-md border border-copper bg-copper/10 p-5 font-mono text-4xl tracking-[.15em] text-copper sm:text-5xl">{state.codigo?.slice(0,4)} {state.codigo?.slice(4)}</p><p className="mt-4 text-body-sm text-steel">O código vale por 10 minutos. A agenda aparecerá automaticamente após a confirmação.</p></> : <p className="mt-4 text-body text-steel">{state?.estado === 'revogado' ? 'O acesso desta TV foi encerrado pelo administrador.' : 'Gere um código novo para conectar a TV.'}</p>}
      {error && <p role="alert" className="mt-4 text-body-sm text-danger">{error}</p>}
      {state?.estado !== 'pendente' && <Button className="mt-6" loading={busy} onClick={start}><RefreshCw size={17} /> Gerar código</Button>}
      {!state && !error && <div className="mt-6 flex justify-center"><Spinner size={24} /></div>}
    </div>
  </div>

  const displayDate = state.data || dataLocalKey(now)
  return <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-surface-0 text-warm-white">
    <header className="shrink-0 border-b border-line bg-surface-1 px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><img src={state.identidade?.logo_url || garagemSymbol} alt="" className="h-10 max-w-36 object-contain" onError={(event) => { event.currentTarget.src = garagemSymbol }} /><div className="min-w-0"><span className="text-label text-copper">OPERAÇÃO AO VIVO</span><h1 className="truncate font-display text-2xl">{state.identidade?.nome || 'Agenda da equipe'}</h1></div></div><div className="flex shrink-0 items-center gap-3 font-mono text-xl"><Clock3 size={18} className="text-copper" /> {time(now)}<button type="button" aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}) }} className="rounded-sm p-2 text-steel hover:text-copper"><Expand size={19} /></button></div></div>
      <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm capitalize text-steel"><span className="flex items-center gap-2"><CalendarDays size={16} className="text-copper" /> {dateLabel(displayDate)}</span><span>{state.aparelho}</span></div>
    </header>
    {error && <p role="alert" className="border-b border-danger/40 bg-danger/10 p-2 text-center text-sm text-danger">{error}</p>}
    <main className="flex min-h-0 flex-1 flex-col p-3 lg:p-4">
      {team.length === 0 ? <EmptyState icon={Users} title="Nenhum barbeiro ativo" description="Cadastre a equipe para exibir a agenda." /> : <div className={`relative grid min-h-0 flex-1 gap-3 ${video && mode === 'split' ? 'lg:grid-cols-[minmax(0,2.15fr)_minmax(340px,.85fr)]' : ''}`}>
        {video && <section className={`min-h-0 overflow-hidden rounded-lg border border-line bg-black ${showVideo ? '' : 'pointer-events-none absolute inset-0 invisible'}`} aria-label="YouTube" aria-hidden={!showVideo}><iframe title="Vídeo da barbearia" src={video} className="h-full min-h-[240px] w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></section>}
        {showAgenda && <div className="grid min-h-0 gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(visible.length,1)},minmax(0,1fr))` }}>{visible.map((person) => <Column key={person.id} professional={person} rows={grouped.get(person.id) || []} now={now} />)}</div>}
        {smart && focus === 'agenda' && notice && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-copper bg-surface-0 px-5 py-2 text-copper">{notice}</div>}
      </div>}
    </main>
    {showAgenda && pages > 1 && <footer className="border-t border-line p-2 text-center text-label text-steel">Grupo {page + 1} de {pages} · alternância automática</footer>}
  </div>
}
