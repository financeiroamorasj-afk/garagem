import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, CalendarClock, Clock3, Coffee, Copy, Plus, RefreshCw, Save, UserRound } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { dataLocalKey } from '../lib/agenda/ui'
import { listarBarbeiros } from '../lib/barbeiros/api'
import {
  criarBloqueio,
  excluirBloqueio,
  listarBloqueios,
  listarJornadas,
  mensagemErroDisponibilidade,
  obterIntervaloAtendimentos,
  salvarIntervaloAtendimentos,
  salvarJornadas,
} from '../lib/disponibilidade/api'

const DAYS = [
  [1, 'Segunda-feira'], [2, 'Terça-feira'], [3, 'Quarta-feira'], [4, 'Quinta-feira'],
  [5, 'Sexta-feira'], [6, 'Sábado'], [0, 'Domingo'],
]

const FIELD_CLASS = 'h-10 w-full min-w-0 rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:cursor-not-allowed disabled:opacity-35'

function emptyWeek() {
  return Array.from({ length: 7 }, (_, day) => ({
    dia_semana: day,
    ativo: false,
    hora_inicio: '09:00',
    hora_fim: '19:00',
    intervalo_inicio: '',
    intervalo_fim: '',
  }))
}

function mergeWeek(rows) {
  const week = emptyWeek()
  rows.forEach((row) => {
    week[row.dia_semana] = {
      dia_semana: row.dia_semana,
      ativo: row.ativo,
      hora_inicio: String(row.hora_inicio ?? '09:00').slice(0, 5),
      hora_fim: String(row.hora_fim ?? '19:00').slice(0, 5),
      intervalo_inicio: row.intervalo_inicio ? String(row.intervalo_inicio).slice(0, 5) : '',
      intervalo_fim: row.intervalo_fim ? String(row.intervalo_fim).slice(0, 5) : '',
    }
  })
  return week
}

function displayName(professional) {
  return professional?.apelido || professional?.nome || 'Barbeiro'
}

function durationLabel(day) {
  if (!day.ativo || !day.hora_inicio || !day.hora_fim) return 'Folga'
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  let total = minutes(day.hora_fim) - minutes(day.hora_inicio)
  if (day.intervalo_inicio && day.intervalo_fim) total -= minutes(day.intervalo_fim) - minutes(day.intervalo_inicio)
  if (total <= 0) return 'Revise os horários'
  return `${Math.floor(total / 60)}h${total % 60 ? String(total % 60).padStart(2, '0') : ''}`
}

function defaultBlock() {
  const today = dataLocalKey()
  return { inicio: `${today}T12:00`, fim: `${today}T13:00`, motivo: '' }
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminAvailability() {
  const [professionals, setProfessionals] = useState([])
  const [professionalId, setProfessionalId] = useState('')
  const [week, setWeek] = useState(emptyWeek)
  const [blocks, setBlocks] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState('5')
  const [intervalLoading, setIntervalLoading] = useState(true)
  const [intervalSaving, setIntervalSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockForm, setBlockForm] = useState(defaultBlock)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    let active = true
    async function loadTeam() {
      setLoadingTeam(true)
      try {
        const rows = (await listarBarbeiros()).filter((row) => row.ativo)
        if (!active) return
        setProfessionals(rows)
        setProfessionalId((current) => current || rows[0]?.id || '')
      } catch (requestError) {
        if (active) setError(mensagemErroDisponibilidade(requestError))
      } finally {
        if (active) setLoadingTeam(false)
      }
    }
    loadTeam()
    return () => { active = false }
  }, [])

  const loadAvailability = useCallback(async () => {
    if (!professionalId) return
    setLoading(true)
    setError('')
    try {
      const [days, blockRows] = await Promise.all([
        listarJornadas(professionalId),
        listarBloqueios(professionalId),
      ])
      setWeek(mergeWeek(days ?? []))
      setBlocks(blockRows ?? [])
    } catch (requestError) {
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      setLoading(false)
    }
  }, [professionalId])

  useEffect(() => { loadAvailability() }, [loadAvailability])

  const loadInterval = useCallback(async () => {
    setIntervalLoading(true)
    try {
      const value = await obterIntervaloAtendimentos()
      setIntervalMinutes(String(value ?? 5))
    } catch (requestError) {
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      setIntervalLoading(false)
    }
  }, [])

  useEffect(() => { loadInterval() }, [loadInterval])

  const selectedProfessional = professionals.find((item) => item.id === professionalId)
  const summary = useMemo(() => ({
    workDays: week.filter((day) => day.ativo).length,
    breaks: week.filter((day) => day.ativo && day.intervalo_inicio && day.intervalo_fim).length,
    blocks: blocks.length,
  }), [blocks.length, week])

  function updateDay(dayNumber, changes) {
    setWeek((current) => current.map((day) => day.dia_semana === dayNumber ? { ...day, ...changes } : day))
    setStatus('')
  }

  function copyBusinessDays() {
    const monday = week.find((day) => day.dia_semana === 1)
    setWeek((current) => current.map((day) => day.dia_semana >= 1 && day.dia_semana <= 5
      ? { ...monday, dia_semana: day.dia_semana }
      : day))
    setStatus('Horário de segunda-feira aplicado de segunda a sexta. Salve para confirmar.')
  }

  async function saveWeek() {
    setSaving(true)
    setError('')
    try {
      await salvarJornadas({ profissionalId: professionalId, dias: week })
      setStatus(`Jornada de ${displayName(selectedProfessional)} salva.`)
      await loadAvailability()
    } catch (requestError) {
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      setSaving(false)
    }
  }

  async function saveInterval(event) {
    event.preventDefault()
    setIntervalSaving(true)
    setError('')
    setStatus('')
    try {
      const value = await salvarIntervaloAtendimentos(intervalMinutes)
      setIntervalMinutes(String(value))
      setStatus(value === 0
        ? 'Intervalo entre atendimentos desativado para novos agendamentos.'
        : `Intervalo de ${value} ${value === 1 ? 'minuto' : 'minutos'} salvo para novos agendamentos.`)
    } catch (requestError) {
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      setIntervalSaving(false)
    }
  }

  async function saveBlock(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await criarBloqueio({ profissionalId: professionalId, ...blockForm })
      setBlockOpen(false)
      setBlockForm(defaultBlock())
      setStatus('Bloqueio incluído na disponibilidade.')
      await loadAvailability()
    } catch (requestError) {
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      setSaving(false)
    }
  }

  async function removeBlock() {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    try {
      await excluirBloqueio(deleteTarget.id)
      setDeleteTarget(null)
      setStatus('Bloqueio removido.')
      await loadAvailability()
    } catch (requestError) {
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 block text-label text-copper">AGENDA DA EQUIPE</span>
          <h1 className="text-h1 text-warm-white sm:text-display">Jornada e disponibilidade</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Configure expediente, intervalos, folgas e ausências antes de liberar encaixes.</p>
        </div>
        <label className="block w-full text-label text-steel lg:max-w-sm">
          <span className="mb-2 flex items-center gap-2"><UserRound size={15} /> Barbeiro</span>
          <select value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setStatus('') }} disabled={loadingTeam || professionals.length === 0} className={FIELD_CLASS}>
            {professionals.length === 0 && <option value="">Nenhum barbeiro ativo</option>}
            {professionals.map((professional) => <option key={professional.id} value={professional.id}>{displayName(professional)}</option>)}
          </select>
        </label>
      </header>

      {status && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{status}</div>}
      {error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => { loadInterval(); loadAvailability() }}><RefreshCw size={15} /> Tentar novamente</Button></div>}

      <section aria-labelledby="appointment-interval-title">
        <Card className="p-5 sm:p-6">
          <form className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between" onSubmit={saveInterval}>
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-copper/30 bg-copper/10 text-copper"><Clock3 size={20} /></span>
                <div><h2 id="appointment-interval-title" className="text-h2 text-warm-white">Intervalo entre atendimentos</h2><p className="mt-1 text-body-sm text-steel">Tempo reservado após cada serviço para limpeza, organização ou preparação do próximo cliente.</p></div>
              </div>
              <p className="mt-4 text-body-sm text-steel">A mudança atualiza os horários disponíveis no portal, nos encaixes e nos novos agendamentos. Horários já marcados mantêm o intervalo original.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:max-w-md">
              <div className="min-w-0 flex-1">
                <Input label="Minutos" type="number" min="0" max="60" step="1" inputMode="numeric" value={intervalMinutes} onChange={(event) => { setIntervalMinutes(event.target.value); setStatus('') }} helpText="Use 0 para não reservar intervalo." required disabled={intervalLoading || intervalSaving} />
              </div>
              <Button type="submit" loading={intervalSaving} disabled={intervalLoading}><Save size={16} /> Salvar intervalo</Button>
            </div>
          </form>
        </Card>
      </section>

      {!loadingTeam && professionals.length === 0 ? (
        <Card><EmptyState icon={UserRound} title="Nenhum barbeiro ativo" description="Cadastre ou reative um barbeiro antes de configurar a jornada." /></Card>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2 sm:max-w-2xl sm:gap-4" aria-label="Resumo da disponibilidade">
            <Card className="p-3 sm:p-5"><CalendarClock size={18} className="mb-2 text-copper" /><span className="block text-data-lg text-warm-white">{summary.workDays}</span><span className="text-label text-steel">Dias ativos</span></Card>
            <Card className="p-3 sm:p-5"><Coffee size={18} className="mb-2 text-info" /><span className="block text-data-lg text-warm-white">{summary.breaks}</span><span className="text-label text-steel">Intervalos</span></Card>
            <Card className="p-3 sm:p-5"><Ban size={18} className="mb-2 text-warning" /><span className="block text-data-lg text-warm-white">{summary.blocks}</span><span className="text-label text-steel">Bloqueios</span></Card>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="text-h1 text-warm-white">Semana padrão</h2><p className="mt-1 text-body-sm text-steel">Folgas não geram horários disponíveis.</p></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button variant="secondary" onClick={copyBusinessDays} disabled={loading || saving}><Copy size={16} /> Repetir seg–sex</Button><Button onClick={saveWeek} loading={saving} disabled={loading || !professionalId}><Save size={16} /> Salvar jornada</Button></div>
            </div>

            {loading ? <Card className="flex min-h-56 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Carregando jornada</Card> : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {DAYS.map(([number, label]) => {
                  const day = week[number]
                  return <DayCard key={number} label={label} day={day} disabled={saving} onChange={(changes) => updateDay(number, changes)} />
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3"><div><h2 className="text-h1 text-warm-white">Folgas e bloqueios pontuais</h2><p className="mt-1 text-body-sm text-steel">Use para consultas, férias, compromissos e ausências.</p></div><Button size="sm" onClick={() => { setBlockForm(defaultBlock()); setBlockOpen(true); setError('') }} disabled={!professionalId}><Plus size={15} /> Novo bloqueio</Button></div>
            {loading ? null : blocks.length === 0 ? <Card><EmptyState icon={Ban} title="Nenhum bloqueio futuro" description="Apenas a jornada semanal está sendo considerada para este barbeiro." /></Card> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{blocks.map((block) => <Card key={block.id} className="flex items-start gap-3 p-4"><div className="rounded-sm bg-warning/10 p-2 text-warning"><Ban size={18} /></div><div className="min-w-0 flex-1"><p className="text-body font-semibold text-warm-white">{formatDateTime(block.inicio)}</p><p className="text-body-sm text-steel">até {formatDateTime(block.fim)}</p><p className="mt-2 truncate text-body-sm text-steel">{block.motivo || 'Sem motivo informado'}</p></div><Button size="sm" variant="danger" onClick={() => setDeleteTarget(block)}>Excluir</Button></Card>)}</div>}
          </section>
        </>
      )}

      <Modal open={blockOpen} onClose={() => !saving && setBlockOpen(false)} title="Novo bloqueio" footer={<><Button variant="ghost" onClick={() => setBlockOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" form="block-form" loading={saving}>Salvar bloqueio</Button></>}>
        <form id="block-form" className="space-y-4" onSubmit={saveBlock}>
          <Input label="Início" type="datetime-local" required value={blockForm.inicio} onChange={(event) => setBlockForm({ ...blockForm, inicio: event.target.value })} disabled={saving} />
          <Input label="Término" type="datetime-local" required value={blockForm.fim} onChange={(event) => setBlockForm({ ...blockForm, fim: event.target.value })} disabled={saving} />
          <Input label="Motivo (opcional)" maxLength={200} value={blockForm.motivo} onChange={(event) => setBlockForm({ ...blockForm, motivo: event.target.value })} placeholder="Ex.: consulta médica" disabled={saving} />
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} title="Excluir bloqueio" footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancelar</Button><Button variant="danger" loading={saving} onClick={removeBlock}>Excluir</Button></>}>
        <p className="text-body text-steel">O período voltará a ser considerado disponível conforme a jornada semanal.</p>
      </Modal>
    </div>
  )
}

function DayCard({ label, day, disabled, onChange }) {
  const hasBreak = Boolean(day.intervalo_inicio || day.intervalo_fim)
  return (
    <Card className={`p-4 sm:p-5 ${day.ativo ? '' : 'opacity-70'}`}>
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-h3 text-warm-white">{label}</h3><p className="mt-1 text-label text-steel">{durationLabel(day)}</p></div>
        <button type="button" role="switch" aria-checked={day.ativo} disabled={disabled} onClick={() => onChange({ ativo: !day.ativo })} className={`min-h-10 rounded-sm border px-4 text-label font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${day.ativo ? 'border-success/50 bg-success/10 text-success' : 'border-line bg-surface-0 text-steel'}`}>{day.ativo ? 'Trabalha' : 'Folga'}</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <TimeField label="Entrada" value={day.hora_inicio} disabled={disabled || !day.ativo} onChange={(value) => onChange({ hora_inicio: value })} />
        <TimeField label="Saída" value={day.hora_fim} disabled={disabled || !day.ativo} onChange={(value) => onChange({ hora_fim: value })} />
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <label className="flex min-h-10 items-center gap-3 text-body-sm text-steel"><input type="checkbox" checked={hasBreak} disabled={disabled || !day.ativo} onChange={(event) => onChange(event.target.checked ? { intervalo_inicio: '12:00', intervalo_fim: '13:00' } : { intervalo_inicio: '', intervalo_fim: '' })} className="h-5 w-5 accent-copper" /> Possui intervalo</label>
        {hasBreak && <div className="mt-3 grid grid-cols-2 gap-3"><TimeField label="Início do intervalo" value={day.intervalo_inicio} disabled={disabled || !day.ativo} onChange={(value) => onChange({ intervalo_inicio: value })} /><TimeField label="Fim do intervalo" value={day.intervalo_fim} disabled={disabled || !day.ativo} onChange={(value) => onChange({ intervalo_fim: value })} /></div>}
      </div>
    </Card>
  )
}

function TimeField({ label, value, disabled, onChange }) {
  return <label className="min-w-0 text-label text-steel"><span className="mb-2 flex items-center gap-2"><Clock3 size={13} /> {label}</span><input type="time" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={FIELD_CLASS} /></label>
}
