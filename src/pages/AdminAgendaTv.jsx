import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  Minimize,
  RefreshCw,
  ShieldX,
  Users,
  Youtube,
  X,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import useAdminProfile from '../hooks/useAdminProfile'
import { resolveAdminAccess } from '../lib/auth/adminAccess'
import { listarAgendaAdminPeriodo } from '../lib/agenda/api'
import { dataLocalKey, mensagemErroAgenda, statusAgenda } from '../lib/agenda/ui'
import { listarBarbeiros } from '../lib/barbeiros/api'
import { carregarIdentidadeBarbearia } from '../lib/configuracoes/identidade-api'
import { supabase } from '../lib/supabase'
import garagemSymbol from '../assets/brand/garagem-symbol.png'

const AUTO_REFRESH_MS = 60_000
const PAGE_ROTATION_MS = 15_000
const MAX_APPOINTMENTS_PER_COLUMN = 9
const YOUTUBE_STORAGE_KEY = 'garagem:agenda-tv:youtube'
const YOUTUBE_MODE_STORAGE_KEY = 'garagem:agenda-tv:youtube-mode'
const UPCOMING_NOTICE_MINUTES = 10
const AGENDA_ALERT_MS = 45_000

function pageSizeForViewport() {
  if (typeof window === 'undefined') return 4
  if (window.innerWidth >= 2200) return 6
  if (window.innerWidth >= 1680) return 5
  if (window.innerWidth >= 1200) return 4
  if (window.innerWidth >= 760) return 2
  return 1
}

function professionalName(row) {
  return row.apelido || row.nome || row.profissional_apelido || row.profissional_nome || 'Barbeiro'
}

function nomeClienteProtegido(value) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Cliente'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts.at(-1).charAt(0).toUpperCase()}.`
}

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function youtubeEmbedUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new TypeError('Cole um link válido do YouTube.')
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    throw new TypeError('Use um link de vídeo ou playlist do YouTube.')
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  const playlistId = url.searchParams.get('list')
  let videoId = host === 'youtu.be' ? pathParts[0] : url.searchParams.get('v')
  if (!videoId && ['embed', 'shorts', 'live'].includes(pathParts[0])) videoId = pathParts[1]

  const validId = (id) => /^[A-Za-z0-9_-]{6,80}$/.test(String(id ?? ''))
  if (videoId && !validId(videoId)) videoId = ''
  if (playlistId && !validId(playlistId)) throw new TypeError('A playlist do YouTube não é válida.')
  if (!videoId && !playlistId) throw new TypeError('Não foi possível identificar o vídeo ou a playlist.')

  const base = videoId
    ? `https://www.youtube.com/embed/${videoId}`
    : 'https://www.youtube.com/embed/videoseries'
  const params = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', loop: '1' })
  if (playlistId) params.set('list', playlistId)
  else if (videoId) params.set('playlist', videoId)
  if (typeof window !== 'undefined') params.set('origin', window.location.origin)
  return `${base}?${params.toString()}`
}

function appointmentMoment(appointment, now) {
  if (appointment.status === 'em_atendimento') return 'live'
  if (['concluido', 'cancelado'].includes(appointment.status)) return 'past'
  const start = new Date(appointment.data_hora)
  const end = new Date(start.getTime() + Number(appointment.duracao_minutos || 30) * 60_000)
  if (now >= start && now < end) return 'live'
  return now >= end ? 'past' : 'next'
}

function TvAppointment({ appointment, now }) {
  const status = statusAgenda(appointment.status)
  const moment = appointmentMoment(appointment, now)
  return (
    <article className={`rounded-md border px-3 py-3 2xl:px-4 ${moment === 'live' ? 'border-copper bg-copper/10 shadow-[0_0_28px_rgba(201,111,52,.12)]' : moment === 'past' ? 'border-line bg-surface-0/45 opacity-60' : 'border-line bg-surface-0'}`}>
      <div className="flex items-start gap-3">
        <time className={`shrink-0 font-mono text-lg font-semibold 2xl:text-xl ${moment === 'live' ? 'text-copper' : 'text-warm-white'}`} dateTime={appointment.data_hora}>
          {formatTime(appointment.data_hora)}
        </time>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-warm-white 2xl:text-lg">{nomeClienteProtegido(appointment.cliente_nome)}</h3>
            <Badge variant={status.variant} className="shrink-0">{moment === 'live' ? 'Agora' : status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-steel 2xl:text-base">{appointment.servico_nome}</p>
        </div>
      </div>
    </article>
  )
}

function BarberColumn({ professional, appointments, now }) {
  const active = appointments.find((row) => appointmentMoment(row, now) === 'live')
  const shown = appointments.slice(0, MAX_APPOINTMENTS_PER_COLUMN)
  const hiddenCount = Math.max(appointments.length - shown.length, 0)

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface-1">
      <header className={`border-b px-4 py-4 ${active ? 'border-copper/50 bg-copper/10' : 'border-line bg-surface-2'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-label text-copper">CADEIRA</span>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold text-warm-white 2xl:text-3xl">{professionalName(professional)}</h2>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-copper/30 bg-surface-0 font-mono text-lg text-copper">
            {appointments.filter((row) => row.status !== 'cancelado').length}
          </div>
        </div>
        <p className={`mt-2 truncate text-sm ${active ? 'text-copper' : 'text-steel'}`}>
          {active ? `Atendendo ${nomeClienteProtegido(active.cliente_nome)}` : appointments.length ? 'Agenda atualizada' : 'Sem horários para hoje'}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3 2xl:space-y-3 2xl:p-4">
        {shown.length ? shown.map((appointment) => (
          <TvAppointment key={appointment.id} appointment={appointment} now={now} />
        )) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-line px-5 text-center">
            <Clock3 size={28} className="text-steel" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-warm-white">Cadeira livre</p>
            <p className="mt-1 text-sm text-steel">Nenhum atendimento agendado.</p>
          </div>
        )}
        {hiddenCount > 0 && <p className="text-center text-label text-steel">+ {hiddenCount} horários depois</p>}
      </div>
    </section>
  )
}

function AccessState({ access }) {
  if (access === 'loading') {
    return <div className="flex min-h-dvh items-center justify-center bg-surface-0 text-steel"><Spinner size={28} /> <span className="ml-3">Preparando modo TV</span></div>
  }
  if (access === 'signed_out') return <Navigate to="/login" replace />
  if (access === 'denied') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-0 p-6">
        <EmptyState icon={ShieldX} title="Modo TV restrito" description="Somente o proprietário ou administrador pode abrir a agenda da equipe nesta tela." action={<Link to="/login" className="text-copper underline">Voltar ao login</Link>} />
      </div>
    )
  }
  return null
}

export default function AdminAgendaTv() {
  const auth = useAdminProfile()
  const access = resolveAdminAccess(auth)
  const [now, setNow] = useState(() => new Date())
  const [date, setDate] = useState(() => dataLocalKey())
  const [professionals, setProfessionals] = useState([])
  const [appointments, setAppointments] = useState([])
  const [identity, setIdentity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [pageSize, setPageSize] = useState(pageSizeForViewport)
  const [page, setPage] = useState(0)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const [youtubeInput, setYoutubeInput] = useState(() => localStorage.getItem(YOUTUBE_STORAGE_KEY) || '')
  const [youtubeEmbed, setYoutubeEmbed] = useState(() => {
    try { return youtubeEmbedUrl(localStorage.getItem(YOUTUBE_STORAGE_KEY) || '') } catch { return '' }
  })
  const [youtubeMode, setYoutubeMode] = useState(() => localStorage.getItem(YOUTUBE_MODE_STORAGE_KEY) || 'split')
  const [youtubeModeDraft, setYoutubeModeDraft] = useState(() => localStorage.getItem(YOUTUBE_MODE_STORAGE_KEY) || 'split')
  const [tvFocus, setTvFocus] = useState('video')
  const [agendaCue, setAgendaCue] = useState('')
  const [youtubeOpen, setYoutubeOpen] = useState(false)
  const [youtubeError, setYoutubeError] = useState('')
  const agendaReturnTimer = useRef(null)
  const announcedAppointments = useRef(new Set())

  const showAgendaTemporarily = useCallback((message) => {
    if (!youtubeEmbed || youtubeMode !== 'smart') return
    window.clearTimeout(agendaReturnTimer.current)
    setAgendaCue(message)
    setTvFocus('agenda')
    agendaReturnTimer.current = window.setTimeout(() => {
      setTvFocus('video')
      setAgendaCue('')
    }, AGENDA_ALERT_MS)
  }, [youtubeEmbed, youtubeMode])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (access !== 'allowed') return
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [shop, team, rows] = await Promise.all([
        carregarIdentidadeBarbearia(),
        listarBarbeiros({ incluirInativos: false }),
        listarAgendaAdminPeriodo(date, date),
      ])
      setIdentity(shop)
      setProfessionals(team)
      setAppointments(rows)
      setLastUpdate(new Date())
    } catch (loadError) {
      setError(mensagemErroAgenda(loadError))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [access, date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date()
      setNow(current)
      const currentDate = dataLocalKey(current)
      setDate((previous) => previous === currentDate ? previous : currentDate)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (access !== 'allowed') return undefined
    const refresh = window.setInterval(() => load({ quiet: true }), AUTO_REFRESH_MS)
    const channel = supabase
      .channel('admin-agenda-tv')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, (change) => {
        load({ quiet: true })
        if (change.eventType === 'INSERT') showAgendaTemporarily('Novo agendamento recebido')
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profissionais' }, () => load({ quiet: true }))
      .subscribe()
    return () => {
      window.clearInterval(refresh)
      supabase.removeChannel(channel)
    }
  }, [access, load, showAgendaTemporarily])

  useEffect(() => () => window.clearTimeout(agendaReturnTimer.current), [])

  useEffect(() => {
    if (!youtubeEmbed || youtubeMode !== 'smart') return
    const upcoming = appointments.find((appointment) => {
      if (['cancelado', 'concluido', 'em_atendimento'].includes(appointment.status)) return false
      const minutes = (new Date(appointment.data_hora).getTime() - now.getTime()) / 60_000
      const noticeKey = `${appointment.id}:${appointment.data_hora}`
      if (minutes < 0 || minutes > UPCOMING_NOTICE_MINUTES || announcedAppointments.current.has(noticeKey)) return false
      announcedAppointments.current.add(noticeKey)
      return true
    })
    if (!upcoming) return
    const minutes = Math.max(1, Math.ceil((new Date(upcoming.data_hora).getTime() - now.getTime()) / 60_000))
    showAgendaTemporarily(`${nomeClienteProtegido(upcoming.cliente_nome)} em ${minutes} min · ${professionalName(upcoming)}`)
  }, [appointments, now, showAgendaTemporarily, youtubeEmbed, youtubeMode])

  useEffect(() => {
    const resize = () => setPageSize(pageSizeForViewport())
    const fullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement))
    window.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', fullscreenChange)
    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('fullscreenchange', fullscreenChange)
    }
  }, [])

  const team = useMemo(() => {
    const known = new Set(professionals.map((professional) => professional.id))
    const missing = appointments
      .filter((appointment) => !known.has(appointment.profissional_id))
      .map((appointment) => ({
        id: appointment.profissional_id,
        nome: appointment.profissional_nome,
        apelido: appointment.profissional_apelido,
      }))
      .filter((professional, index, rows) => rows.findIndex((row) => row.id === professional.id) === index)
    return [...professionals, ...missing]
  }, [appointments, professionals])

  const appointmentsByProfessional = useMemo(() => {
    const grouped = new Map(team.map((professional) => [professional.id, []]))
    appointments.forEach((appointment) => {
      if (grouped.has(appointment.profissional_id)) grouped.get(appointment.profissional_id).push(appointment)
    })
    return grouped
  }, [appointments, team])

  const smartYoutube = Boolean(youtubeEmbed) && youtubeMode === 'smart'
  const showingSmartAgenda = smartYoutube && tvFocus === 'agenda'
  const showYoutube = Boolean(youtubeEmbed) && (!smartYoutube || tvFocus === 'video')
  const showAgenda = !youtubeEmbed || youtubeMode === 'split' || showingSmartAgenda
  const displayPageSize = youtubeEmbed && youtubeMode === 'split' ? 1 : pageSize
  const pageCount = Math.max(Math.ceil(team.length / displayPageSize), 1)
  const visibleTeam = team.slice(page * displayPageSize, (page + 1) * displayPageSize)

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  useEffect(() => {
    if (pageCount <= 1) return undefined
    const rotation = window.setInterval(() => setPage((current) => (current + 1) % pageCount), PAGE_ROTATION_MS)
    return () => window.clearInterval(rotation)
  }, [pageCount])

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  function startYoutube(event) {
    event.preventDefault()
    setYoutubeError('')
    try {
      const embed = youtubeEmbedUrl(youtubeInput)
      localStorage.setItem(YOUTUBE_STORAGE_KEY, youtubeInput.trim())
      localStorage.setItem(YOUTUBE_MODE_STORAGE_KEY, youtubeModeDraft)
      setYoutubeEmbed(embed)
      setYoutubeMode(youtubeModeDraft)
      setTvFocus('video')
      setAgendaCue('')
      setYoutubeOpen(false)
      setPage(0)
    } catch (inputError) {
      setYoutubeError(inputError.message)
    }
  }

  function stopYoutube() {
    localStorage.removeItem(YOUTUBE_STORAGE_KEY)
    setYoutubeInput('')
    setYoutubeEmbed('')
    setTvFocus('video')
    setAgendaCue('')
    setYoutubeOpen(false)
    setYoutubeError('')
    setPage(0)
  }

  if (access !== 'allowed') return <AccessState access={access} />

  const scheduled = appointments.filter((row) => row.status !== 'cancelado').length
  const active = appointments.filter((row) => appointmentMoment(row, now) === 'live').length
  const completed = appointments.filter((row) => row.status === 'concluido').length

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-surface-0 text-warm-white">
      <header className="shrink-0 border-b border-line bg-surface-1 px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <img src={identity?.logo_url || garagemSymbol} alt={identity?.logo_url ? `Logo de ${identity.nome}` : ''} aria-hidden={identity?.logo_url ? undefined : 'true'} className="h-10 max-w-36 shrink-0 object-contain 2xl:h-12 2xl:max-w-44" onError={(event) => { event.currentTarget.src = garagemSymbol }} />
            <div className="min-w-0">
              <span className="block text-label text-copper">OPERAÇÃO AO VIVO</span>
              <h1 className="truncate font-display text-2xl font-semibold text-warm-white 2xl:text-3xl">{identity?.nome || 'Agenda da equipe'}</h1>
            </div>
          </div>

          <div className="hidden items-center gap-5 lg:flex" aria-label="Resumo do dia">
            <div><span className="block text-label text-steel">HORÁRIOS</span><strong className="font-mono text-xl text-warm-white">{scheduled}</strong></div>
            <div><span className="block text-label text-steel">ATENDENDO</span><strong className="font-mono text-xl text-copper">{active}</strong></div>
            <div><span className="block text-label text-steel">CONCLUÍDOS</span><strong className="font-mono text-xl text-success">{completed}</strong></div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link to="/admin/agenda" className="hidden h-10 items-center gap-2 rounded-sm border border-line px-3 text-sm font-semibold text-steel hover:border-copper hover:text-copper sm:inline-flex"><ArrowLeft size={17} /> Agenda</Link>
            {smartYoutube && <Button size="sm" variant="secondary" onClick={() => tvFocus === 'video' ? showAgendaTemporarily('Agenda aberta manualmente') : setTvFocus('video')}>{tvFocus === 'video' ? <CalendarDays size={17} /> : <Youtube size={17} />}<span className="hidden sm:inline">{tvFocus === 'video' ? 'Ver agenda' : 'Voltar ao vídeo'}</span></Button>}
            <Button size="sm" variant={youtubeEmbed ? 'primary' : 'secondary'} onClick={() => { setYoutubeError(''); setYoutubeModeDraft(youtubeMode); setYoutubeOpen(true) }}><Youtube size={17} /><span className="hidden sm:inline">YouTube</span></Button>
            <Button size="sm" variant="secondary" onClick={toggleFullscreen}>{fullscreen ? <Minimize size={17} /> : <Expand size={17} />}<span className="hidden sm:inline">Tela cheia</span></Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="flex items-center gap-2 text-sm capitalize text-steel 2xl:text-base"><CalendarDays size={17} className="text-copper" /> {formatDate(date)}</div>
          <div className="flex items-center gap-3">
            {lastUpdate && <span className="hidden text-xs text-steel sm:inline">Atualizada às {formatTime(lastUpdate)}</span>}
            <div className="flex items-center gap-2 font-mono text-xl font-semibold text-warm-white 2xl:text-2xl"><Clock3 size={19} className="text-copper" /> {formatTime(now)}</div>
          </div>
        </div>
      </header>

      {youtubeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/85 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="youtube-title" className="w-full max-w-xl rounded-lg border border-line bg-surface-1 p-5 shadow-overlay sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><span className="text-label text-copper">CONTEÚDO DA TV</span><h2 id="youtube-title" className="mt-1 text-h2 text-warm-white">Agenda com YouTube</h2></div>
              <button type="button" aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white" onClick={() => setYoutubeOpen(false)}><X size={20} /></button>
            </div>
            <p className="mt-3 text-body-sm text-steel">Cole o link de um vídeo ou playlist e escolha como a agenda participa da programação da TV.</p>
            <form className="mt-5 space-y-4" onSubmit={startYoutube}>
              <label className="block text-label text-steel"><span className="mb-2 block">LINK DO YOUTUBE</span><input type="url" required value={youtubeInput} onChange={(event) => setYoutubeInput(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="h-11 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper" /></label>
              <fieldset>
                <legend className="mb-2 text-label text-steel">COMO EXIBIR</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-md border p-3 ${youtubeModeDraft === 'split' ? 'border-copper bg-copper/10' : 'border-line bg-surface-0'}`}>
                    <input type="radio" name="youtube-mode" value="split" checked={youtubeModeDraft === 'split'} onChange={() => setYoutubeModeDraft('split')} className="sr-only" />
                    <strong className="block text-sm text-warm-white">Tela dividida</strong>
                    <span className="mt-1 block text-xs leading-relaxed text-steel">Vídeo e agenda permanecem lado a lado.</span>
                  </label>
                  <label className={`cursor-pointer rounded-md border p-3 ${youtubeModeDraft === 'smart' ? 'border-copper bg-copper/10' : 'border-line bg-surface-0'}`}>
                    <input type="radio" name="youtube-mode" value="smart" checked={youtubeModeDraft === 'smart'} onChange={() => setYoutubeModeDraft('smart')} className="sr-only" />
                    <strong className="block text-sm text-warm-white">Alternância inteligente</strong>
                    <span className="mt-1 block text-xs leading-relaxed text-steel">Vídeo em destaque; a agenda entra em novos horários e 10 min antes.</span>
                  </label>
                </div>
              </fieldset>
              {youtubeError && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{youtubeError}</p>}
              <p className="text-xs leading-relaxed text-steel">O áudio pode exigir o primeiro clique no player. Alguns vídeos não permitem reprodução incorporada por decisão do canal.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {youtubeEmbed && <Button type="button" variant="danger" onClick={stopYoutube}>Usar só agenda</Button>}
                <Button type="button" variant="ghost" onClick={() => setYoutubeOpen(false)}>Cancelar</Button>
                <Button type="submit"><Youtube size={17} /> Iniciar na TV</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col p-3 lg:p-4 2xl:p-5">
        {error && (
          <div role="alert" className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={() => load()}><RefreshCw size={15} /> Tentar novamente</Button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-steel"><Spinner size={28} /><span className="ml-3">Carregando agenda da equipe</span></div>
        ) : !error && team.length === 0 ? (
          <div className="flex flex-1 items-center justify-center"><EmptyState icon={Users} title="Nenhum barbeiro ativo" description="Cadastre ou ative a equipe para usar o modo TV." /></div>
        ) : !error && (
          <div className={`relative grid min-h-0 flex-1 gap-3 2xl:gap-4 ${youtubeEmbed && youtubeMode === 'split' ? 'lg:grid-cols-[minmax(0,2.15fr)_minmax(340px,.85fr)]' : ''}`}>
            {youtubeEmbed && (
              <section className={`min-h-0 overflow-hidden rounded-lg border border-line bg-black shadow-overlay ${showYoutube ? '' : 'pointer-events-none absolute inset-0 invisible'}`} aria-label="YouTube" aria-hidden={showYoutube ? undefined : 'true'}>
                <iframe title="Conteúdo do YouTube da barbearia" src={youtubeEmbed} className="h-full min-h-[240px] w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </section>
            )}
            {showAgenda && <div className="grid min-h-0 gap-3 2xl:gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(visibleTeam.length, 1)}, minmax(0, 1fr))` }}>
              {visibleTeam.map((professional) => (
                <BarberColumn key={professional.id} professional={professional} appointments={appointmentsByProfessional.get(professional.id) ?? []} now={now} />
              ))}
            </div>}
            {showingSmartAgenda && agendaCue && <div role="status" className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-copper/50 bg-surface-0/95 px-5 py-2 text-center text-sm font-semibold text-copper shadow-overlay">{agendaCue}<span className="ml-2 text-steel">· vídeo volta em instantes</span></div>}
          </div>
        )}
      </main>

      {showAgenda && pageCount > 1 && (
        <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-line bg-surface-1 px-4 py-2">
          <button type="button" aria-label="Grupo anterior" className="flex h-9 w-9 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-copper" onClick={() => setPage((current) => (current - 1 + pageCount) % pageCount)}><ChevronLeft size={19} /></button>
          <div className="flex items-center gap-2" aria-label={`Grupo ${page + 1} de ${pageCount}`}>
            {Array.from({ length: pageCount }, (_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === page ? 'w-7 bg-copper' : 'w-1.5 bg-steel/40'}`} />)}
          </div>
          <button type="button" aria-label="Próximo grupo" className="flex h-9 w-9 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-copper" onClick={() => setPage((current) => (current + 1) % pageCount)}><ChevronRight size={19} /></button>
          <span className="ml-2 hidden text-label text-steel sm:inline">ALTERNÂNCIA AUTOMÁTICA</span>
        </footer>
      )}
    </div>
  )
}
