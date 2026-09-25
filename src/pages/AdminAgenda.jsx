import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Phone,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  MonitorUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Badge from '../components/ui/Badge'
import AddAppointmentModal from '../components/AddAppointmentModal'
import WalkInModal from '../components/WalkInModal'
import AvailabilityOverview from '../components/AvailabilityOverview'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { listarAgendaAdminPeriodo } from '../lib/agenda/api'
import { criarHorarioExtra, listarHorariosExtras, mensagemErroHorarioExtra } from '../lib/agenda/extra-api'
import {
  dataHoraLocalKey,
  dataLocalKey,
  deslocarVisualizacao,
  intervaloAgenda,
  mensagemErroAgenda,
  rotuloPeriodoAgenda,
  statusAgenda,
} from '../lib/agenda/ui'
import { listarBarbeiros } from '../lib/barbeiros/api'
import { listarDisponibilidadeOperacional } from '../lib/disponibilidade/api'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = [
  ['todos', 'Todos os status'],
  ['pendente', 'Pendentes'],
  ['confirmado', 'Confirmados'],
  ['em_atendimento', 'Em atendimento'],
  ['aguardando_pagamento', 'Aguardando cobrança'],
  ['concluido', 'Concluídos'],
  ['cancelado', 'Cancelados'],
  ['encaixe', 'Encaixes'],
]

const VIEW_OPTIONS = [
  ['dia', 'Dia'],
  ['semana', 'Semana'],
  ['mes', 'Mês'],
]

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

function formatarHorario(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function nomeProfissional(row) {
  return row.profissional_apelido || row.profissional_nome || 'Profissional'
}

function normalizarBusca(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

function rotuloDiaCurto(data) {
  const [year, month, day] = data.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(year, month - 1, day))
}

function numeroDia(data) {
  return Number(data.slice(-2))
}

function corStatus(status) {
  if (status === 'concluido') return 'bg-success'
  if (status === 'cancelado') return 'bg-danger'
  if (status === 'em_atendimento') return 'bg-copper'
  if (status === 'confirmado') return 'bg-info'
  return 'bg-warning'
}

function AgendaItem({ appointment }) {
  const status = statusAgenda(appointment.status)
  return (
    <article className={`rounded-md border bg-surface-0 p-4 ${appointment.status === 'em_atendimento' ? 'border-copper' : 'border-line'}`}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-sm bg-surface-2 text-copper">
          <Clock3 size={14} aria-hidden="true" />
          <time className="mt-1 text-data" dateTime={appointment.data_hora}>{formatarHorario(appointment.data_hora)}</time>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h3 className="truncate text-h3 text-warm-white">{appointment.cliente_nome}</h3>
            <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-body-sm font-semibold text-copper">{nomeProfissional(appointment)}</p>
          <p className="mt-2 flex min-w-0 items-center gap-2 text-body-sm text-steel">
            <Scissors size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{appointment.servico_nome}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{appointment.duracao_minutos} min</span>
          </p>
          {appointment.cliente_telefone && (
            <a href={`tel:${appointment.cliente_telefone}`} className="mt-2 inline-flex min-h-10 items-center gap-2 text-body-sm text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              <Phone size={14} aria-hidden="true" /> Ligar
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function CompactAppointment({ appointment }) {
  return (
    <div className={`rounded-sm border bg-surface-0 p-2 ${appointment.status === 'em_atendimento' ? 'border-copper' : 'border-line'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${corStatus(appointment.status)}`} aria-hidden="true" />
        <time className="shrink-0 text-data text-copper" dateTime={appointment.data_hora}>{formatarHorario(appointment.data_hora)}</time>
      </div>
      <p className="mt-1 truncate text-body-sm font-semibold text-warm-white">{appointment.cliente_nome}</p>
      <p className="truncate text-[11px] text-steel">{nomeProfissional(appointment)}</p>
    </div>
  )
}

function DayView({ appointments }) {
  if (appointments.length === 0) return <EmptyCalendar />
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {appointments.map((appointment) => <AgendaItem key={appointment.id} appointment={appointment} />)}
    </div>
  )
}

function WeekView({ days, appointmentsByDay, today }) {
  const hasAppointments = days.some((day) => (appointmentsByDay.get(day) ?? []).length > 0)
  if (!hasAppointments) return <EmptyCalendar />
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
      {days.map((day) => {
        const rows = appointmentsByDay.get(day) ?? []
        return (
          <section key={day} className={`min-w-0 rounded-md border bg-surface-1 p-3 ${day === today ? 'border-copper' : 'border-line'}`}>
            <header className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2 lg:block">
              <h2 className="text-label text-warm-white lg:text-center">{rotuloDiaCurto(day)}</h2>
              <Badge variant={rows.length ? 'info' : 'neutral'} className="lg:mx-auto lg:mt-2 lg:flex lg:w-fit">{rows.length}</Badge>
            </header>
            {rows.length === 0 ? (
              <p className="py-4 text-center text-body-sm text-steel">Livre</p>
            ) : (
              <div className="space-y-2">{rows.map((row) => <CompactAppointment key={row.id} appointment={row} />)}</div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function MonthView({ days, selectedDate, appointmentsByDay, today, onOpenDay }) {
  const selectedMonth = selectedDate.slice(0, 7)
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface-1">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {WEEKDAYS.map((day) => <div key={day} className="px-1 py-2 text-center text-[10px] font-semibold tracking-[0.08em] text-steel sm:text-label">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const rows = appointmentsByDay.get(day) ?? []
          const outsideMonth = day.slice(0, 7) !== selectedMonth
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={`${rotuloDiaCurto(day)}: ${rows.length} ${rows.length === 1 ? 'horário' : 'horários'}`}
              className={`min-h-18 min-w-0 border-b border-r border-line p-1 text-left align-top transition-colors hover:bg-surface-2 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper sm:min-h-28 sm:p-2 ${outsideMonth ? 'bg-surface-0/60 text-steel' : 'text-warm-white'} ${day === today ? 'bg-copper/8' : ''}`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-data ${day === today ? 'bg-copper text-surface-0' : ''}`}>{numeroDia(day)}</span>
              <span className="mt-1 flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                {rows.slice(0, 4).map((row) => <span key={row.id} className={`h-1.5 w-1.5 rounded-full ${corStatus(row.status)}`} />)}
              </span>
              <span className="mt-1 hidden space-y-1 sm:block" aria-hidden="true">
                {rows.slice(0, 2).map((row) => (
                  <span key={row.id} className="block truncate rounded-sm bg-surface-3 px-1 py-0.5 text-[10px] text-warm-white">
                    {formatarHorario(row.data_hora)} {row.cliente_nome}
                  </span>
                ))}
                {rows.length > 2 && <span className="block text-[10px] text-steel">+{rows.length - 2} horários</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyCalendar() {
  return (
    <Card>
      <EmptyState icon={CalendarDays} title="Nenhum horário encontrado" description="Não há atendimentos para este período e combinação de filtros." />
    </Card>
  )
}

export default function AdminAgenda() {
  const navigate = useNavigate()
  const today = dataLocalKey()
  const [selectedDate, setSelectedDate] = useState(today)
  const [view, setView] = useState('semana')
  const [professionalFilter, setProfessionalFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [clientQuery, setClientQuery] = useState('')
  const [appointments, setAppointments] = useState([])
  const [extraHours, setExtraHours] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [availability, setAvailability] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [appointmentOpen, setAppointmentOpen] = useState(false)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [extraOpen, setExtraOpen] = useState(false)
  const [savingExtra, setSavingExtra] = useState(false)
  const [extraError, setExtraError] = useState('')
  const [extraForm, setExtraForm] = useState({
    date: today,
    start: '19:00',
    end: '21:00',
    professionalId: 'todos',
    reason: '',
  })
  const range = useMemo(() => intervaloAgenda(selectedDate, view), [selectedDate, view])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [rows, team, extras, operationalAvailability] = await Promise.all([
        listarAgendaAdminPeriodo(range.start, range.end),
        professionals.length ? Promise.resolve(professionals) : listarBarbeiros({ incluirInativos: true }),
        listarHorariosExtras({ dataInicial: range.start, dataFinal: range.end }),
        listarDisponibilidadeOperacional({ dataInicial: range.start, dataFinal: range.end }),
      ])
      setAppointments(rows)
      setProfessionals(team)
      setExtraHours(extras)
      setAvailability(operationalAvailability)
    } catch (loadError) {
      setError(mensagemErroAgenda(loadError))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [professionals, range.end, range.start])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('admin-agenda-geral')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => load({ quiet: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_horarios_extras' }, () => load({ quiet: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profissionais_jornadas' }, () => load({ quiet: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profissionais_bloqueios' }, () => load({ quiet: true }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const visibleAppointments = useMemo(() => {
    const query = normalizarBusca(clientQuery)
    return appointments.filter((row) => (
      (professionalFilter === 'todos' || row.profissional_id === professionalFilter)
      && (statusFilter === 'todos' || row.status === statusFilter)
      && (!query || normalizarBusca(`${row.cliente_nome} ${row.cliente_telefone ?? ''}`).includes(query))
    ))
  }, [appointments, clientQuery, professionalFilter, statusFilter])

  const appointmentsByDay = useMemo(() => {
    const map = new Map(range.days.map((day) => [day, []]))
    visibleAppointments.forEach((row) => {
      const day = dataHoraLocalKey(row.data_hora)
      if (map.has(day)) map.get(day).push(row)
    })
    return map
  }, [range.days, visibleAppointments])

  const summary = useMemo(() => ({
    total: visibleAppointments.filter((row) => row.status !== 'cancelado').length,
    waiting: visibleAppointments.filter((row) => ['pendente', 'confirmado', 'encaixe'].includes(row.status)).length,
    active: visibleAppointments.filter((row) => row.status === 'em_atendimento').length,
    done: visibleAppointments.filter((row) => row.status === 'concluido').length,
  }), [visibleAppointments])

  const visibleExtraHours = useMemo(() => extraHours.filter((row) => (
    professionalFilter === 'todos'
    || row.profissional_id == null
    || row.profissional_id === professionalFilter
  )), [extraHours, professionalFilter])

  const visibleAvailability = useMemo(() => availability.filter((row) => (
    professionalFilter === 'todos' || row.profissional_id === professionalFilter
  )), [availability, professionalFilter])

  function openExtraHours() {
    setExtraError('')
    setExtraForm((current) => ({ ...current, date: selectedDate }))
    setExtraOpen(true)
  }

  async function saveExtraHours(event) {
    event.preventDefault()
    setSavingExtra(true)
    setExtraError('')
    try {
      await criarHorarioExtra({
        data: extraForm.date,
        horaInicio: extraForm.start,
        horaFim: extraForm.end,
        profissionalId: extraForm.professionalId === 'todos' ? null : extraForm.professionalId,
        motivo: extraForm.reason,
      })
      setExtraOpen(false)
      setNotice('Horário extra liberado e incluído na agenda.')
      await load({ quiet: true })
    } catch (saveError) {
      setExtraError(mensagemErroHorarioExtra(saveError))
    } finally {
      setSavingExtra(false)
    }
  }

  function extraProfessionalName(row) {
    if (!row.profissional_id) return 'Toda a equipe'
    const professional = professionals.find((item) => item.id === row.profissional_id)
    return professional?.apelido || professional?.nome || 'Barbeiro'
  }

  function openDay(day) {
    setSelectedDate(day)
    setView('dia')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-2 block text-label text-copper">OPERAÇÃO DA EQUIPE</span>
          <h1 className="text-h1 text-warm-white sm:text-display">Agenda geral</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Consulte os horários da equipe por dia, semana ou mês.</p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/agenda/tv')}><MonitorUp size={16} /> Modo TV</Button>
            <Button size="sm" variant="secondary" onClick={() => setWalkInOpen(true)}><UserPlus size={16} /> Encaixe</Button>
            <Button size="sm" variant="secondary" onClick={openExtraHours}><Clock3 size={16} /> Horário extra</Button>
            <Button size="sm" onClick={() => setAppointmentOpen(true)}><Plus size={16} /> Novo corte</Button>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-line bg-surface-1 p-1" aria-label="Visualização da agenda">
            {VIEW_OPTIONS.map(([value, label]) => (
              <Button key={value} size="sm" variant={view === value ? 'secondary' : 'ghost'} aria-pressed={view === value} onClick={() => setView(value)}>{label}</Button>
            ))}
          </div>
        </div>
      </header>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-success/40 bg-success/10 p-4 text-body-sm text-success">
          <span>{notice}</span>
          <button type="button" className="min-h-10 px-2 text-label" onClick={() => setNotice('')}>Fechar</button>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-2 sm:flex-row sm:items-center" aria-label="Navegação do calendário">
        <div className="grid flex-1 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Período anterior" onClick={() => setSelectedDate(deslocarVisualizacao(selectedDate, view, -1))}>
            <ChevronLeft size={22} />
          </button>
          <label className="relative min-w-0 cursor-pointer text-center">
            <span className="block truncate text-h3 capitalize text-warm-white">{rotuloPeriodoAgenda(selectedDate, view)}</span>
            <span className="text-label text-steel">Toque para escolher uma data</span>
            <input type="date" value={selectedDate} onChange={(event) => event.target.value && setSelectedDate(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher data da agenda geral" />
          </label>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Próximo período" onClick={() => setSelectedDate(deslocarVisualizacao(selectedDate, view, 1))}>
            <ChevronRight size={22} />
          </button>
        </div>
        <Button size="sm" variant="ghost" className="w-full sm:w-auto" disabled={selectedDate === today} onClick={() => setSelectedDate(today)}>Hoje</Button>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4" aria-label="Resumo da agenda">
        {[
          ['Horários', summary.total, <CalendarDays size={17} className="mb-2 text-copper" aria-hidden="true" />],
          ['Aguardando', summary.waiting, <Clock3 size={17} className="mb-2 text-warning" aria-hidden="true" />],
          ['Atendendo', summary.active, <Users size={17} className="mb-2 text-info" aria-hidden="true" />],
          ['Concluídos', summary.done, <CheckCircle2 size={17} className="mb-2 text-success" aria-hidden="true" />],
        ].map(([label, value, icon]) => (
          <Card key={label} className="min-w-0 p-3 sm:p-5">
            {icon}
            <span className="block text-data-lg text-warm-white">{value}</span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-steel sm:text-label">{label}</span>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-md border border-line bg-surface-1 p-4 md:grid-cols-3" aria-label="Filtros da agenda">
        <Input label="Buscar cliente" icon={Search} type="search" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Nome ou telefone" />
        <label className="min-w-0 text-label text-steel">
          <span className="mb-2 flex items-center gap-2"><Filter size={14} /> Barbeiro</span>
          <select value={professionalFilter} onChange={(event) => setProfessionalFilter(event.target.value)} className="h-10 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">
            <option value="todos">Toda a equipe</option>
            {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.apelido || professional.nome}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-label text-steel">
          <span className="mb-2 flex items-center gap-2"><Filter size={14} /> Situação</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      {!loading && !error && (
        <AvailabilityOverview rows={visibleAvailability} title="Disponibilidade e conflitos da equipe" />
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={() => load()}><RefreshCw size={15} /> Tentar novamente</Button>
        </div>
      )}

      {!loading && !error && visibleExtraHours.length > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 size={18} className="text-copper" aria-hidden="true" />
            <h2 className="text-h3 text-warm-white">Horários extras no período</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visibleExtraHours.map((row) => (
              <article key={row.id} className="min-w-0 rounded-sm border border-line bg-surface-0 p-3">
                <p className="text-data text-copper">{row.data.split('-').reverse().join('/')} · {String(row.hora_inicio).slice(0, 5)}–{String(row.hora_fim).slice(0, 5)}</p>
                <p className="mt-1 truncate text-body-sm font-semibold text-warm-white">{extraProfessionalName(row)}</p>
                {row.motivo && <p className="mt-1 truncate text-body-sm text-steel">{row.motivo}</p>}
              </article>
            ))}
          </div>
        </Card>
      )}

      <section aria-label="Calendário da equipe">
        {loading ? (
          <Card className="flex min-h-64 items-center justify-center gap-3 text-body text-steel"><Spinner size={24} /> Carregando calendário</Card>
        ) : error ? null : view === 'dia' ? (
          <DayView appointments={appointmentsByDay.get(selectedDate) ?? []} />
        ) : view === 'semana' ? (
          <WeekView days={range.days} appointmentsByDay={appointmentsByDay} today={today} />
        ) : (
          <MonthView days={range.days} selectedDate={selectedDate} appointmentsByDay={appointmentsByDay} today={today} onOpenDay={openDay} />
        )}
      </section>

      <AddAppointmentModal
        isOpen={appointmentOpen}
        onClose={() => setAppointmentOpen(false)}
        initialDate={selectedDate}
        onSuccess={async () => {
          setNotice('Novo corte incluído na agenda.')
          await load({ quiet: true })
        }}
      />

      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        initialDate={selectedDate >= today ? selectedDate : today}
        onSuccess={async (_result, slot) => {
          const slotDay = dataHoraLocalKey(slot.inicio)
          setSelectedDate(slotDay)
          setView('dia')
          setNotice(`Encaixe confirmado para ${nomeProfissional(slot)} às ${formatarHorario(slot.inicio)}.`)
          await load({ quiet: true })
        }}
      />

      <Modal
        open={extraOpen}
        onClose={() => !savingExtra && setExtraOpen(false)}
        title="Liberar horário extra"
        footer={(
          <>
            <Button type="button" variant="secondary" disabled={savingExtra} onClick={() => setExtraOpen(false)}>Cancelar</Button>
            <Button type="submit" form="extra-hours-form" loading={savingExtra}>Liberar horário</Button>
          </>
        )}
      >
        <form id="extra-hours-form" className="space-y-4" onSubmit={saveExtraHours}>
          {extraError && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{extraError}</p>}
          <Input label="Data" type="date" required value={extraForm.date} onChange={(event) => setExtraForm((current) => ({ ...current, date: event.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="time" required value={extraForm.start} onChange={(event) => setExtraForm((current) => ({ ...current, start: event.target.value }))} />
            <Input label="Fim" type="time" required value={extraForm.end} onChange={(event) => setExtraForm((current) => ({ ...current, end: event.target.value }))} />
          </div>
          <label className="block text-label text-steel">
            <span className="mb-2 block">Disponível para</span>
            <select value={extraForm.professionalId} onChange={(event) => setExtraForm((current) => ({ ...current, professionalId: event.target.value }))} className="h-10 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              <option value="todos">Toda a equipe</option>
              {professionals.filter((professional) => professional.ativo).map((professional) => <option key={professional.id} value={professional.id}>{professional.apelido || professional.nome}</option>)}
            </select>
          </label>
          <Input label="Motivo (opcional)" maxLength={200} value={extraForm.reason} onChange={(event) => setExtraForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Ex.: demanda de sábado" />
        </form>
      </Modal>
    </div>
  )
}
