import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, BellRing, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  DollarSign, Headset, LayoutDashboard, LogOut, Minimize2, MonitorPlay, PackageSearch, Phone, Play, RefreshCw, Scissors,
  ShoppingBag, UserPlus, UserRound, UserX, X, XCircle,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import WalkInModal from '../components/WalkInModal'
import AvailabilityOverview from '../components/AvailabilityOverview'
import CutCompletionModal from '../components/CutCompletionModal'
import PixPaymentPanel from '../components/PixPaymentPanel'
import LastCutSummary from '../components/LastCutSummary'
import PushNotificationPrompt from '../components/PushNotificationPrompt'
import {
  carregarAtendimentoAtivo, carregarContextoBarbeiro, carregarResumoBarbeiro, listarAgendaBarbeiro,
  listarAgendaBarbeiroPeriodo, mudarStatusAgendamento,
} from '../lib/agenda/api'
import {
  acaoPrincipalAgenda, atrasoAtendimentoMinutos, dataHoraLocalKey, dataLocalKey, deslocarDataKey,
  formatarDataAgenda, intervaloAgenda, mensagemErroAgenda, resumoAgenda,
  podeMarcarNaoCompareceu, rotuloPeriodoAgenda, statusAgenda,
  tempoAtendimento,
} from '../lib/agenda/ui'
import { formatarBRL } from '../lib/financeiro/moeda'
import { listarProdutosBarbeiro, mensagemErroProduto, venderProduto } from '../lib/produtos/api'
import { supabase } from '../lib/supabase'
import { listarDisponibilidadeOperacional } from '../lib/disponibilidade/api'
import TvControlPanel from '../components/tv/TvControlPanel'
import { verificarPermissaoTv } from '../lib/tv/api'
import { verificarAcessoOperadorRecepcao } from '../lib/recepcao/api'

const SECTIONS = [
  { value: 'today', label: 'Hoje', icon: Clock3 },
  { value: 'week', label: 'Semana', icon: CalendarDays },
  { value: 'sales', label: 'Vender', icon: ShoppingBag },
  { value: 'summary', label: 'Resumo', icon: BarChart3 },
  { value: 'tv', label: 'TV', icon: MonitorPlay },
]

const PAYMENT_LABELS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', outro: 'Outro' }

function formatarHorario(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function rotuloDiaCurto(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return {
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', ''),
    day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(date),
  }
}

function AppointmentCard({ appointment, activeAppointmentId, isToday, busy, now, actionError, onAction, onCancel, onComplete, onPhotoChanged }) {
  const [showTimer, setShowTimer] = useState(true)
  const [timerNow, setTimerNow] = useState(() => new Date())
  const status = statusAgenda(appointment.status)
  const action = acaoPrincipalAgenda(appointment.status)
  const isActive = appointment.status === 'em_atendimento'
  const elapsed = isActive ? tempoAtendimento(appointment.iniciado_em, timerNow) : null
  const waiting = ['pendente', 'confirmado', 'encaixe'].includes(appointment.status)
  const lateMinutes = isToday && waiting ? atrasoAtendimentoMinutos(appointment.data_hora, now) : 0
  const canMarkAbsent = isToday && waiting && podeMarcarNaoCompareceu(appointment.data_hora, now)
  const blockedByActive = action?.nextStatus === 'em_atendimento' && activeAppointmentId && activeAppointmentId !== appointment.id
  useEffect(() => {
    if (!isActive || !appointment.iniciado_em) return undefined
    const interval = window.setInterval(() => setTimerNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [isActive, appointment.iniciado_em])
  return <article className={`overflow-hidden rounded-md border bg-surface-1 ${isActive ? 'border-copper' : 'border-line'}`}>
    <div className="flex items-start gap-4 p-4">
      <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-sm border ${isActive ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-2 text-warm-white'}`}><Clock3 size={15} aria-hidden="true" /><time className="mt-1 text-data" dateTime={appointment.data_hora}>{formatarHorario(appointment.data_hora)}</time></div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2"><h2 className="truncate text-h3 text-warm-white">{appointment.cliente_nome}</h2><Badge variant={status.variant} className="shrink-0">{status.label}</Badge></div>
        <p className="mt-2 flex items-center gap-2 text-body-sm text-steel"><Scissors size={15} className="shrink-0 text-copper" aria-hidden="true" /><span className="truncate">{appointment.servico_nome}</span><span aria-hidden="true">·</span><span className="shrink-0">{appointment.duracao_minutos} min</span></p>
        {appointment.valor_final != null && <p className="mt-2 text-data text-gold-aged">{formatarBRL(appointment.valor_final)}</p>}
        {isActive && elapsed && <div className="mt-3 flex flex-wrap items-center gap-2 text-body-sm text-copper"><Clock3 size={16} aria-hidden="true" /><span>{showTimer ? `Em atendimento há ${elapsed}` : 'Atendimento em andamento'}</span><button type="button" onClick={() => setShowTimer((current) => !current)} className="underline underline-offset-4">{showTimer ? 'Ocultar tempo' : 'Mostrar tempo'}</button></div>}
        {appointment.cliente_telefone && <a href={`tel:${appointment.cliente_telefone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-body-sm text-info underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"><Phone size={15} aria-hidden="true" /> Ligar para o cliente</a>}
        {lateMinutes > 0 && <p role="status" className="mt-3 rounded-sm border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">Horário atrasado há {lateMinutes} min. Você ainda pode iniciar o atendimento.</p>}
        <LastCutSummary cut={appointment.ultimo_corte} canManage={appointment.ultimo_corte?.profissional_id === appointment.profissional_id} onPhotoChanged={onPhotoChanged} />
      </div>
    </div>
    {action && (isToday || isActive) && <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-line bg-surface-0 p-3">
      <Button size="lg" className="w-full" loading={busy} disabled={Boolean(blockedByActive)} onClick={() => action.nextStatus === 'concluido' ? onComplete(appointment) : onAction(appointment, action.nextStatus)}>{action.nextStatus === 'concluido' ? <CheckCircle2 size={18} /> : <Play size={18} />}{blockedByActive ? 'Outro corte em andamento' : lateMinutes > 0 && action.nextStatus === 'em_atendimento' ? 'Iniciar agora' : action.label}</Button>
      {waiting && <Button size="lg" variant="danger" aria-label={`Cancelar horário de ${appointment.cliente_nome}`} disabled={busy} onClick={() => onCancel(appointment)}><XCircle size={18} /></Button>}
      {canMarkAbsent && <Button size="lg" variant="secondary" className="col-span-2 w-full" disabled={busy} onClick={() => onAction(appointment, 'nao_compareceu')}><UserX size={18} /> Cliente não compareceu</Button>}
    </div>}
    {blockedByActive && <p className="border-t border-warning/30 bg-warning/10 px-4 py-3 text-body-sm text-warning">Abra e conclua o atendimento em andamento antes de iniciar este corte.</p>}
    {actionError && <p role="alert" className="border-t border-danger/40 bg-danger/10 px-4 py-3 text-body-sm text-danger">{actionError}</p>}
    {!isToday && action && !isActive && <p className="border-t border-line px-4 py-2 text-body-sm text-steel">As ações ficam disponíveis no dia do atendimento.</p>}
  </article>
}

function SectionNavigation({ value, onChange, sections }) {
  const columns = sections.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
  return <nav className={`mx-auto hidden w-full max-w-5xl shrink-0 gap-2 px-4 py-3 sm:grid ${columns}`} aria-label="Área do barbeiro">
      {sections.map((item) => { const Icon = item.icon; const active = value === item.value; return <button key={item.value} type="button" onClick={() => onChange(item.value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-sm border text-body-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${active ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-1 text-steel hover:text-warm-white'}`}><Icon size={17} />{item.label}</button> })}
    </nav>
}

function MobileSectionNavigation({ value, onChange, sections }) {
  const columns = sections.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
  return <nav className={`z-30 grid shrink-0 border-t border-line bg-surface-1 pb-[env(safe-area-inset-bottom)] sm:hidden ${columns}`} aria-label="Área do barbeiro">
      {sections.map((item) => { const Icon = item.icon; const active = value === item.value; return <button key={item.value} type="button" onClick={() => onChange(item.value)} className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper ${active ? 'text-copper' : 'text-steel'}`}><Icon size={21} /><span>{item.label}</span></button> })}
    </nav>
}

function PeriodNavigator({ selectedDate, onChange }) {
  return <section aria-label="Selecionar dia" className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-md border border-line bg-surface-1 p-2">
    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Dia anterior" onClick={() => onChange(deslocarDataKey(selectedDate, -1))}><ChevronLeft size={22} /></button>
    <label className="relative min-w-0 cursor-pointer text-center"><CalendarDays size={16} className="mx-auto mb-1 text-copper" aria-hidden="true" /><span className="block truncate text-body-sm font-semibold capitalize text-warm-white">{formatarDataAgenda(selectedDate)}</span><span className="text-label text-steel">{selectedDate === dataLocalKey() ? 'Hoje' : 'Toque para escolher'}</span><input type="date" value={selectedDate} onChange={(event) => event.target.value && onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher data da agenda" /></label>
    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Próximo dia" onClick={() => onChange(deslocarDataKey(selectedDate, 1))}><ChevronRight size={22} /></button>
  </section>
}

function AnalogServiceClock({ startedAt, now, durationMinutes }) {
  const started = new Date(startedAt).getTime()
  const elapsedSeconds = Number.isFinite(started) ? Math.max(0, Math.floor((now.getTime() - started) / 1000)) : 0
  const secondsAngle = (elapsedSeconds % 60) * 6
  const minutesAngle = ((elapsedSeconds / 60) % 60) * 6
  const hoursAngle = ((elapsedSeconds / 3600) % 12) * 30
  const expectedSeconds = Math.max(60, Number(durationMinutes || 0) * 60)
  const progress = Math.min(1, elapsedSeconds / expectedSeconds)
  const circumference = 2 * Math.PI * 70
  const overtime = elapsedSeconds > expectedSeconds

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(62vw,340px)]" aria-hidden="true">
      <svg viewBox="0 0 160 160" className="h-full w-full overflow-visible drop-shadow-[0_18px_40px_rgba(0,0,0,.45)]">
        <circle cx="80" cy="80" r="76" fill="var(--color-surface-1)" stroke="var(--color-line-strong)" strokeWidth="1" />
        <circle cx="80" cy="80" r="70" fill="none" stroke="var(--color-surface-3)" strokeWidth="3" />
        <circle cx="80" cy="80" r="70" fill="none" stroke={overtime ? 'var(--color-warning)' : 'var(--color-copper)'} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 80 80)" />
        {Array.from({ length: 60 }, (_, index) => {
          const major = index % 5 === 0
          return <line key={index} x1="80" y1={major ? 12 : 15} x2="80" y2={major ? 20 : 18} transform={`rotate(${index * 6} 80 80)`} stroke={major ? 'var(--color-warm-white)' : 'var(--color-steel)'} strokeWidth={major ? 1.5 : 0.7} opacity={major ? 0.8 : 0.45} />
        })}
        <text x="80" y="29" textAnchor="middle" fill="var(--color-steel)" fontSize="8" fontFamily="var(--font-mono)">12</text>
        <text x="132" y="83" textAnchor="middle" fill="var(--color-steel)" fontSize="8" fontFamily="var(--font-mono)">3</text>
        <text x="80" y="137" textAnchor="middle" fill="var(--color-steel)" fontSize="8" fontFamily="var(--font-mono)">6</text>
        <text x="28" y="83" textAnchor="middle" fill="var(--color-steel)" fontSize="8" fontFamily="var(--font-mono)">9</text>
        <line x1="80" y1="80" x2="80" y2="49" transform={`rotate(${hoursAngle} 80 80)`} stroke="var(--color-warm-white)" strokeWidth="4" strokeLinecap="round" />
        <line x1="80" y1="80" x2="80" y2="34" transform={`rotate(${minutesAngle} 80 80)`} stroke="var(--color-warm-white)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="80" y1="88" x2="80" y2="25" transform={`rotate(${secondsAngle} 80 80)`} stroke="var(--color-copper)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="80" cy="80" r="4.5" fill="var(--color-copper)" stroke="var(--color-surface-1)" strokeWidth="2" />
      </svg>
    </div>
  )
}

function ActiveAppointmentExperience({ appointment, busy, businessName, onMinimize, onComplete }) {
  const [timerNow, setTimerNow] = useState(() => new Date())
  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  const elapsed = tempoAtendimento(appointment.iniciado_em, timerNow) || '00:00:00'
  const elapsedMinutes = Math.max(0, Math.floor((timerNow.getTime() - new Date(appointment.iniciado_em).getTime()) / 60000))
  const overtime = elapsedMinutes > Number(appointment.duracao_minutos || 0)

  return (
    <section className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-warm-white" aria-label="Atendimento em andamento">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-1 px-4 py-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="min-w-0">
          <p className="text-label text-copper">ATENDIMENTO EM ANDAMENTO</p>
          <p className="mt-1 truncate text-body-sm text-steel">{businessName || 'Garagem System'}</p>
        </div>
        <button type="button" onClick={onMinimize} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-line text-steel hover:border-copper hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Minimizar atendimento" title="Minimizar atendimento">
          <Minimize2 size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-8">
        <div className="pointer-events-none absolute inset-0 opacity-30 atmosphere-vignette" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center text-center">
          <div className="mb-4 flex items-center gap-2 text-label text-steel"><Scissors size={15} className="text-copper" /> {appointment.servico_nome}</div>
          <h1 className="break-words text-display text-warm-white sm:text-[44px]">{appointment.cliente_nome}</h1>
          <div className="my-5 w-full">
            <AnalogServiceClock startedAt={appointment.iniciado_em} now={timerNow} durationMinutes={appointment.duracao_minutos} />
            <span className="mt-4 block text-label text-steel">TEMPO DE ATENDIMENTO</span>
            <time className="mt-2 block font-mono text-[38px] font-medium leading-none tabular-nums text-warm-white sm:text-[52px]" dateTime={elapsed}>{elapsed}</time>
            <p className={`mt-3 text-body-sm ${overtime ? 'text-warning' : 'text-steel'}`}>{overtime ? `${elapsedMinutes - Number(appointment.duracao_minutos || 0)} min além da previsão` : `Previsão do serviço: ${appointment.duracao_minutos} min`}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-body-sm text-steel">
            <span>Horário marcado: {formatarHorario(appointment.data_hora)}</span>
            {appointment.cliente_telefone && <a href={`tel:${appointment.cliente_telefone}`} className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line px-4 text-info"><Phone size={16} /> Ligar</a>}
          </div>
        </div>
      </div>
      <footer className="shrink-0 border-t border-line bg-surface-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto max-w-3xl"><Button size="lg" className="w-full" loading={busy} onClick={onComplete}><CheckCircle2 size={19} /> Encerrar atendimento</Button></div>
      </footer>
    </section>
  )
}

export default function BarberDashboard() {
  const navigate = useNavigate()
  const today = dataLocalKey()
  const [section, setSection] = useState('today')
  const [selectedDate, setSelectedDate] = useState(today)
  const [context, setContext] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [weekAppointments, setWeekAppointments] = useState([])
  const [availability, setAvailability] = useState([])
  const [summary, setSummary] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState('')
  const [incomingNotice, setIncomingNotice] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [completionTarget, setCompletionTarget] = useState(null)
  const [saleProduct, setSaleProduct] = useState(null)
  const [saleForm, setSaleForm] = useState({ quantidade: 1, agendamentoId: '', formaPagamento: 'pix', chaveIdempotencia: '' })
  const [saleError, setSaleError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [canAccessReception, setCanAccessReception] = useState(false)
  const [canControlTv, setCanControlTv] = useState(false)
  const [canReturnToManagement, setCanReturnToManagement] = useState(false)
  const [activeAppointment, setActiveAppointment] = useState(null)
  const [activeViewMinimized, setActiveViewMinimized] = useState(false)

  useEffect(() => {
    let active = true
    async function checkReception() {
      try { const allowed = await verificarAcessoOperadorRecepcao(); if (active) setCanAccessReception(allowed) }
      catch { if (active) setCanAccessReception(false) }
    }
    checkReception()
    window.addEventListener('focus', checkReception)
    return () => { active = false; window.removeEventListener('focus', checkReception) }
  }, [])

  useEffect(() => {
    let active = true
    async function checkManagementAccess() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (profileError) throw profileError
        if (active) setCanReturnToManagement(['admin', 'master'].includes(profile.role))
      } catch {
        if (active) setCanReturnToManagement(false)
      }
    }
    checkManagementAccess()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!activeAppointment) setActiveViewMinimized(false)
  }, [activeAppointment])

  useEffect(() => {
    let active = true
    async function checkTv() {
      try { const allowed = await verificarPermissaoTv(); if (active) setCanControlTv(allowed) }
      catch { if (active) setCanControlTv(false) }
    }
    checkTv()
    window.addEventListener('focus', checkTv)
    return () => { active = false; window.removeEventListener('focus', checkTv) }
  }, [])

  useEffect(() => {
    if (!canControlTv && section === 'tv') setSection('today')
  }, [canControlTv, section])

  const weekRange = useMemo(() => intervaloAgenda(selectedDate, 'semana'), [selectedDate])

  const loadDay = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [nextContext, nextAppointments, nextAvailability, nextActiveAppointment] = await Promise.all([
        context ? Promise.resolve(context) : carregarContextoBarbeiro(),
        listarAgendaBarbeiro(selectedDate),
        listarDisponibilidadeOperacional({ dataInicial: selectedDate, dataFinal: selectedDate }),
        carregarAtendimentoAtivo(),
      ])
      setContext(nextContext); setAppointments(nextAppointments); setAvailability((nextAvailability ?? []).filter((row) => row.profissional_id === nextContext.id)); setActiveAppointment(nextActiveAppointment)
    } catch (loadError) { setError(mensagemErroAgenda(loadError)) } finally { if (!quiet) setLoading(false) }
  }, [context, selectedDate])

  const loadSection = useCallback(async () => {
    if (section === 'today') return
    setSectionLoading(true); setError('')
    try {
      if (section === 'week') setWeekAppointments(await listarAgendaBarbeiroPeriodo(weekRange.start, weekRange.end))
      if (section === 'summary') setSummary(await carregarResumoBarbeiro(weekRange.start, weekRange.end))
      if (section === 'sales') setProducts(await listarProdutosBarbeiro())
    } catch (loadError) {
      setError(section === 'sales' ? mensagemErroProduto(loadError) : mensagemErroAgenda(loadError))
    } finally { setSectionLoading(false) }
  }, [section, weekRange.end, weekRange.start])

  useEffect(() => { loadDay() }, [loadDay])
  useEffect(() => { loadSection() }, [loadSection])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!context?.id) return undefined

    const channel = supabase
      .channel(`barbeiro-centro-operacional-${context.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agendamentos',
        filter: `profissional_id=eq.${context.id}`,
      }, (change) => {
        loadDay({ quiet: true })
        if (section === 'week' || section === 'summary') loadSection()
        if (change.eventType === 'INSERT') {
          setIncomingNotice(change.new?.origem === 'portal_cliente'
            ? 'Novo cliente agendou pelo portal. Sua agenda foi atualizada.'
            : 'Novo agendamento recebido. Sua agenda foi atualizada.')
        }
      })
      .subscribe()

    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      loadDay({ quiet: true })
      if (section === 'week' || section === 'summary') loadSection()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      supabase.removeChannel(channel)
    }
  }, [context?.id, loadDay, loadSection, section])

  const daySummary = useMemo(() => resumoAgenda(appointments), [appointments])
  const isToday = selectedDate === today
  const displayName = context?.apelido || context?.nome || 'Barbeiro'
  const selectedWeekAppointments = useMemo(() => weekAppointments.filter((item) => dataHoraLocalKey(item.data_hora) === selectedDate), [selectedDate, weekAppointments])
  const sections = canControlTv ? SECTIONS : SECTIONS.filter((item) => item.value !== 'tv')

  async function changeStatus(appointment, newStatus) {
    setBusyId(appointment.id); setError(''); setActionError(null); setNotice('')
    try {
      const updated = await mudarStatusAgendamento({ id: appointment.id, statusEsperado: appointment.status, novoStatus: newStatus })
      const applyStatus = (current) => current.map((row) => row.id === appointment.id ? { ...row, status: updated.status, iniciado_em: updated.iniciado_em } : row)
      setAppointments(applyStatus)
      setWeekAppointments(applyStatus)
      if (newStatus === 'em_atendimento') { setActiveAppointment({ ...appointment, ...updated }); setActiveViewMinimized(false) }
      setNotice(newStatus === 'cancelado'
        ? 'Horário cancelado.'
        : newStatus === 'nao_compareceu'
          ? 'Ausência registrada. O horário foi liberado para encaixe; confirme com o próximo cliente antes de adiantá-lo.'
          : 'Atendimento iniciado.'); setCancelTarget(null)
    } catch (statusError) {
      const message = mensagemErroAgenda(statusError)
      setError(message)
      setActionError({ id: appointment.id, message })
      await loadDay({ quiet: true })
    } finally { setBusyId(null) }
  }

  function openSale(product) {
    setSaleProduct(product); setSaleError('')
    setSaleForm({ quantidade: 1, agendamentoId: '', formaPagamento: 'pix', chaveIdempotencia: crypto.randomUUID() })
  }

  async function submitSale(event) {
    event.preventDefault(); setBusyId('sale'); setSaleError('')
    try {
      await venderProduto({ produtoId: saleProduct.id, ...saleForm })
      const total = Number(saleProduct.preco_venda) * Number(saleForm.quantidade)
      const productName = saleProduct.nome
      setSaleProduct(null); setNotice(`Venda de ${productName} registrada: ${formatarBRL(total)}.`)
      setProducts(await listarProdutosBarbeiro())
    } catch (saleFailure) { setSaleError(mensagemErroProduto(saleFailure)) } finally { setBusyId(null) }
  }

  async function logout() { await supabase.auth.signOut(); navigate('/login', { replace: true }) }

  const changeSection = (value) => {
    if (value !== 'week') setSelectedDate(today)
    setSection(value); setError(''); setActionError(null); setNotice('')
  }

  return <div className="flex h-[100dvh] max-w-full flex-col overflow-hidden bg-surface-0 text-warm-white">
    <header className="z-30 shrink-0 border-b border-line bg-surface-0 px-4 py-3"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><div className="min-w-0"><span className="block text-label text-copper">GARAGEM · MEU ESPAÇO</span><h1 className="mt-1 truncate text-h2 text-warm-white">Olá, {displayName}</h1></div><div className="flex items-center gap-1">{canReturnToManagement && <Button variant="secondary" size="sm" aria-label="Voltar para gestão" onClick={() => navigate('/admin/dashboard')}><LayoutDashboard size={17} /> <span className="hidden sm:inline">Gestão</span></Button>}{canAccessReception && <Button variant="secondary" size="sm" onClick={() => navigate('/reception/board')}><Headset size={17} /> Balcão</Button>}<ThemeToggle /><Button variant="ghost" size="sm" onClick={logout} aria-label="Sair do aplicativo"><LogOut size={18} /> <span className="hidden sm:inline">Sair</span></Button></div></div></header>
    <SectionNavigation value={section} sections={sections} onChange={(value) => {
      changeSection(value)
    }} />
    {incomingNotice && (
      <div role="alert" aria-live="assertive" className="fixed inset-x-3 top-20 z-[70] mx-auto max-w-lg rounded-md border-2 border-copper bg-surface-1 p-4 shadow-overlay sm:right-5 sm:left-auto sm:top-5 sm:w-[420px]">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper/15 text-copper"><BellRing size={23} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-label text-copper">NOVO HORÁRIO NA SUA AGENDA</p>
            <p className="mt-1 text-body font-semibold text-warm-white">{incomingNotice}</p>
            <p className="mt-1 text-body-sm text-steel">Confira os dados do cliente e do serviço abaixo.</p>
          </div>
          <button type="button" onClick={() => setIncomingNotice('')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Fechar aviso de novo agendamento"><X size={19} /></button>
        </div>
      </div>
    )}
    <main className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      <PushNotificationPrompt />
      {activeAppointment && activeViewMinimized && (
        <section className="flex flex-col gap-3 rounded-md border border-copper bg-copper/10 p-4 sm:flex-row sm:items-center" aria-live="polite">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper/15 text-copper"><Play size={20} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><p className="text-label text-copper">ATENDIMENTO EM ANDAMENTO</p><p className="mt-1 truncate text-body font-semibold text-warm-white">{activeAppointment.cliente_nome} · {activeAppointment.servico_nome}</p><p className="mt-1 text-body-sm text-steel">Iniciado {activeAppointment.iniciado_em ? `às ${formatarHorario(activeAppointment.iniciado_em)}` : 'agora'}. Conclua este corte antes de iniciar outro.</p></div>
          <Button variant="secondary" onClick={() => { setSelectedDate(dataHoraLocalKey(activeAppointment.data_hora)); setActiveViewMinimized(false) }}><Play size={17} /> Retomar atendimento</Button>
        </section>
      )}
      {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-body-sm text-success">{notice}</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => section === 'today' ? loadDay() : loadSection()}><RefreshCw size={15} /> Recarregar</Button></div>}

      {section === 'today' && <TodaySection selectedDate={selectedDate} setSelectedDate={setSelectedDate} appointments={appointments} activeAppointmentId={activeAppointment?.id} availability={availability} loading={loading} error={error} actionError={actionError} summary={daySummary} isToday={isToday} busyId={busyId} now={now} onWalkIn={() => setWalkInOpen(true)} onAction={changeStatus} onCancel={setCancelTarget} onComplete={setCompletionTarget} onPhotoChanged={() => loadDay({ quiet: true })} />}
      {section === 'week' && <WeekSection selectedDate={selectedDate} setSelectedDate={setSelectedDate} weekRange={weekRange} weekAppointments={weekAppointments} selectedAppointments={selectedWeekAppointments} activeAppointmentId={activeAppointment?.id} sectionLoading={sectionLoading} today={today} actionError={actionError} busyId={busyId} now={now} onAction={changeStatus} onCancel={setCancelTarget} onComplete={setCompletionTarget} onPhotoChanged={async () => { await loadDay({ quiet: true }); await loadSection() }} />}
      {section === 'summary' && <SummarySection selectedDate={selectedDate} summary={summary} loading={sectionLoading} />}
      {section === 'sales' && <SalesSection products={products} loading={sectionLoading} onSale={openSale} />}
      {section === 'tv' && <TvControlPanel />}
      </div>
    </main>
    <MobileSectionNavigation value={section} sections={sections} onChange={changeSection} />

    {activeAppointment && !activeViewMinimized && <ActiveAppointmentExperience appointment={activeAppointment} busy={busyId === activeAppointment.id} businessName={context?.barbearia_nome} onMinimize={() => setActiveViewMinimized(true)} onComplete={() => setCompletionTarget(activeAppointment)} />}

    {cancelTarget && <Modal open onClose={() => !busyId && setCancelTarget(null)} title="Cancelar horário" footer={<><Button variant="ghost" disabled={Boolean(busyId)} onClick={() => setCancelTarget(null)}>Voltar</Button><Button variant="danger" loading={busyId === cancelTarget.id} onClick={() => changeStatus(cancelTarget, 'cancelado')}>Cancelar horário</Button></>}><p className="text-body text-steel">Cancelar o horário de <strong className="text-warm-white">{cancelTarget.cliente_nome}</strong> às {formatarHorario(cancelTarget.data_hora)}? Esta ação ficará registrada na agenda.</p></Modal>}
    <WalkInModal open={walkInOpen} onClose={() => setWalkInOpen(false)} onSuccess={async (_result, slot) => { const professional = slot.profissional_apelido || slot.profissional_nome || 'barbeiro disponível'; setNotice(`Encaixe confirmado com ${professional} às ${formatarHorario(slot.inicio)}.`); if (slot.profissional_id === context?.id) setSelectedDate(dataLocalKey(new Date(slot.inicio))); await loadDay({ quiet: true }) }} />
    <CutCompletionModal open={Boolean(completionTarget)} appointment={completionTarget} onClose={() => !busyId && setCompletionTarget(null)} onSuccess={async (result) => { setCompletionTarget(null); setNotice(result?.modo === 'recepcao' ? 'Parte técnica concluída. Atendimento enviado para cobrança na recepção.' : 'Atendimento, pagamento e estoque atualizados com sucesso.'); await loadDay({ quiet: true }) }} />
    {saleProduct && <SaleModal product={saleProduct} appointments={appointments} form={saleForm} setForm={setSaleForm} error={saleError} busy={busyId === 'sale'} onClose={() => setSaleProduct(null)} onSubmit={submitSale} />}
  </div>
}

function TodaySection({ selectedDate, setSelectedDate, appointments, activeAppointmentId, availability, loading, error, actionError, summary, isToday, busyId, now, onWalkIn, onAction, onCancel, onComplete, onPhotoChanged }) {
  return <><PeriodNavigator selectedDate={selectedDate} onChange={setSelectedDate} /><Button size="lg" className="w-full" onClick={onWalkIn}><UserPlus size={18} /> Encaixe de hoje</Button><AvailabilityOverview rows={availability} loading={loading} compact title="Minha disponibilidade" />
    <section className="grid grid-cols-3 gap-2" aria-label="Resumo do dia">{[['Horários', summary.total], ['Restantes', summary.restantes], ['Concluídos', summary.concluidos]].map(([label, value]) => <div key={label} className="min-w-0 rounded-md border border-line bg-surface-1 p-3 text-center"><span className="block text-data-lg text-warm-white">{value}</span><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">{label}</span></div>)}</section>
    <section aria-label="Horários do dia" className="space-y-3">{loading ? <Loading label="Carregando sua agenda" /> : !error && appointments.length === 0 ? <EmptyState icon={isToday ? UserRound : CalendarDays} title={isToday ? 'Agenda livre hoje' : 'Nenhum horário neste dia'} description={isToday ? 'Quando um cliente for agendado para você, ele aparecerá aqui.' : 'Escolha outro dia para consultar seus atendimentos.'} /> : appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} activeAppointmentId={activeAppointmentId} isToday={isToday} busy={busyId === appointment.id} now={now} actionError={actionError?.id === appointment.id ? actionError.message : null} onAction={onAction} onCancel={onCancel} onComplete={onComplete} onPhotoChanged={onPhotoChanged} />)}</section>
  </>
}

function WeekSection({ selectedDate, setSelectedDate, weekRange, weekAppointments, selectedAppointments, activeAppointmentId, sectionLoading, today, actionError, busyId, now, onAction, onCancel, onComplete, onPhotoChanged }) {
  return <><div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-1 p-2"><Button variant="ghost" size="sm" aria-label="Semana anterior" onClick={() => setSelectedDate(deslocarDataKey(selectedDate, -7))}><ChevronLeft size={20} /></Button><div className="min-w-0 text-center"><span className="block text-h3 capitalize text-warm-white">{rotuloPeriodoAgenda(selectedDate, 'semana')}</span><span className="text-label text-steel">Sua agenda semanal</span></div><Button variant="ghost" size="sm" aria-label="Próxima semana" onClick={() => setSelectedDate(deslocarDataKey(selectedDate, 7))}><ChevronRight size={20} /></Button></div>
    {sectionLoading ? <Loading label="Carregando a semana" /> : <><section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Dias da semana">{weekRange.days.map((dateKey) => { const label = rotuloDiaCurto(dateKey); const rows = weekAppointments.filter((item) => dataHoraLocalKey(item.data_hora) === dateKey && !['cancelado', 'nao_compareceu'].includes(item.status)); const active = dateKey === selectedDate; return <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} className={`min-h-24 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${active ? 'border-copper bg-copper/10' : 'border-line bg-surface-1 hover:border-line-strong'}`}><span className={`block text-label capitalize ${active ? 'text-copper' : 'text-steel'}`}>{dateKey === today ? 'Hoje' : label.weekday}</span><span className="mt-1 block text-data-lg text-warm-white">{label.day}</span><span className="mt-2 block text-body-sm text-steel">{rows.length} {rows.length === 1 ? 'horário' : 'horários'}</span></button> })}</section>
      <section className="space-y-3"><div><span className="text-label text-copper">DETALHE DO DIA</span><h2 className="mt-1 text-h2 capitalize text-warm-white">{formatarDataAgenda(selectedDate)}</h2></div>{selectedAppointments.length === 0 ? <EmptyState icon={CalendarDays} title="Nenhum horário neste dia" description="Escolha outro dia da semana para consultar." /> : selectedAppointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} activeAppointmentId={activeAppointmentId} isToday={selectedDate === today} busy={busyId === appointment.id} now={now} actionError={actionError?.id === appointment.id ? actionError.message : null} onAction={onAction} onCancel={onCancel} onComplete={onComplete} onPhotoChanged={onPhotoChanged} />)}</section></>}
  </>
}

function SummarySection({ selectedDate, summary, loading }) {
  return <><div><span className="text-label text-copper">MEUS NÚMEROS</span><h2 className="mt-1 text-h1 text-warm-white">Resumo da semana</h2><p className="mt-1 text-body-sm capitalize text-steel">{rotuloPeriodoAgenda(selectedDate, 'semana')}</p></div>{loading || !summary ? <Loading label="Calculando seus resultados" /> : <><section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Atendimentos" value={summary.atendimentos} icon={Scissors} /><Metric label="Próximos" value={summary.proximos} icon={CalendarDays} /><Metric label="Produtos vendidos" value={summary.vendas_produtos} icon={ShoppingBag} /><Metric label="Valor movimentado" value={formatarBRL(summary.valor_total)} icon={DollarSign} /></section><section className="grid grid-cols-1 gap-3 sm:grid-cols-2"><ValueCard title="Serviços concluídos" gross={summary.valor_servicos} commission={summary.comissao_servicos} /><ValueCard title="Produtos vendidos" gross={summary.valor_produtos} commission={summary.comissao_produtos} /></section><div className="rounded-md border border-info/30 bg-info/10 p-4 text-body-sm text-info">A comissão exibida é uma projeção baseada no percentual configurado. O pagamento e a baixa financeira continuam sob controle da barbearia.</div></>}
  </>
}

function SalesSection({ products, loading, onSale }) {
  return <><div><span className="text-label text-copper">VENDA ASSISTIDA</span><h2 className="mt-1 text-h1 text-warm-white">Produtos disponíveis</h2><p className="mt-1 text-body-sm text-steel">Registre a venda, vincule ao cliente se quiser e deixe o estoque atualizado.</p></div>{loading ? <Loading label="Carregando produtos" /> : products.length === 0 ? <EmptyState icon={PackageSearch} title="Nenhum produto disponível" description="Peça ao administrador para cadastrar produtos e estoque." /> : <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Produtos para venda">{products.map((product) => <article key={product.id} className={`flex flex-col rounded-md border border-line bg-surface-1 p-4 ${product.estoque_quantidade === 0 ? 'opacity-60' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-h3 text-warm-white">{product.nome}</h3><p className="mt-1 truncate text-body-sm text-steel">{product.categoria || 'Produto'}</p></div><Badge variant={product.estoque_quantidade > 0 ? 'success' : 'danger'}>{product.estoque_quantidade > 0 ? `${product.estoque_quantidade} em estoque` : 'Sem estoque'}</Badge></div><p className="mt-5 text-data-lg text-gold-aged">{formatarBRL(product.preco_venda)}</p><p className="mt-1 text-body-sm text-steel">Sua comissão: {Number(product.comissao_percentual || 0).toLocaleString('pt-BR')}%</p><Button className="mt-4 w-full" disabled={product.estoque_quantidade === 0} onClick={() => onSale(product)}><ShoppingBag size={17} /> Registrar venda</Button></article>)}</section>}
  </>
}

function SaleModal({ product, appointments, form, setForm, error, busy, onClose, onSubmit }) {
  const [pixReady, setPixReady] = useState(false)
  const total = Number(product.preco_venda) * Number(form.quantidade || 0)

  function submit(event) {
    if (form.formaPagamento === 'pix' && !pixReady) {
      event.preventDefault()
      return
    }
    onSubmit(event)
  }

  return <Modal open onClose={() => !busy && onClose()} title="Registrar venda" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" form="sale-form" loading={busy} disabled={form.formaPagamento === 'pix' && !pixReady}>{form.formaPagamento === 'pix' ? 'Confirmar PIX' : 'Confirmar'} {formatarBRL(total)}</Button></>}><form id="sale-form" onSubmit={submit} className="space-y-4">{error && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</div>}<div className="rounded-sm border border-line bg-surface-0 p-3"><span className="text-h3 text-warm-white">{product.nome}</span><span className="mt-1 block text-body-sm text-steel">{formatarBRL(product.preco_venda)} por unidade · {product.estoque_quantidade} disponíveis</span></div><label className="block text-label text-steel"><span className="mb-2 block">Quantidade</span><input type="number" min="1" max={Math.min(100, product.estoque_quantidade)} step="1" required value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper" /></label><label className="block text-label text-steel"><span className="mb-2 block">Cliente / atendimento (opcional)</span><select value={form.agendamentoId} onChange={(event) => setForm({ ...form, agendamentoId: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"><option value="">Venda sem vínculo</option>{appointments.filter((item) => item.status !== 'cancelado').map((item) => <option key={item.id} value={item.id}>{formatarHorario(item.data_hora)} · {item.cliente_nome}</option>)}</select></label><label className="block text-label text-steel"><span className="mb-2 block">Forma de pagamento</span><select value={form.formaPagamento} onChange={(event) => setForm({ ...form, formaPagamento: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><PixPaymentPanel active={form.formaPagamento === 'pix'} amount={total} onReadyChange={setPixReady} /></form></Modal>
}

function Loading({ label }) { return <div className="flex min-h-48 items-center justify-center gap-3 text-body text-steel"><Spinner size={24} /> {label}</div> }
function Metric({ label, value, icon }) {
  const MetricIcon = icon
  return <div className="rounded-md border border-line bg-surface-1 p-4"><MetricIcon size={18} className="mb-3 text-copper" /><span className="block text-data-lg text-warm-white">{value}</span><span className="text-label text-steel">{label}</span></div>
}
function ValueCard({ title, gross, commission }) { return <section className="rounded-md border border-line bg-surface-1 p-5"><h3 className="text-h3 text-warm-white">{title}</h3><div className="mt-4 grid grid-cols-2 gap-3"><div><span className="block text-label text-steel">Valor bruto</span><span className="mt-1 block text-data-lg text-warm-white">{formatarBRL(gross)}</span></div><div><span className="block text-label text-steel">Sua comissão</span><span className="mt-1 block text-data-lg text-success">{formatarBRL(commission)}</span></div></div></section> }
