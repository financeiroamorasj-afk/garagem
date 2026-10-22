import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Ban, CalendarClock, Clock3, Coffee, Copy, Plus, RefreshCw, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import {
  analisarMeuBloqueio,
  analisarMinhaJornada,
  criarMeuBloqueio,
  excluirMeuBloqueio,
  listarMeusBloqueios,
  listarMinhasJornadas,
  mensagemErroDisponibilidade,
  obterContextoMinhaDisponibilidade,
  salvarMinhasJornadas,
} from '../lib/disponibilidade/api'

const DAYS = [
  [1, 'Segunda-feira'], [2, 'Terça-feira'], [3, 'Quarta-feira'], [4, 'Quinta-feira'],
  [5, 'Sexta-feira'], [6, 'Sábado'], [0, 'Domingo'],
]
const FIELD_CLASS = 'h-10 w-full min-w-0 rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:cursor-not-allowed disabled:opacity-35'

function emptyWeek() {
  return Array.from({ length: 7 }, (_, day) => ({ dia_semana: day, ativo: false, hora_inicio: '09:00', hora_fim: '19:00', intervalo_inicio: '', intervalo_fim: '' }))
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

function localDateTime(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function defaultBlock() {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + 60 * 60000)
  return { inicio: localDateTime(start), fim: localDateTime(end), motivo: '' }
}

function durationLabel(day) {
  if (!day.ativo || !day.hora_inicio || !day.hora_fim) return 'Folga'
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  let total = minutes(day.hora_fim) - minutes(day.hora_inicio)
  if (day.intervalo_inicio && day.intervalo_fim) total -= minutes(day.intervalo_fim) - minutes(day.intervalo_inicio)
  return total > 0 ? `${Math.floor(total / 60)}h${total % 60 ? String(total % 60).padStart(2, '0') : ''}` : 'Revise os horários'
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function linkLabel(tipo) {
  return { clt: 'CLT', freelancer: 'Freelancer', pj: 'PJ', parceiro: 'Parceiro', outro: 'Outro vínculo' }[tipo] || tipo
}

export default function BarberAvailability() {
  const navigate = useNavigate()
  const [context, setContext] = useState(null)
  const [week, setWeek] = useState(emptyWeek)
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockForm, setBlockForm] = useState(defaultBlock)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [conflict, setConflict] = useState(null)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const currentContext = await obterContextoMinhaDisponibilidade()
      setContext(currentContext)
      const [daysResult, blocksResult] = await Promise.allSettled([
        listarMinhasJornadas(currentContext.profissional_id),
        listarMeusBloqueios({ profissionalId: currentContext.profissional_id }),
      ])
      if (daysResult.status === 'fulfilled') setWeek(mergeWeek(daysResult.value ?? []))
      if (blocksResult.status === 'fulfilled') setBlocks(blocksResult.value ?? [])
      if (daysResult.status === 'rejected' || blocksResult.status === 'rejected') {
        const failed = daysResult.status === 'rejected' ? 'a jornada semanal' : 'os bloqueios'
        setError(`Seu vínculo foi carregado, mas não foi possível consultar ${failed}. Tente novamente.`)
      }
    } catch (requestError) {
      setContext(null)
      setError(mensagemErroDisponibilidade(requestError))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()

    const refreshPermission = () => load({ quiet: true })
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshPermission()
    }

    window.addEventListener('focus', refreshPermission)
    window.addEventListener('pageshow', refreshPermission)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshPermission)
      window.removeEventListener('pageshow', refreshPermission)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [load])

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
    setWeek((current) => current.map((day) => day.dia_semana >= 1 && day.dia_semana <= 5 ? { ...monday, dia_semana: day.dia_semana } : day))
    setStatus('Horário de segunda-feira aplicado de segunda a sexta. Salve para confirmar.')
  }

  async function persistWeek(confirmarConflitos) {
    setSaving(true); setError('')
    try {
      await salvarMinhasJornadas({ dias: week, confirmarConflitos })
      setConflict(null)
      setStatus('Sua jornada foi salva.')
      await load()
    } catch (requestError) { setError(mensagemErroDisponibilidade(requestError)) }
    finally { setSaving(false) }
  }

  async function requestSaveWeek() {
    setSaving(true); setError('')
    try {
      const analysis = await analisarMinhaJornada(week)
      if (Number(analysis?.quantidade || 0) > 0) setConflict({ kind: 'week', quantidade: Number(analysis.quantidade), agendamentos: analysis.agendamentos ?? [] })
      else await persistWeek(false)
    } catch (requestError) { setError(mensagemErroDisponibilidade(requestError)) }
    finally { setSaving(false) }
  }

  async function persistBlock(confirmarConflitos) {
    setSaving(true); setError('')
    try {
      await criarMeuBloqueio({ ...blockForm, confirmarConflitos })
      setConflict(null); setBlockOpen(false); setBlockForm(defaultBlock())
      setStatus('Bloqueio incluído. Novos agendamentos não usarão esse período.')
      await load()
    } catch (requestError) { setError(mensagemErroDisponibilidade(requestError)) }
    finally { setSaving(false) }
  }

  async function requestSaveBlock(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const analysis = await analisarMeuBloqueio(blockForm)
      if (Number(analysis?.quantidade || 0) > 0) setConflict({ kind: 'block', quantidade: Number(analysis.quantidade), agendamentos: analysis.agendamentos ?? [] })
      else await persistBlock(false)
    } catch (requestError) { setError(mensagemErroDisponibilidade(requestError)) }
    finally { setSaving(false) }
  }

  async function removeBlock() {
    setSaving(true); setError('')
    try { await excluirMeuBloqueio(deleteTarget.id); setDeleteTarget(null); setStatus('Bloqueio removido.'); await load() }
    catch (requestError) { setError(mensagemErroDisponibilidade(requestError)) }
    finally { setSaving(false) }
  }

  return <div className="min-h-[100dvh] bg-surface-0 text-warm-white">
    <header className="sticky top-0 z-30 border-b border-line bg-surface-0 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><Button variant="ghost" size="sm" onClick={() => navigate('/barber/dashboard')}><ArrowLeft size={18} /> Agenda</Button><ThemeToggle /></div>
    </header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div><span className="text-label text-copper">MEU ESPAÇO</span><h1 className="mt-1 text-h1 text-warm-white">Minha disponibilidade</h1><p className="mt-2 text-body-sm text-steel">Expediente, intervalos, folgas e bloqueios usados pela agenda.</p></div>
      {status && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{status}</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger"><span>{error}</span><Button size="sm" variant="secondary" onClick={load}><RefreshCw size={15} /> Tentar novamente</Button></div>}
      {loading ? <Card className="flex min-h-48 items-center justify-center gap-3 text-steel"><Spinner size={22} /> Carregando disponibilidade</Card> : !context ? <Card className="border-danger/40 bg-danger/10 p-5"><h2 className="text-h3 text-danger">Disponibilidade indisponível</h2><p className="mt-2 text-body-sm text-steel">Não foi possível identificar com segurança quem controla estes horários. Tente novamente ou retorne à agenda.</p></Card> : <>
        <Card className={`p-4 ${context?.pode_editar ? 'border-info/30 bg-info/5' : 'border-warning/30 bg-warning/5'}`}>
          <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="neutral">{linkLabel(context?.tipo_vinculo)}</Badge><Badge variant={context?.pode_editar ? 'info' : 'warning'}>{context?.pode_editar ? 'Você administra seus horários' : 'Administrada pela barbearia'}</Badge></div><Button size="sm" variant="ghost" className="shrink-0 px-2" aria-label="Atualizar permissão de disponibilidade" onClick={() => load({ quiet: true })}><RefreshCw size={15} /> <span className="hidden sm:inline">Atualizar</span></Button></div>
          <p className="mt-3 text-body-sm text-steel">{context?.pode_editar ? 'As mudanças passam a valer para novos agendamentos. Clientes já marcados nunca são cancelados automaticamente.' : 'Você pode consultar tudo aqui. Para alterar jornada, folga ou bloqueio, fale com a gestão.'}</p>
        </Card>
        <section className="grid grid-cols-3 gap-2" aria-label="Resumo da disponibilidade"><Metric icon={CalendarClock} label="Dias ativos" value={summary.workDays} /><Metric icon={Coffee} label="Intervalos" value={summary.breaks} /><Metric icon={Ban} label="Bloqueios" value={summary.blocks} /></section>
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-h2 text-warm-white">Semana padrão</h2><p className="mt-1 text-body-sm text-steel">Folgas não geram horários disponíveis.</p></div>{context?.pode_editar && <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={copyBusinessDays} disabled={saving}><Copy size={16} /> Repetir seg–sex</Button><Button onClick={requestSaveWeek} loading={saving}><Save size={16} /> Salvar jornada</Button></div>}</div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{DAYS.map(([number,label]) => <DayCard key={number} label={label} day={week[number]} disabled={saving || !context?.pode_editar} onChange={(changes) => updateDay(number,changes)} />)}</div>
        </section>
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-h2 text-warm-white">Folgas e bloqueios</h2><p className="mt-1 text-body-sm text-steel">Ausências pontuais preservam os clientes já marcados.</p></div>{context?.pode_editar && <Button size="sm" onClick={() => { setBlockForm(defaultBlock()); setBlockOpen(true) }}><Plus size={15} /> Novo bloqueio</Button>}</div>
          {blocks.length === 0 ? <Card><EmptyState icon={Ban} className="py-8" title="Nenhum bloqueio futuro" description="Apenas a jornada semanal está sendo considerada." /></Card> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{blocks.map((block) => <Card key={block.id} className="flex items-start gap-3 p-4"><Ban size={18} className="mt-1 shrink-0 text-warning" /><div className="min-w-0 flex-1"><p className="text-body font-semibold">{formatDateTime(block.inicio)}</p><p className="text-body-sm text-steel">até {formatDateTime(block.fim)}</p><p className="mt-2 truncate text-body-sm text-steel">{block.motivo || 'Sem motivo informado'}</p></div>{context?.pode_editar && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(block)}>Excluir</Button>}</Card>)}</div>}
        </section>
      </>}
    </main>
    <Modal open={blockOpen} onClose={() => !saving && setBlockOpen(false)} title="Novo bloqueio" footer={<><Button variant="ghost" onClick={() => setBlockOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" form="my-block-form" loading={saving}>Analisar e salvar</Button></>}><form id="my-block-form" className="space-y-4" onSubmit={requestSaveBlock}><Input label="Início" type="datetime-local" required value={blockForm.inicio} onChange={(event) => setBlockForm({ ...blockForm, inicio: event.target.value })} disabled={saving} /><Input label="Término" type="datetime-local" required value={blockForm.fim} onChange={(event) => setBlockForm({ ...blockForm, fim: event.target.value })} disabled={saving} /><Input label="Motivo (opcional)" maxLength={200} value={blockForm.motivo} onChange={(event) => setBlockForm({ ...blockForm, motivo: event.target.value })} disabled={saving} /></form></Modal>
    <Modal open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} title="Excluir bloqueio" footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>Voltar</Button><Button variant="danger" onClick={removeBlock} loading={saving}>Excluir</Button></>}><p className="text-body text-steel">O período voltará a ficar disponível conforme sua jornada semanal.</p></Modal>
    <Modal open={Boolean(conflict)} onClose={() => !saving && setConflict(null)} title="Clientes já agendados" footer={<><Button variant="ghost" onClick={() => setConflict(null)} disabled={saving}>Revisar horários</Button><Button variant="danger" loading={saving} onClick={() => conflict?.kind === 'week' ? persistWeek(true) : persistBlock(true)}>Confirmar alteração</Button></>}><div className="space-y-3"><p className="text-body text-steel">Esta mudança deixa <strong className="text-warm-white">{conflict?.quantidade} {conflict?.quantidade === 1 ? 'atendimento' : 'atendimentos'}</strong> fora da nova disponibilidade. Nada será cancelado; a gestão deverá reagendar esses clientes.</p><div className="max-h-52 space-y-2 overflow-y-auto">{conflict?.agendamentos?.map((item) => <div key={item.id} className="rounded-sm border border-warning/30 bg-warning/10 p-3 text-body-sm text-warning">{formatDateTime(item.inicio)} · {item.cliente}</div>)}</div></div></Modal>
  </div>
}

function Metric({ icon, label, value }) { return <Card className="p-3">{createElement(icon, { size: 17, className: 'mb-2 text-copper' })}<span className="block text-data-lg">{value}</span><span className="text-[10px] font-semibold uppercase tracking-label text-steel">{label}</span></Card> }

function DayCard({ label, day, disabled, onChange }) {
  const hasBreak=Boolean(day.intervalo_inicio||day.intervalo_fim)
  return <Card className={`p-4 ${day.ativo?'':'opacity-70'}`}><div className="flex items-center justify-between gap-3"><div><h3 className="text-h3">{label}</h3><p className="mt-1 text-label text-steel">{durationLabel(day)}</p></div><button type="button" role="switch" aria-checked={day.ativo} disabled={disabled} onClick={() => onChange({ativo:!day.ativo})} className={`min-h-10 rounded-sm border px-4 text-label font-semibold ${day.ativo?'border-success/50 bg-success/10 text-success':'border-line bg-surface-0 text-steel'} disabled:cursor-not-allowed disabled:opacity-50`}>{day.ativo?'Trabalha':'Folga'}</button></div><div className="mt-4 grid grid-cols-2 gap-3"><TimeField label="Entrada" value={day.hora_inicio} disabled={disabled||!day.ativo} onChange={(value)=>onChange({hora_inicio:value})}/><TimeField label="Saída" value={day.hora_fim} disabled={disabled||!day.ativo} onChange={(value)=>onChange({hora_fim:value})}/></div><div className="mt-4 border-t border-line pt-4"><label className="flex min-h-10 items-center gap-3 text-body-sm text-steel"><input type="checkbox" checked={hasBreak} disabled={disabled||!day.ativo} onChange={(event)=>onChange(event.target.checked?{intervalo_inicio:'12:00',intervalo_fim:'13:00'}:{intervalo_inicio:'',intervalo_fim:''})} className="h-5 w-5 accent-copper"/> Possui intervalo</label>{hasBreak&&<div className="mt-3 grid grid-cols-2 gap-3"><TimeField label="Início do intervalo" value={day.intervalo_inicio} disabled={disabled||!day.ativo} onChange={(value)=>onChange({intervalo_inicio:value})}/><TimeField label="Fim do intervalo" value={day.intervalo_fim} disabled={disabled||!day.ativo} onChange={(value)=>onChange({intervalo_fim:value})}/></div>}</div></Card>
}

function TimeField({label,value,disabled,onChange}) { return <label className="min-w-0 text-label text-steel"><span className="mb-2 flex items-center gap-2"><Clock3 size={13}/>{label}</span><input type="time" value={value} onChange={(event)=>onChange(event.target.value)} disabled={disabled} className={FIELD_CLASS}/></label> }
