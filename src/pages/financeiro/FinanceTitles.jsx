import { useCallback, useEffect, useRef, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import Label from '../../components/ui/Label'
import Modal from '../../components/ui/Modal'
import PeriodSelector from '../../components/ui/PeriodSelector'
import Tabs from '../../components/ui/Tabs'
import { listarContasBancarias, listarTitulos, pagarConta, receberConta } from '../../lib/financeiro/api'
import { dataCompetenciaBrt, periodoMensalBrt } from '../../lib/financeiro/periodo'
import { formatarBRL } from '../../lib/financeiro/moeda'
import { settlementKeyFor } from '../../lib/financeiro/settlementIntent'

const statusVariant = { pendente: 'warning', pago: 'success', previsto: 'info', liquidado: 'success', estornado: 'danger', cancelado: 'neutral' }

function intervalFor(period, customRange) {
  const today = dataCompetenciaBrt()
  const date = new Date(`${today}T12:00:00Z`)
  if (period === 'today') return { inicio: today, fim: today }
  if (period === 'custom') return { inicio: customRange.start, fim: customRange.end }
  if (period === 'month') return periodoMensalBrt(date.getUTCFullYear(), date.getUTCMonth() + 1)
  if (period === 'week') {
    const start = new Date(date)
    start.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    return { inicio: start.toISOString().slice(0, 10), fim: today }
  }
  const quarter = Math.floor(date.getUTCMonth() / 3) * 3
  return { inicio: `${date.getUTCFullYear()}-${String(quarter + 1).padStart(2, '0')}-01`, fim: today }
}

export default function FinanceTitles() {
  const [type, setType] = useState('pagar')
  const [period, setPeriod] = useState('month')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [appliedRange, setAppliedRange] = useState(() => intervalFor('month', customRange))
  const [status, setStatus] = useState('todos')
  const [order, setOrder] = useState('data')
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selected, setSelected] = useState(null)
  const [accountId, setAccountId] = useState('')
  const [settlementDate, setSettlementDate] = useState(() => dataCompetenciaBrt())
  const [submitting, setSubmitting] = useState(false)
  const settlementIntentRef = useRef(null)

  const loadTitles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listarTitulos({ tipo: type, dataInicio: appliedRange.inicio, dataFim: appliedRange.fim, status: status === 'todos' ? null : status, ordenarPor: order, direcao: order === 'valor' ? 'desc' : 'asc', pagina: 1, porPagina: 100 })
      setRows(result?.items ?? [])
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível carregar os títulos.')
    } finally {
      setLoading(false)
    }
  }, [type, appliedRange, status, order])

  useEffect(() => { loadTitles() }, [loadTitles])
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    setAccountsError('')
    try {
      setAccounts(await listarContasBancarias() ?? [])
    } catch {
      setAccounts([])
      setAccountsError('Não foi possível carregar as contas bancárias. Tente novamente antes de liquidar um título.')
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  function openSettlement(row) {
    settlementIntentRef.current = settlementKeyFor(null, row.tipo, row.id)
    setSelected(row)
    setAccountId(accounts.find((account) => account.conta_principal)?.id ?? accounts[0]?.id ?? '')
    setSettlementDate(dataCompetenciaBrt())
    setFeedback('')
  }

  function closeSettlement() {
    settlementIntentRef.current = null
    setSelected(null)
  }

  async function confirmSettlement() {
    if (!selected || !accountId) return
    setSubmitting(true)
    setError('')
    try {
      settlementIntentRef.current = settlementKeyFor(settlementIntentRef.current, selected.tipo, selected.id)
      const input = { contaBancariaId: accountId, data: settlementDate, idempotencyKey: settlementIntentRef.current.key }
      if (selected.tipo === 'pagar') await pagarConta({ ...input, contaPagarId: selected.id })
      else await receberConta({ ...input, contaReceberId: selected.id })
      setFeedback(`${selected.tipo === 'pagar' ? 'Pagamento' : 'Recebimento'} registrado com sucesso.`)
      settlementIntentRef.current = null
      setSelected(null)
      await loadTitles()
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível concluir a operação.')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    { key: 'descricao', header: 'Descrição' },
    { key: 'categoria', header: 'Categoria', render: (value) => value || 'Sem categoria' },
    { key: 'contraparte', header: 'Contraparte', render: (value) => value || 'Não informada' },
    { key: 'data_evento', header: type === 'pagar' ? 'Vencimento' : 'Previsão', dataType: true },
    { key: 'valor', header: 'Valor', align: 'right', dataType: true, render: formatarBRL },
    { key: 'status', header: 'Status', render: (value) => <Badge variant={statusVariant[value] ?? 'neutral'}>{value}</Badge> },
  ]

  const table = <DataTable columns={columns} rows={rows} loading={loading} caption={type === 'pagar' ? 'Contas reais a pagar' : 'Contas reais a receber'} emptyTitle="Nenhum título encontrado" emptyDescription="Não há títulos para os filtros e período selecionados." renderAction={(row) => row.pode_liquidar ? <Button size="sm" variant="secondary" onClick={() => openSettlement(row)}>{row.tipo === 'pagar' ? 'Pagar' : 'Receber'}</Button> : <span className="text-body-sm text-steel">Sem ação</span>} />

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header><h1 className="text-display text-warm-white">Contas</h1><p className="mt-2 text-body text-steel">Títulos reais a pagar e receber, protegidos por operações idempotentes.</p></header>
      <PeriodSelector value={period} onChange={setPeriod} customStart={customRange.start} customEnd={customRange.end} onCustomRangeChange={setCustomRange} onApply={() => setAppliedRange(intervalFor(period, customRange))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2"><Label htmlFor="status-filter">Status</Label><select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"><option value="todos">Todos</option>{type === 'pagar' ? <><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="estornado">Estornado</option><option value="cancelado">Cancelado</option></> : <><option value="previsto">Previsto</option><option value="liquidado">Liquidado</option><option value="estornado">Estornado</option><option value="cancelado">Cancelado</option></>}</select></div>
        <div className="flex flex-col gap-2"><Label htmlFor="order-filter">Ordenar por</Label><select id="order-filter" value={order} onChange={(event) => setOrder(event.target.value)} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"><option value="data">Data</option><option value="descricao">Descrição</option><option value="valor">Maior valor</option><option value="status">Status</option></select></div>
      </div>
      {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-danger bg-danger/12 p-4 text-body text-danger"><span>{error}</span><Button variant="secondary" size="sm" onClick={loadTitles}>Tentar novamente</Button></div>}
      {feedback && <div role="status" className="rounded-md border border-success bg-success/12 p-4 text-body text-success">{feedback}</div>}
      <Tabs label="Tipo de conta" value={type} onValueChange={(value) => { setType(value); setStatus('todos') }} items={[{ value: 'pagar', label: 'A pagar', content: table }, { value: 'receber', label: 'A receber', content: table }]} />
      <Modal open={Boolean(selected)} onClose={closeSettlement} title={selected?.tipo === 'pagar' ? 'Confirmar pagamento' : 'Confirmar recebimento'} footer={<><Button variant="secondary" onClick={closeSettlement}>Cancelar</Button><Button loading={submitting} disabled={accountsLoading || Boolean(accountsError) || accounts.length === 0 || !accountId || !settlementDate} onClick={confirmSettlement}>Confirmar</Button></>}>
        {selected && <div className="space-y-4"><p className="text-body text-steel"><strong className="font-semibold text-warm-white">{selected.descricao}</strong><br />Valor: <span className="text-data text-warm-white">{formatarBRL(selected.valor)}</span></p>{accountsError ? <div role="alert" className="space-y-3 rounded-md border border-danger bg-danger/12 p-4 text-body-sm text-danger"><p>{accountsError}</p><Button variant="secondary" size="sm" onClick={loadAccounts}>Tentar novamente</Button></div> : accountsLoading ? <p role="status" className="text-body-sm text-steel">Carregando contas bancárias...</p> : accounts.length === 0 ? <p role="status" className="rounded-md border border-warning bg-warning/12 p-4 text-body-sm text-warning">Cadastre uma conta bancária ativa antes de liquidar este título.</p> : <div className="flex flex-col gap-2"><Label htmlFor="settlement-account">Conta bancária</Label><select id="settlement-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nome}</option>)}</select></div>}<Input label="Data de liquidação" type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} /></div>}
      </Modal>
    </div>
  )
}
