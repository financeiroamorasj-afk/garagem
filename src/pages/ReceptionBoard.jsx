import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, CircleDollarSign, Clock3, CreditCard, Headset, LogOut, Package, Phone, RefreshCw, RotateCcw, Scissors, Search, ShoppingBag } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import ReceptionCheckoutModal from '../components/ReceptionCheckoutModal'
import ReceptionProductSaleModal from '../components/ReceptionProductSaleModal'
import ReceptionSalesHistory from '../components/ReceptionSalesHistory'
import { dataLocalKey, statusAgenda } from '../lib/agenda/ui'
import { listarDisponibilidadeOperacional } from '../lib/disponibilidade/api'
import { buscarClientesRecepcao, devolverAtendimentoRecepcao, estornarVendaBalcaoRecepcao, listarAgendaRecepcao, listarFilaRecepcao, listarVendasBalcaoRecepcao, mensagemErroRecepcao } from '../lib/recepcao/api'
import { formatarBRL } from '../lib/financeiro/moeda'
import { supabase } from '../lib/supabase'

function addDays(key, amount) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return dataLocalKey(date)
}

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatDay(value) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(value))
}

function appointmentName(item) {
  return item.profissional_apelido || item.profissional_nome || 'Profissional'
}

export default function ReceptionBoard() {
  const navigate = useNavigate()
  const today = dataLocalKey()
  const [view, setView] = useState('hoje')
  const [appointments, setAppointments] = useState([])
  const [availability, setAvailability] = useState([])
  const [queue, setQueue] = useState([])
  const [counterSales, setCounterSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [clientResults, setClientResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [checkoutTarget, setCheckoutTarget] = useState(null)
  const [notice, setNotice] = useState('')
  const [saleOpen, setSaleOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState(null)
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning] = useState(false)
  const [returnError, setReturnError] = useState('')
  const [refundTarget, setRefundTarget] = useState(null)
  const [refundReason, setRefundReason] = useState('')
  const [refundKey, setRefundKey] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState('')

  const endDate = view === 'hoje' ? today : addDays(today, 6)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [agenda, team, pendingQueue, recentSales] = await Promise.all([
        listarAgendaRecepcao(today, endDate),
        listarDisponibilidadeOperacional({ dataInicial: today, dataFinal: endDate }),
        listarFilaRecepcao(),
        listarVendasBalcaoRecepcao(today, endDate),
      ])
      setAppointments(agenda)
      setAvailability(team)
      setQueue(pendingQueue)
      setCounterSales(recentSales)
    } catch (loadError) {
      setError(mensagemErroRecepcao(loadError))
    } finally {
      setLoading(false)
    }
  }, [endDate, today])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const channel = supabase.channel('recepcao-fila-operacional')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimento_pendencias' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const stats = useMemo(() => ({
    hoje: appointments.filter((item) => dataLocalKey(new Date(item.data_hora)) === today).length,
    aguardando: queue.length,
    atendimento: appointments.filter((item) => item.status === 'em_atendimento').length,
    conflitos: availability.reduce((total, item) => total + (item.conflitos?.length || 0), 0),
  }), [appointments, availability, queue.length, today])

  async function search(event) {
    event.preventDefault()
    setSearching(true)
    setSearchError('')
    try {
      setClientResults(await buscarClientesRecepcao(query))
    } catch (searchFailure) {
      setSearchError(mensagemErroRecepcao(searchFailure))
      setClientResults([])
    } finally {
      setSearching(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  async function returnToBarber() {
    setReturning(true)
    setReturnError('')
    try {
      await devolverAtendimentoRecepcao({ pendenciaId: returnTarget.pendencia_id, motivo: returnReason, expectedUpdatedAt: returnTarget.updated_at })
      setReturnTarget(null)
      setReturnReason('')
      setNotice('Atendimento devolvido ao barbeiro para correção e novo envio.')
      await load()
    } catch (returnFailure) {
      setReturnError(mensagemErroRecepcao(returnFailure))
    } finally {
      setReturning(false)
    }
  }

  function openRefund(sale) {
    setNotice('')
    setRefundError('')
    setRefundReason('')
    setRefundKey(crypto.randomUUID())
    setRefundTarget(sale)
  }

  async function refundSale() {
    setRefunding(true)
    setRefundError('')
    try {
      await estornarVendaBalcaoRecepcao({ vendaId: refundTarget.id, motivo: refundReason, chaveIdempotencia: refundKey })
      setRefundTarget(null)
      setRefundReason('')
      setNotice('Venda estornada. O estoque foi devolvido e os registros financeiros foram atualizados.')
      await load()
    } catch (refundFailure) {
      setRefundError(mensagemErroRecepcao(refundFailure))
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-0 text-warm-white">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-1/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-copper text-surface-0"><Headset size={21} /></span>
            <div className="min-w-0"><h1 className="truncate text-h3 text-warm-white">Recepção</h1><p className="text-label text-steel">Operação do balcão</p></div>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut size={16} /> <span className="hidden sm:inline">Sair</span></Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><span className="text-label text-copper">VISÃO OPERACIONAL</span><h2 className="mt-2 text-h1 text-warm-white sm:text-display">Agenda da equipe</h2><p className="mt-1 text-body-sm text-steel">Horários e contatos necessários para atender o cliente.</p></div>
          <div className="flex flex-col gap-2 sm:items-end"><Button onClick={() => { setNotice(''); setSaleOpen(true) }}><ShoppingBag size={16} /> Venda avulsa</Button><div className="grid grid-cols-2 gap-2 rounded-sm border border-line bg-surface-1 p-1"><Button size="sm" variant={view === 'hoje' ? 'primary' : 'ghost'} onClick={() => setView('hoje')}>Hoje</Button><Button size="sm" variant={view === 'semana' ? 'primary' : 'ghost'} onClick={() => setView('semana')}>7 dias</Button></div></div>
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo operacional">
          {[
            ['Horários hoje', stats.hoje, <CalendarDays key="agenda" size={18} className="mb-2 text-copper" />],
            ['Aguardando cobrança', stats.aguardando, <CircleDollarSign key="cobranca" size={18} className="mb-2 text-copper" />],
            ['Em atendimento', stats.atendimento, <Scissors key="atendimento" size={18} className="mb-2 text-copper" />],
            ['Conflitos', stats.conflitos, <Clock3 key="conflitos" size={18} className="mb-2 text-copper" />],
          ].map(([label, value, icon]) => <Card key={label} className="p-4">{icon}<span className="block text-data-lg text-warm-white">{value}</span><span className="text-label text-steel">{label}</span></Card>)}
        </section>

        {notice && <div role="status" className="rounded-md border border-success/35 bg-success/10 p-4 text-body-sm text-success">{notice}</div>}

        <section className="space-y-3" aria-labelledby="queue-title">
          <div><span className="text-label text-copper">FILA DO BALCÃO</span><h2 id="queue-title" className="mt-1 text-h2 text-warm-white">Aguardando cobrança</h2><p className="mt-1 text-body-sm text-steel">Atendimentos cuja parte técnica já foi encerrada pelo barbeiro.</p></div>
          {queue.length === 0 ? <Card className="p-4 text-body-sm text-steel">Nenhum atendimento aguardando cobrança.</Card> : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {queue.map((item) => (
                <Card key={item.pendencia_id} className="border-copper/40 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-h3 text-warm-white">{item.cliente_nome}</h3><p className="mt-1 text-body-sm font-semibold text-copper">{item.profissional_nome}</p><p className="mt-2 text-body-sm text-steel">{item.servico_nome}</p></div><Badge variant="warning">Na fila</Badge></div>
                  {item.produtos.length > 0 && <div className="mt-3 space-y-1 border-t border-line pt-3"><p className="flex items-center gap-2 text-label text-steel"><Package size={14} /> PRODUTOS</p>{item.produtos.map((product) => <p key={product.id} className="text-body-sm text-steel">{product.quantidade}× {product.nome}</p>)}</div>}
                  <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3"><div><span className="block text-label text-steel">Total previsto</span><strong className="text-data-lg text-gold-aged">{formatarBRL(item.valor_total)}</strong></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button variant="secondary" onClick={() => { setNotice(''); setReturnError(''); setReturnReason(''); setReturnTarget(item) }}><RotateCcw size={16} /> Devolver</Button><Button onClick={() => { setNotice(''); setCheckoutTarget(item) }}><CreditCard size={16} /> Conferir e cobrar</Button></div></div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <ReceptionSalesHistory sales={counterSales} onRefund={openRefund} />

        <Card className="p-4 sm:p-5">
          <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Input label="Encontrar cliente" icon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou telefone" /></div><Button type="submit" loading={searching}>Buscar</Button></form>
          {searchError && <p role="alert" className="mt-3 text-body-sm text-danger">{searchError}</p>}
          {clientResults.length > 0 && <div className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 md:grid-cols-2">{clientResults.map((client) => <div key={client.id} className="rounded-sm border border-line bg-surface-0 p-3"><p className="font-semibold text-warm-white">{client.nome}</p>{client.telefone ? <a className="mt-1 inline-flex min-h-9 items-center gap-2 text-body-sm text-info" href={`tel:${client.telefone}`}><Phone size={14} /> {client.telefone}</a> : <p className="mt-1 text-body-sm text-steel">Telefone não informado</p>}{client.proximo_horario && <p className="mt-1 text-label text-steel">Próximo: {formatDay(client.proximo_horario)} às {formatTime(client.proximo_horario)}</p>}</div>)}</div>}
        </Card>

        {error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button size="sm" variant="danger" onClick={load}><RefreshCw size={15} /> Tentar novamente</Button></div>}
        {loading ? <Card className="flex min-h-56 items-center justify-center gap-3 text-steel"><Spinner size={22} /> Carregando agenda</Card> : appointments.length === 0 ? <Card><EmptyState icon={CalendarDays} title="Nenhum horário neste período" description="Os novos horários aparecerão aqui automaticamente quando forem cadastrados." /></Card> : (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Horários da equipe">
            {appointments.map((item) => {
              const status = statusAgenda(item.status)
              return <Card key={item.id} className="p-4"><div className="flex items-start gap-3"><div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-sm bg-surface-2 text-copper"><Clock3 size={14} /><time className="mt-1 text-data" dateTime={item.data_hora}>{formatTime(item.data_hora)}</time></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-h3 text-warm-white">{item.cliente_nome}</p><p className="mt-1 truncate text-body-sm font-semibold text-copper">{appointmentName(item)}</p></div><Badge variant={status.variant} className="shrink-0">{status.label}</Badge></div><p className="mt-2 text-body-sm text-steel">{item.servico_nome} · {item.duracao_minutos} min{view === 'semana' ? ` · ${formatDay(item.data_hora)}` : ''}</p>{item.cliente_telefone && <a href={`tel:${item.cliente_telefone}`} className="mt-2 inline-flex min-h-9 items-center gap-2 text-body-sm text-info"><Phone size={14} /> Ligar para o cliente</a>}</div></div></Card>
            })}
          </section>
        )}
      </main>
      <ReceptionCheckoutModal open={Boolean(checkoutTarget)} pending={checkoutTarget} onClose={() => setCheckoutTarget(null)} onSuccess={async () => { setCheckoutTarget(null); setNotice('Cobrança confirmada. Estoque e registros do atendimento foram atualizados.'); await load() }} />
      <ReceptionProductSaleModal open={saleOpen} onClose={() => setSaleOpen(false)} onSuccess={async () => { setSaleOpen(false); setNotice('Venda avulsa concluída e estoque atualizado.'); await load() }} />
      <Modal open={Boolean(returnTarget)} onClose={() => !returning && setReturnTarget(null)} title="Devolver ao barbeiro" footer={<><Button variant="secondary" disabled={returning} onClick={() => setReturnTarget(null)}>Voltar</Button><Button variant="danger" loading={returning} disabled={returnReason.trim().length < 3} onClick={returnToBarber}><RotateCcw size={16} /> Confirmar devolução</Button></>}>
        <div className="space-y-4"><p className="text-body text-steel">O atendimento de <strong className="text-warm-white">{returnTarget?.cliente_nome}</strong> sairá da fila e voltará para o barbeiro corrigir. Nenhum estoque será baixado.</p>{returnError && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{returnError}</p>}<label className="block text-label text-steel"><span className="mb-2 block">Motivo da devolução</span><textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} maxLength={500} rows={4} placeholder="Ex.: produto incorreto ou atendimento ainda não finalizado" className="w-full resize-y rounded-sm border border-line-strong bg-surface-2 px-3 py-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper" /></label></div>
      </Modal>
      <Modal open={Boolean(refundTarget)} onClose={() => !refunding && setRefundTarget(null)} title="Estornar venda avulsa" footer={<><Button variant="secondary" disabled={refunding} onClick={() => setRefundTarget(null)}>Voltar</Button><Button variant="danger" loading={refunding} disabled={refundReason.trim().length < 3} onClick={refundSale}><RotateCcw size={16} /> Confirmar estorno</Button></>}>
        <div className="space-y-4"><p className="text-body text-steel">A venda de <strong className="text-warm-white">{formatarBRL(refundTarget?.valor_final || 0)}</strong> será estornada. Os produtos voltarão ao estoque e os registros financeiros serão marcados como estornados.</p><p className="rounded-sm border border-warning/35 bg-warning/10 p-3 text-body-sm text-warning">Esta operação fica registrada e não apaga o histórico da venda.</p>{refundError && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{refundError}</p>}<label className="block text-label text-steel"><span className="mb-2 block">Motivo do estorno</span><textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} rows={4} placeholder="Ex.: cliente desistiu da compra" className="w-full resize-y rounded-sm border border-line-strong bg-surface-2 px-3 py-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper" /></label></div>
      </Modal>
    </div>
  )
}
