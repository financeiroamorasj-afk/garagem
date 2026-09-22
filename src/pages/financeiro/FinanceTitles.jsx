import { useCallback, useEffect, useRef, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import CurrencyInput from '../../components/ui/CurrencyInput'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import Label from '../../components/ui/Label'
import Modal from '../../components/ui/Modal'
import PeriodSelector from '../../components/ui/PeriodSelector'
import Tabs from '../../components/ui/Tabs'
import { cancelarTituloManual, criarTituloManual, editarTituloManual, listarCategorias, listarContasBancarias, listarTitulos, pagarConta, receberConta } from '../../lib/financeiro/api'
import { dataCompetenciaBrt, periodoMensalBrt } from '../../lib/financeiro/periodo'
import { formatarBRL } from '../../lib/financeiro/moeda'
import { settlementKeyFor } from '../../lib/financeiro/settlementIntent'
import { mensagemErroTitulo } from '../../lib/financeiro/titulos-ui'

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
  const [categories, setCategories] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selected, setSelected] = useState(null)
  const [accountId, setAccountId] = useState('')
  const [settlementDate, setSettlementDate] = useState(() => dataCompetenciaBrt())
  const [submitting, setSubmitting] = useState(false)
  const [editor, setEditor] = useState(null)
  const [titleForm, setTitleForm] = useState({})
  const [titleErrors, setTitleErrors] = useState({})
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const settlementIntentRef = useRef(null)
  const createIntentRef = useRef(null)

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

  useEffect(() => {
    listarCategorias().then((items) => setCategories(items ?? [])).catch(() => setCategories([]))
  }, [])

  function openEditor(row = null) {
    const editorType = row?.tipo ?? type
    createIntentRef.current = row ? null : crypto.randomUUID()
    setEditor({ mode: row ? 'edit' : 'create', type: editorType, row })
    setTitleForm({
      descricao: row?.descricao ?? '',
      valor: row ? Number(row.valor_bruto ?? row.valor) : null,
      taxa: row ? Number(row.taxa ?? 0) : 0,
      dataEvento: row?.data_evento ?? dataCompetenciaBrt(),
      dataCompetencia: row?.data_competencia ?? dataCompetenciaBrt(),
      metodoPagamento: row?.metodo_pagamento ?? (editorType === 'receber' ? 'pix' : ''),
      categoriaId: row?.categoria_id ?? '',
    })
    setTitleErrors({})
    setFeedback('')
  }

  function closeEditor() {
    if (submitting) return
    createIntentRef.current = null
    setEditor(null)
    setTitleErrors({})
  }

  function validateTitleForm() {
    const nextErrors = {}
    const description = String(titleForm.descricao ?? '').trim()
    if (description.length < 2 || description.length > 200) nextErrors.descricao = 'Informe entre 2 e 200 caracteres.'
    if (!Number.isFinite(titleForm.valor) || titleForm.valor <= 0) nextErrors.valor = 'Informe um valor maior que zero.'
    if (!titleForm.dataEvento) nextErrors.dataEvento = 'Informe a data do título.'
    if (!titleForm.dataCompetencia) nextErrors.dataCompetencia = 'Informe a data de competência.'
    if (editor.type === 'receber') {
      if (!Number.isFinite(titleForm.taxa) || titleForm.taxa < 0 || titleForm.taxa > titleForm.valor) nextErrors.taxa = 'A taxa deve estar entre zero e o valor bruto.'
      const method = String(titleForm.metodoPagamento ?? '').trim()
      if (method.length < 2 || method.length > 50) nextErrors.metodoPagamento = 'Informe entre 2 e 50 caracteres.'
    }
    setTitleErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function submitTitle(event) {
    event.preventDefault()
    if (!validateTitleForm()) return
    setSubmitting(true)
    setTitleErrors({})
    const input = {
      tipo: editor.type,
      descricao: titleForm.descricao,
      valor: titleForm.valor,
      taxa: editor.type === 'receber' ? titleForm.taxa : 0,
      dataEvento: titleForm.dataEvento,
      dataCompetencia: titleForm.dataCompetencia,
      metodoPagamento: editor.type === 'receber' ? titleForm.metodoPagamento : null,
      categoriaId: titleForm.categoriaId || null,
    }
    try {
      if (editor.mode === 'create') await criarTituloManual({ ...input, idempotencyKey: createIntentRef.current })
      else await editarTituloManual({ ...input, tituloId: editor.row.id, expectedUpdatedAt: editor.row.updated_at })
      setFeedback(`${editor.type === 'pagar' ? 'Conta a pagar' : 'Conta a receber'} ${editor.mode === 'create' ? 'criada' : 'atualizada'} com sucesso.`)
      createIntentRef.current = null
      setEditor(null)
      await loadTitles()
    } catch (operationError) {
      const mapped = mensagemErroTitulo(operationError)
      setTitleErrors({ submit: mapped.message, conflict: mapped.conflict })
    } finally {
      setSubmitting(false)
    }
  }

  function openCancel(row) {
    setCancelTarget(row)
    setCancelReason('')
    setTitleErrors({})
    setFeedback('')
  }

  function closeCancel() {
    if (submitting) return
    setCancelTarget(null)
    setTitleErrors({})
  }

  async function confirmCancel(event) {
    event.preventDefault()
    const reason = cancelReason.trim()
    if (reason.length < 2 || reason.length > 200) {
      setTitleErrors({ motivo: 'Informe entre 2 e 200 caracteres.' })
      return
    }
    setSubmitting(true)
    setTitleErrors({})
    try {
      await cancelarTituloManual({ tipo: cancelTarget.tipo, tituloId: cancelTarget.id, expectedUpdatedAt: cancelTarget.updated_at, motivo: reason })
      setFeedback('Título cancelado com sucesso. O motivo foi registrado na auditoria.')
      setCancelTarget(null)
      await loadTitles()
    } catch (operationError) {
      const mapped = mensagemErroTitulo(operationError)
      setTitleErrors({ submit: mapped.message, conflict: mapped.conflict })
    } finally {
      setSubmitting(false)
    }
  }

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

  const table = <DataTable columns={columns} rows={rows} loading={loading} caption={type === 'pagar' ? 'Contas reais a pagar' : 'Contas reais a receber'} emptyTitle="Nenhum título encontrado" emptyDescription="Não há títulos para os filtros e período selecionados." renderAction={(row) => <div className="flex min-w-max flex-wrap justify-end gap-2">{row.pode_liquidar && <Button size="sm" variant="secondary" onClick={() => openSettlement(row)}>{row.tipo === 'pagar' ? 'Pagar' : 'Receber'}</Button>}{row.pode_editar && <Button size="sm" variant="ghost" onClick={() => openEditor(row)}>Editar</Button>}{row.pode_cancelar && <Button size="sm" variant="danger" onClick={() => openCancel(row)}>Cancelar</Button>}{!row.pode_liquidar && !row.pode_editar && !row.pode_cancelar && <span className="text-body-sm text-steel">Sem ação</span>}</div>} />

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-display text-warm-white">Contas</h1><p className="mt-2 text-body text-steel">Títulos reais a pagar e receber, protegidos por operações idempotentes.</p></div><Button onClick={() => openEditor()}>{type === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}</Button></header>
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
      <Modal open={Boolean(editor)} onClose={closeEditor} title={editor?.mode === 'edit' ? 'Editar título manual' : editor?.type === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'} className="max-h-screen overflow-y-auto" footer={<><Button variant="secondary" onClick={closeEditor} disabled={submitting}>Cancelar</Button><Button type="submit" form="title-form" loading={submitting}>{editor?.mode === 'edit' ? 'Salvar alterações' : 'Criar título'}</Button></>}>
        {editor && <form id="title-form" className="space-y-5" onSubmit={submitTitle} noValidate>{titleErrors.submit && <div role="alert" className="rounded-md border border-danger bg-danger/12 p-4 text-body-sm text-danger">{titleErrors.submit}</div>}<Input label="Descrição" value={titleForm.descricao} onChange={(event) => setTitleForm((current) => ({ ...current, descricao: event.target.value }))} error={titleErrors.descricao} maxLength={200} required disabled={submitting} /><CurrencyInput label={editor.type === 'receber' ? 'Valor bruto' : 'Valor'} value={titleForm.valor} onValueChange={(value) => setTitleForm((current) => ({ ...current, valor: value }))} error={titleErrors.valor} disabled={submitting} />{editor.type === 'receber' && <CurrencyInput label="Taxa" value={titleForm.taxa} onValueChange={(value) => setTitleForm((current) => ({ ...current, taxa: value }))} error={titleErrors.taxa} helpText="Informe zero quando não houver taxa." disabled={submitting} />}<div className="grid gap-4 sm:grid-cols-2"><Input label={editor.type === 'pagar' ? 'Vencimento' : 'Previsão de recebimento'} type="date" value={titleForm.dataEvento} onChange={(event) => setTitleForm((current) => ({ ...current, dataEvento: event.target.value }))} error={titleErrors.dataEvento} disabled={submitting} /><Input label="Competência" type="date" value={titleForm.dataCompetencia} onChange={(event) => setTitleForm((current) => ({ ...current, dataCompetencia: event.target.value }))} error={titleErrors.dataCompetencia} disabled={submitting} /></div><div className="flex flex-col gap-2"><Label htmlFor="title-category">Categoria</Label><select id="title-category" value={titleForm.categoriaId} onChange={(event) => setTitleForm((current) => ({ ...current, categoriaId: event.target.value }))} disabled={submitting} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"><option value="">Sem categoria</option>{categories.filter((category) => category.tipo === 'ambos' || category.tipo === (editor.type === 'pagar' ? 'saida' : 'entrada')).map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></div>{editor.type === 'receber' && <Input label="Método de pagamento" value={titleForm.metodoPagamento} onChange={(event) => setTitleForm((current) => ({ ...current, metodoPagamento: event.target.value }))} error={titleErrors.metodoPagamento} maxLength={50} disabled={submitting} />}</form>}
      </Modal>
      <Modal open={Boolean(cancelTarget)} onClose={closeCancel} title="Cancelar título manual" footer={<><Button variant="secondary" onClick={closeCancel} disabled={submitting}>Voltar</Button><Button variant="danger" type="submit" form="cancel-title-form" loading={submitting}>Cancelar título</Button></>}>
        {cancelTarget && <form id="cancel-title-form" className="space-y-5" onSubmit={confirmCancel} noValidate><p className="text-body text-steel">O lançamento será preservado com status cancelado e ficará disponível na auditoria.</p>{titleErrors.submit && <div role="alert" className="rounded-md border border-danger bg-danger/12 p-4 text-body-sm text-danger">{titleErrors.submit}</div>}<Input label="Motivo do cancelamento" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} error={titleErrors.motivo} maxLength={200} required disabled={submitting} /></form>}
      </Modal>
    </div>
  )
}
