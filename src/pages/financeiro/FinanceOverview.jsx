import { useCallback, useEffect, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import FinancialChart from '../../components/ui/FinancialChart'
import PeriodSelector from '../../components/ui/PeriodSelector'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { obterResumoPeriodo } from '../../lib/financeiro/api'
import { dataCompetenciaBrt, periodoMensalBrt } from '../../lib/financeiro/periodo'
import { formatarBRL } from '../../lib/financeiro/moeda'

function intervaloDoPeriodo(period, customRange) {
  const hoje = dataCompetenciaBrt()
  const data = new Date(`${hoje}T12:00:00Z`)
  if (period === 'today') return { inicio: hoje, fim: hoje }
  if (period === 'custom') return { inicio: customRange.start, fim: customRange.end }
  if (period === 'month') return periodoMensalBrt(data.getUTCFullYear(), data.getUTCMonth() + 1)
  if (period === 'week') {
    const inicio = new Date(data)
    inicio.setUTCDate(data.getUTCDate() - ((data.getUTCDay() + 6) % 7))
    return { inicio: inicio.toISOString().slice(0, 10), fim: hoje }
  }
  const trimestre = Math.floor(data.getUTCMonth() / 3) * 3
  return { inicio: `${data.getUTCFullYear()}-${String(trimestre + 1).padStart(2, '0')}-01`, fim: hoje }
}

const contaColumns = [
  { key: 'nome', header: 'Conta' },
  { key: 'entradas', header: 'Entradas', align: 'right', dataType: true, render: formatarBRL },
  { key: 'saidas', header: 'Saídas', align: 'right', dataType: true, render: formatarBRL },
  { key: 'saldo_atual', header: 'Saldo atual', align: 'right', dataType: true, render: formatarBRL },
]

const vencimentoColumns = [
  { key: 'descricao', header: 'Próximo vencimento' },
  { key: 'tipo', header: 'Tipo', render: (value) => <Badge variant={value === 'pagar' ? 'warning' : 'info'}>{value === 'pagar' ? 'A pagar' : 'A receber'}</Badge> },
  { key: 'data', header: 'Data', dataType: true },
  { key: 'valor', header: 'Valor', align: 'right', dataType: true, render: formatarBRL },
]

export default function FinanceOverview() {
  const [period, setPeriod] = useState('month')
  const [range, setRange] = useState({ start: '', end: '' })
  const [appliedRange, setAppliedRange] = useState(() => intervaloDoPeriodo('month', range))
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSummary(await obterResumoPeriodo({ dataInicio: appliedRange.inicio, dataFim: appliedRange.fim }))
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível carregar o resumo financeiro.')
    } finally {
      setLoading(false)
    }
  }, [appliedRange])

  useEffect(() => { loadSummary() }, [loadSummary])

  const totals = summary?.totais ?? { entradas: 0, saidas: 0, resultado: 0 }
  const accounts = summary?.contas ?? []
  const series = (summary?.serie ?? []).map((item) => ({ label: String(item.data).slice(5), value: Number(item.resultado), status: Number(item.resultado) < 0 ? 'negative' : 'positive' }))
  const hasMovements = series.some((item) => item.value !== 0)
  const balance = accounts.reduce((total, account) => total + Number(account.saldo_atual), 0)

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header><h1 className="text-display text-warm-white">Visão financeira</h1><p className="mt-2 text-body text-steel">Dados financeiros reais da sua barbearia, consolidados por período.</p></header>
      <PeriodSelector value={period} onChange={setPeriod} customStart={range.start} customEnd={range.end} onCustomRangeChange={setRange} onApply={() => setAppliedRange(intervaloDoPeriodo(period, range))} />
      {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-danger bg-danger/12 p-4 text-body text-danger"><span>{error}</span><Button variant="secondary" size="sm" onClick={loadSummary}>Tentar novamente</Button></div>}
      <section aria-label="Resumo financeiro" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card.Metric label="Saldo em contas" value={formatarBRL(balance)} />
        <Card.Metric label="Entradas" value={formatarBRL(totals.entradas)} />
        <Card.Metric label="Saídas" value={formatarBRL(totals.saidas)} />
        <Card.Metric label="Resultado" value={formatarBRL(totals.resultado)} badge={<Badge variant={Number(totals.resultado) < 0 ? 'danger' : 'success'}>{Number(totals.resultado) < 0 ? 'Negativo' : 'Positivo'}</Badge>} />
      </section>
      <section className="space-y-4"><h2 className="text-h1 text-warm-white">Saldo por conta</h2><DataTable columns={contaColumns} rows={accounts} loading={loading} caption="Saldo real por conta" emptyTitle="Nenhuma conta bancária ativa" emptyDescription="Cadastre uma conta para iniciar o acompanhamento financeiro." /></section>
      {!loading && (hasMovements
        ? <div className="max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" role="region" aria-label="Gráfico de resultado diário com rolagem horizontal" tabIndex={0}><div className="min-w-[720px]"><FinancialChart title="Resultado diário" summary="Entradas menos saídas, sem dupla contagem de transferências internas." data={series} formatValue={formatarBRL} /></div></div>
        : <Card><EmptyState title="Sem movimentações no período" description="Não há entradas ou saídas registradas para o período selecionado." /></Card>)}
      <section className="space-y-4"><h2 className="text-h1 text-warm-white">Próximos vencimentos</h2><DataTable columns={vencimentoColumns} rows={summary?.proximos_vencimentos ?? []} loading={loading} caption="Próximos vencimentos reais" emptyTitle="Nenhum vencimento próximo" emptyDescription="Não há títulos pendentes nos próximos 30 dias." /></section>
    </div>
  )
}
