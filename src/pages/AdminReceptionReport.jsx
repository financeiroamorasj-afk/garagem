import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Headset, PackageCheck, ReceiptText, RefreshCw, RotateCcw, Undo2 } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { dataLocalKey } from '../lib/agenda/ui'
import { formatarBRL } from '../lib/financeiro/moeda'
import { mensagemErroRecepcao, obterResumoRecepcaoAdmin } from '../lib/recepcao/api'

function addDays(key, amount) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return dataLocalKey(date)
}

function monthStart(key) {
  return `${key.slice(0, 7)}-01`
}

export default function AdminReceptionReport() {
  const today = dataLocalKey()
  const [startDate, setStartDate] = useState(addDays(today, -6))
  const [endDate, setEndDate] = useState(today)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setReport(await obterResumoRecepcaoAdmin(startDate, endDate))
    } catch (requestError) {
      setError(mensagemErroRecepcao(requestError))
    } finally {
      setLoading(false)
    }
  }, [endDate, startDate])

  useEffect(() => { load() }, [load])

  function selectPeriod(period) {
    if (period === 'today') setStartDate(today)
    if (period === 'week') setStartDate(addDays(today, -6))
    if (period === 'month') setStartDate(monthStart(today))
    setEndDate(today)
  }

  const summary = report?.resumo ?? {}
  const operators = report?.operadores ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header>
        <span className="mb-2 block text-label text-copper">MÓDULO RECEPÇÃO</span>
        <h1 className="text-h1 text-warm-white sm:text-display">Operação da recepção</h1>
        <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Acompanhe cobranças, vendas de produtos, devoluções e estornos realizados no balcão.</p>
      </header>

      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="secondary" onClick={() => selectPeriod('today')}>Hoje</Button>
          <Button size="sm" variant="secondary" onClick={() => selectPeriod('week')}>7 dias</Button>
          <Button size="sm" variant="secondary" onClick={() => selectPeriod('month')}>Este mês</Button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input label="Data inicial" type="date" max={endDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input label="Data final" type="date" min={startDate} max={today} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <Button onClick={load} disabled={!startDate || !endDate || startDate > endDate}><RefreshCw size={16} /> Atualizar</Button>
        </div>
      </Card>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button></div>}

      {loading ? <Card className="flex min-h-56 items-center justify-center gap-3 text-steel"><Spinner size={22} /> Carregando operação da recepção</Card> : error ? null : <>
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumo da recepção">
          <Card.Metric label="Cobranças de atendimentos" value={summary.cobrancas_atendimentos ?? 0} badge={<CheckCircle2 size={16} className="text-success" />} />
          <Card.Metric label="Valor dos atendimentos" value={formatarBRL(summary.valor_atendimentos ?? 0)} badge={<ReceiptText size={16} className="text-copper" />} />
          <Card.Metric label="Vendas avulsas" value={summary.vendas_avulsas ?? 0} badge={<PackageCheck size={16} className="text-info" />} />
          <Card.Metric label="Valor das vendas" value={formatarBRL(summary.valor_vendas_avulsas ?? 0)} badge={<ReceiptText size={16} className="text-gold-aged" />} />
          <Card.Metric label="Produtos vendidos" value={summary.produtos_vendidos ?? 0} badge={<PackageCheck size={16} className="text-success" />} />
          <Card.Metric label="Devolvidos ao barbeiro" value={summary.devolucoes_ao_barbeiro ?? 0} badge={<Undo2 size={16} className="text-warning" />} />
          <Card.Metric label="Vendas estornadas" value={summary.estornos_avulsos ?? 0} badge={<RotateCcw size={16} className="text-danger" />} />
          <Card.Metric label="Valor estornado" value={formatarBRL(summary.valor_estornado ?? 0)} badge={<RotateCcw size={16} className="text-danger" />} />
        </section>

        <section className="space-y-3" aria-labelledby="operators-title">
          <div><span className="text-label text-copper">EQUIPE DO BALCÃO</span><h2 id="operators-title" className="mt-1 text-h2 text-warm-white">Desempenho por operador</h2><p className="mt-1 text-body-sm text-steel">Somente operações registradas com o login individual de cada recepcionista.</p></div>
          {operators.length === 0 ? <Card><EmptyState icon={Headset} title="Nenhum operador cadastrado" description="Ative o módulo e cadastre os acessos da recepção nas configurações." /></Card> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{operators.map((operator) => <Card key={operator.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-h3 text-warm-white">{operator.nome}</h3><p className="mt-1 truncate text-body-sm text-steel">{operator.email}</p></div><Badge variant={operator.ativo ? 'success' : 'neutral'}>{operator.ativo ? 'Ativo' : 'Inativo'}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4"><div><span className="block text-label text-steel">COBRANÇAS</span><strong className="text-data text-warm-white">{operator.cobrancas_atendimentos}</strong><p className="text-body-sm text-steel">{formatarBRL(operator.valor_atendimentos)}</p></div><div><span className="block text-label text-steel">VENDAS AVULSAS</span><strong className="text-data text-warm-white">{operator.vendas_avulsas}</strong><p className="text-body-sm text-steel">{formatarBRL(operator.valor_vendas_avulsas)}</p></div><div><span className="block text-label text-steel">PRODUTOS</span><strong className="text-data text-warm-white">{operator.produtos_vendidos}</strong></div><div><span className="block text-label text-steel">AJUSTES</span><strong className="text-data text-warm-white">{operator.estornos + operator.devolucoes_ao_barbeiro}</strong><p className="text-body-sm text-steel">{operator.estornos} estornos · {operator.devolucoes_ao_barbeiro} devoluções</p></div></div></Card>)}</div>}
        </section>
      </>}
    </div>
  )
}
