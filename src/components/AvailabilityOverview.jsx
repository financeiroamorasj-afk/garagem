import { AlertTriangle, Ban, CalendarClock, Clock3, Coffee } from 'lucide-react'
import Badge from './ui/Badge'
import Card from './ui/Card'
import EmptyState from './ui/EmptyState'
import Spinner from './ui/Spinner'

function time(value) {
  return value ? String(value).slice(0, 5) : ''
}

function timeStamp(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function dateLabel(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date(year, month - 1, day))
    .replace('.', '')
}

function professionalName(row) {
  return row.profissional_apelido || row.profissional_nome || 'Barbeiro'
}

function AvailabilityCard({ row, showProfessional }) {
  const extras = row.horarios_extras ?? []
  const blocks = row.bloqueios ?? []
  const conflicts = row.conflitos ?? []
  const available = row.jornada_ativa || extras.length > 0

  return (
    <article className={`min-w-0 rounded-md border bg-surface-1 p-4 ${conflicts.length ? 'border-danger/70' : 'border-line'}`}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label capitalize text-steel">{dateLabel(row.data)}</p>
          {showProfessional && <h3 className="mt-1 truncate text-h3 text-warm-white">{professionalName(row)}</h3>}
        </div>
        <Badge variant={conflicts.length ? 'danger' : available ? 'success' : 'neutral'}>
          {conflicts.length ? `${conflicts.length} conflito${conflicts.length > 1 ? 's' : ''}` : available ? 'Disponível' : 'Folga'}
        </Badge>
      </header>

      <div className="mt-4 space-y-2 text-body-sm">
        {row.jornada_ativa ? (
          <p className="flex items-center gap-2 text-warm-white"><Clock3 size={15} className="text-copper" /> Expediente {time(row.hora_inicio)}–{time(row.hora_fim)}</p>
        ) : (
          <p className="flex items-center gap-2 text-steel"><CalendarClock size={15} /> Sem expediente regular</p>
        )}
        {row.intervalo_inicio && <p className="flex items-center gap-2 text-steel"><Coffee size={15} className="text-info" /> Intervalo {time(row.intervalo_inicio)}–{time(row.intervalo_fim)}</p>}
        {extras.map((extra) => <p key={extra.id} className="flex items-center gap-2 text-success"><Clock3 size={15} /> Extra {time(extra.inicio)}–{time(extra.fim)}{extra.motivo ? ` · ${extra.motivo}` : ''}</p>)}
        {blocks.map((block) => <p key={block.id} className="flex items-start gap-2 text-warning"><Ban size={15} className="mt-0.5 shrink-0" /><span>Bloqueio {timeStamp(block.inicio)}–{timeStamp(block.fim)}{block.motivo ? ` · ${block.motivo}` : ''}</span></p>)}
      </div>

      {conflicts.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-danger/30 pt-3">
          {conflicts.map((conflict) => (
            <div key={conflict.agendamento_id} className="rounded-sm bg-danger/10 p-3 text-body-sm text-danger">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} /> {timeStamp(conflict.inicio)} · {conflict.cliente}</p>
              <p className="mt-1">{(conflict.motivos ?? []).join(' · ')}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default function AvailabilityOverview({ rows = [], loading = false, compact = false, title = 'Disponibilidade da equipe' }) {
  const conflicts = rows.reduce((total, row) => total + (row.conflitos?.length ?? 0), 0)
  const daysOff = rows.filter((row) => !row.jornada_ativa && !(row.horarios_extras?.length)).length

  if (loading) return <Card className="flex min-h-32 items-center justify-center gap-3 text-body-sm text-steel"><Spinner size={20} /> Verificando disponibilidade</Card>
  if (rows.length === 0) return <Card><EmptyState icon={CalendarClock} className="py-10" title="Disponibilidade não configurada" description="Defina a jornada para que folgas e conflitos apareçam na agenda." /></Card>

  return (
    <section aria-label={title}>
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={compact ? 'text-h3 text-warm-white' : 'text-h1 text-warm-white'}>{title}</h2>
          <p className="mt-1 text-body-sm text-steel">Expediente, intervalos, extras, folgas e bloqueios considerados pela agenda.</p>
        </div>
        <div className="flex gap-2">
          {daysOff > 0 && <Badge variant="neutral">{daysOff} folga{daysOff > 1 ? 's' : ''}</Badge>}
          <Badge variant={conflicts ? 'danger' : 'success'}>{conflicts ? `${conflicts} conflito${conflicts > 1 ? 's' : ''}` : 'Sem conflitos'}</Badge>
        </div>
      </header>
      <div className={`${compact ? 'grid-cols-1' : 'max-h-[32rem] grid-cols-1 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3'} grid gap-3`}>
        {rows.map((row) => <AvailabilityCard key={`${row.data}-${row.profissional_id}`} row={row} showProfessional={!compact} />)}
      </div>
    </section>
  )
}
