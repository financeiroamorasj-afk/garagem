import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  DollarSign, LogOut, PackageSearch, Phone, Play, RefreshCw, Scissors,
  ShoppingBag, UserPlus, UserRound, XCircle,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import WalkInModal from '../components/WalkInModal'
import AvailabilityOverview from '../components/AvailabilityOverview'
import CutCompletionModal from '../components/CutCompletionModal'
import LastCutSummary from '../components/LastCutSummary'
import {
  carregarContextoBarbeiro, carregarResumoBarbeiro, listarAgendaBarbeiro,
  listarAgendaBarbeiroPeriodo, mudarStatusAgendamento,
} from '../lib/agenda/api'
import {
  acaoPrincipalAgenda, dataHoraLocalKey, dataLocalKey, deslocarDataKey,
  formatarDataAgenda, intervaloAgenda, mensagemErroAgenda, resumoAgenda,
  rotuloPeriodoAgenda, statusAgenda,
} from '../lib/agenda/ui'
import { formatarBRL } from '../lib/financeiro/moeda'
import { listarProdutosBarbeiro, mensagemErroProduto, venderProduto } from '../lib/produtos/api'
import { supabase } from '../lib/supabase'
import { listarDisponibilidadeOperacional } from '../lib/disponibilidade/api'

const SECTIONS = [
  { value: 'today', label: 'Hoje', icon: Clock3 },
  { value: 'week', label: 'Semana', icon: CalendarDays },
  { value: 'sales', label: 'Vender', icon: ShoppingBag },
  { value: 'summary', label: 'Resumo', icon: BarChart3 },
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

function AppointmentCard({ appointment, isToday, busy, onAction, onCancel, onComplete }) {
  const status = statusAgenda(appointment.status)
  const action = acaoPrincipalAgenda(appointment.status)
  const isActive = appointment.status === 'em_atendimento'
  return <article className={`overflow-hidden rounded-md border bg-surface-1 ${isActive ? 'border-copper' : 'border-line'}`}>
    <div className="flex items-start gap-4 p-4">
      <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-sm border ${isActive ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-2 text-warm-white'}`}><Clock3 size={15} aria-hidden="true" /><time className="mt-1 text-data" dateTime={appointment.data_hora}>{formatarHorario(appointment.data_hora)}</time></div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2"><h2 className="truncate text-h3 text-warm-white">{appointment.cliente_nome}</h2><Badge variant={status.variant} className="shrink-0">{status.label}</Badge></div>
        <p className="mt-2 flex items-center gap-2 text-body-sm text-steel"><Scissors size={15} className="shrink-0 text-copper" aria-hidden="true" /><span className="truncate">{appointment.servico_nome}</span><span aria-hidden="true">·</span><span className="shrink-0">{appointment.duracao_minutos} min</span></p>
        {appointment.valor_final != null && <p className="mt-2 text-data text-gold-aged">{formatarBRL(appointment.valor_final)}</p>}
        {appointment.cliente_telefone && <a href={`tel:${appointment.cliente_telefone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-body-sm text-info underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"><Phone size={15} aria-hidden="true" /> Ligar para o cliente</a>}
        <LastCutSummary cut={appointment.ultimo_corte} />
      </div>
    </div>
    {action && <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-line bg-surface-0 p-3">
      <Button size="lg" className="w-full" loading={busy} disabled={!isToday} onClick={() => action.nextStatus === 'concluido' ? onComplete(appointment) : onAction(appointment, action.nextStatus)}>{action.nextStatus === 'concluido' ? <CheckCircle2 size={18} /> : <Play size={18} />}{action.label}</Button>
      {['pendente', 'confirmado', 'encaixe'].includes(appointment.status) && <Button size="lg" variant="danger" aria-label={`Cancelar horário de ${appointment.cliente_nome}`} disabled={busy || !isToday} onClick={() => onCancel(appointment)}><XCircle size={18} /></Button>}
    </div>}
    {!isToday && action && <p className="border-t border-line px-4 py-2 text-body-sm text-steel">As ações ficam disponíveis no dia do atendimento.</p>}
  </article>
}

function SectionNavigation({ value, onChange }) {
  return <>
    <nav className="mx-auto hidden max-w-5xl grid-cols-4 gap-2 px-4 py-3 sm:grid" aria-label="Área do barbeiro">
      {SECTIONS.map((item) => { const Icon = item.icon; const active = value === item.value; return <button key={item.value} type="button" onClick={() => onChange(item.value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-sm border text-body-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${active ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-1 text-steel hover:text-warm-white'}`}><Icon size={17} />{item.label}</button> })}
    </nav>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface-1/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden" aria-label="Área do barbeiro">
      {SECTIONS.map((item) => { const Icon = item.icon; const active = value === item.value; return <button key={item.value} type="button" onClick={() => onChange(item.value)} className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper ${active ? 'text-copper' : 'text-steel'}`}><Icon size={21} /><span>{item.label}</span></button> })}
    </nav>
  </>
}

function PeriodNavigator({ selectedDate, onChange }) {
  return <section aria-label="Selecionar dia" className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-md border border-line bg-surface-1 p-2">
    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Dia anterior" onClick={() => onChange(deslocarDataKey(selectedDate, -1))}><ChevronLeft size={22} /></button>
    <label className="relative min-w-0 cursor-pointer text-center"><CalendarDays size={16} className="mx-auto mb-1 text-copper" aria-hidden="true" /><span className="block truncate text-body-sm font-semibold capitalize text-warm-white">{formatarDataAgenda(selectedDate)}</span><span className="text-label text-steel">{selectedDate === dataLocalKey() ? 'Hoje' : 'Toque para escolher'}</span><input type="date" value={selectedDate} onChange={(event) => event.target.value && onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher data da agenda" /></label>
    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label="Próximo dia" onClick={() => onChange(deslocarDataKey(selectedDate, 1))}><ChevronRight size={22} /></button>
  </section>
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
  const [notice, setNotice] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [completionTarget, setCompletionTarget] = useState(null)
  const [saleProduct, setSaleProduct] = useState(null)
  const [saleForm, setSaleForm] = useState({ quantidade: 1, agendamentoId: '', formaPagamento: 'pix', chaveIdempotencia: '' })
  const [saleError, setSaleError] = useState('')

  const weekRange = useMemo(() => intervaloAgenda(selectedDate, 'semana'), [selectedDate])

  const loadDay = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [nextContext, nextAppointments, nextAvailability] = await Promise.all([
        context ? Promise.resolve(context) : carregarContextoBarbeiro(),
        listarAgendaBarbeiro(selectedDate),
        listarDisponibilidadeOperacional({ dataInicial: selectedDate, dataFinal: selectedDate }),
      ])
      setContext(nextContext); setAppointments(nextAppointments); setAvailability(nextAvailability)
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
    const channel = supabase.channel('barbeiro-centro-operacional').on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => { loadDay({ quiet: true }); if (section === 'week' || section === 'summary') loadSection() }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadDay, loadSection, section])

  const daySummary = useMemo(() => resumoAgenda(appointments), [appointments])
  const isToday = selectedDate === today
  const displayName = context?.apelido || context?.nome || 'Barbeiro'
  const selectedWeekAppointments = useMemo(() => weekAppointments.filter((item) => dataHoraLocalKey(item.data_hora) === selectedDate), [selectedDate, weekAppointments])

  async function changeStatus(appointment, newStatus) {
    setBusyId(appointment.id); setError(''); setNotice('')
    try {
      await mudarStatusAgendamento({ id: appointment.id, statusEsperado: appointment.status, novoStatus: newStatus })
      setAppointments((current) => current.map((row) => row.id === appointment.id ? { ...row, status: newStatus } : row))
      setNotice(newStatus === 'cancelado' ? 'Horário cancelado.' : 'Atendimento iniciado.'); setCancelTarget(null)
    } catch (statusError) { setError(mensagemErroAgenda(statusError)); await loadDay({ quiet: true }) } finally { setBusyId(null) }
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

  return <div className="min-h-dvh overflow-x-hidden bg-surface-0 pb-24 text-warm-white sm:pb-8">
    <header className="sticky top-0 z-30 border-b border-line bg-surface-0/95 px-4 py-3 backdrop-blur-sm"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><div className="min-w-0"><span className="block text-label text-copper">GARAGEM · MEU ESPAÇO</span><h1 className="mt-1 truncate text-h2 text-warm-white">Olá, {displayName}</h1></div><Button variant="ghost" size="sm" onClick={logout} aria-label="Sair do aplicativo"><LogOut size={18} /> <span className="hidden sm:inline">Sair</span></Button></div></header>
    <SectionNavigation value={section} onChange={(value) => {
      if (value !== 'week') setSelectedDate(today)
      setSection(value); setError(''); setNotice('')
    }} />
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5">
      {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-body-sm text-success">{notice}</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => section === 'today' ? loadDay() : loadSection()}><RefreshCw size={15} /> Recarregar</Button></div>}

      {section === 'today' && <TodaySection selectedDate={selectedDate} setSelectedDate={setSelectedDate} appointments={appointments} availability={availability} loading={loading} error={error} summary={daySummary} isToday={isToday} busyId={busyId} onWalkIn={() => setWalkInOpen(true)} onAction={changeStatus} onCancel={setCancelTarget} onComplete={setCompletionTarget} />}
      {section === 'week' && <WeekSection selectedDate={selectedDate} setSelectedDate={setSelectedDate} weekRange={weekRange} weekAppointments={weekAppointments} selectedAppointments={selectedWeekAppointments} sectionLoading={sectionLoading} today={today} busyId={busyId} onAction={changeStatus} onCancel={setCancelTarget} onComplete={setCompletionTarget} />}
      {section === 'summary' && <SummarySection selectedDate={selectedDate} summary={summary} loading={sectionLoading} />}
      {section === 'sales' && <SalesSection products={products} loading={sectionLoading} onSale={openSale} />}
    </main>

    {cancelTarget && <Modal open onClose={() => !busyId && setCancelTarget(null)} title="Cancelar horário" footer={<><Button variant="ghost" disabled={Boolean(busyId)} onClick={() => setCancelTarget(null)}>Voltar</Button><Button variant="danger" loading={busyId === cancelTarget.id} onClick={() => changeStatus(cancelTarget, 'cancelado')}>Cancelar horário</Button></>}><p className="text-body text-steel">Cancelar o horário de <strong className="text-warm-white">{cancelTarget.cliente_nome}</strong> às {formatarHorario(cancelTarget.data_hora)}? Esta ação ficará registrada na agenda.</p></Modal>}
    <WalkInModal open={walkInOpen} onClose={() => setWalkInOpen(false)} initialDate={selectedDate >= today ? selectedDate : today} onSuccess={async (_result, slot) => { const professional = slot.profissional_apelido || slot.profissional_nome || 'barbeiro disponível'; setNotice(`Encaixe confirmado com ${professional} às ${formatarHorario(slot.inicio)}.`); if (slot.profissional_id === context?.id) setSelectedDate(dataLocalKey(new Date(slot.inicio))); await loadDay({ quiet: true }) }} />
    <CutCompletionModal open={Boolean(completionTarget)} appointment={completionTarget} onClose={() => !busyId && setCompletionTarget(null)} onSuccess={async (result) => { setCompletionTarget(null); setNotice(result?.modo === 'recepcao' ? 'Parte técnica concluída. Atendimento enviado para cobrança na recepção.' : 'Atendimento, pagamento e estoque atualizados com sucesso.'); await loadDay({ quiet: true }) }} />
    {saleProduct && <SaleModal product={saleProduct} appointments={appointments} form={saleForm} setForm={setSaleForm} error={saleError} busy={busyId === 'sale'} onClose={() => setSaleProduct(null)} onSubmit={submitSale} />}
  </div>
}

function TodaySection({ selectedDate, setSelectedDate, appointments, availability, loading, error, summary, isToday, busyId, onWalkIn, onAction, onCancel, onComplete }) {
  return <><PeriodNavigator selectedDate={selectedDate} onChange={setSelectedDate} /><Button size="lg" className="w-full" onClick={onWalkIn}><UserPlus size={18} /> Novo encaixe</Button><AvailabilityOverview rows={availability} loading={loading} compact title="Minha disponibilidade" />
    <section className="grid grid-cols-3 gap-2" aria-label="Resumo do dia">{[['Horários', summary.total], ['Restantes', summary.restantes], ['Concluídos', summary.concluidos]].map(([label, value]) => <div key={label} className="min-w-0 rounded-md border border-line bg-surface-1 p-3 text-center"><span className="block text-data-lg text-warm-white">{value}</span><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">{label}</span></div>)}</section>
    <section aria-label="Horários do dia" className="space-y-3">{loading ? <Loading label="Carregando sua agenda" /> : !error && appointments.length === 0 ? <EmptyState icon={isToday ? UserRound : CalendarDays} title={isToday ? 'Agenda livre hoje' : 'Nenhum horário neste dia'} description={isToday ? 'Quando um cliente for agendado para você, ele aparecerá aqui.' : 'Escolha outro dia para consultar seus atendimentos.'} /> : appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} isToday={isToday} busy={busyId === appointment.id} onAction={onAction} onCancel={onCancel} onComplete={onComplete} />)}</section>
  </>
}

function WeekSection({ selectedDate, setSelectedDate, weekRange, weekAppointments, selectedAppointments, sectionLoading, today, busyId, onAction, onCancel, onComplete }) {
  return <><div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-1 p-2"><Button variant="ghost" size="sm" aria-label="Semana anterior" onClick={() => setSelectedDate(deslocarDataKey(selectedDate, -7))}><ChevronLeft size={20} /></Button><div className="min-w-0 text-center"><span className="block text-h3 capitalize text-warm-white">{rotuloPeriodoAgenda(selectedDate, 'semana')}</span><span className="text-label text-steel">Sua agenda semanal</span></div><Button variant="ghost" size="sm" aria-label="Próxima semana" onClick={() => setSelectedDate(deslocarDataKey(selectedDate, 7))}><ChevronRight size={20} /></Button></div>
    {sectionLoading ? <Loading label="Carregando a semana" /> : <><section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Dias da semana">{weekRange.days.map((dateKey) => { const label = rotuloDiaCurto(dateKey); const rows = weekAppointments.filter((item) => dataHoraLocalKey(item.data_hora) === dateKey && item.status !== 'cancelado'); const active = dateKey === selectedDate; return <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} className={`min-h-24 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${active ? 'border-copper bg-copper/10' : 'border-line bg-surface-1 hover:border-line-strong'}`}><span className={`block text-label capitalize ${active ? 'text-copper' : 'text-steel'}`}>{dateKey === today ? 'Hoje' : label.weekday}</span><span className="mt-1 block text-data-lg text-warm-white">{label.day}</span><span className="mt-2 block text-body-sm text-steel">{rows.length} {rows.length === 1 ? 'horário' : 'horários'}</span></button> })}</section>
      <section className="space-y-3"><div><span className="text-label text-copper">DETALHE DO DIA</span><h2 className="mt-1 text-h2 capitalize text-warm-white">{formatarDataAgenda(selectedDate)}</h2></div>{selectedAppointments.length === 0 ? <EmptyState icon={CalendarDays} title="Nenhum horário neste dia" description="Escolha outro dia da semana para consultar." /> : selectedAppointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} isToday={selectedDate === today} busy={busyId === appointment.id} onAction={onAction} onCancel={onCancel} onComplete={onComplete} />)}</section></>}
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
  return <Modal open onClose={() => !busy && onClose()} title="Registrar venda" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" form="sale-form" loading={busy}>Confirmar {formatarBRL(Number(product.preco_venda) * Number(form.quantidade || 0))}</Button></>}><form id="sale-form" onSubmit={onSubmit} className="space-y-4">{error && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</div>}<div className="rounded-sm border border-line bg-surface-0 p-3"><span className="text-h3 text-warm-white">{product.nome}</span><span className="mt-1 block text-body-sm text-steel">{formatarBRL(product.preco_venda)} por unidade · {product.estoque_quantidade} disponíveis</span></div><label className="block text-label text-steel"><span className="mb-2 block">Quantidade</span><input type="number" min="1" max={Math.min(100, product.estoque_quantidade)} step="1" required value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper" /></label><label className="block text-label text-steel"><span className="mb-2 block">Cliente / atendimento (opcional)</span><select value={form.agendamentoId} onChange={(event) => setForm({ ...form, agendamentoId: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"><option value="">Venda sem vínculo</option>{appointments.filter((item) => item.status !== 'cancelado').map((item) => <option key={item.id} value={item.id}>{formatarHorario(item.data_hora)} · {item.cliente_nome}</option>)}</select></label><label className="block text-label text-steel"><span className="mb-2 block">Forma de pagamento</span><select value={form.formaPagamento} onChange={(event) => setForm({ ...form, formaPagamento: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></form></Modal>
}

function Loading({ label }) { return <div className="flex min-h-48 items-center justify-center gap-3 text-body text-steel"><Spinner size={24} /> {label}</div> }
function Metric({ label, value, icon }) {
  const MetricIcon = icon
  return <div className="rounded-md border border-line bg-surface-1 p-4"><MetricIcon size={18} className="mb-3 text-copper" /><span className="block text-data-lg text-warm-white">{value}</span><span className="text-label text-steel">{label}</span></div>
}
function ValueCard({ title, gross, commission }) { return <section className="rounded-md border border-line bg-surface-1 p-5"><h3 className="text-h3 text-warm-white">{title}</h3><div className="mt-4 grid grid-cols-2 gap-3"><div><span className="block text-label text-steel">Valor bruto</span><span className="mt-1 block text-data-lg text-warm-white">{formatarBRL(gross)}</span></div><div><span className="block text-label text-steel">Sua comissão</span><span className="mt-1 block text-data-lg text-success">{formatarBRL(commission)}</span></div></div></section> }
