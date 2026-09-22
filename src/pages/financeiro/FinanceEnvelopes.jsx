import { useCallback, useEffect, useRef, useState } from 'react'
import { CirclePlus, History, Inbox, ReceiptText, WalletCards } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import CurrencyInput from '../../components/ui/CurrencyInput'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Input from '../../components/ui/Input'
import Label from '../../components/ui/Label'
import Modal from '../../components/ui/Modal'
import ReserveMeter from '../../components/ui/ReserveMeter'
import Spinner from '../../components/ui/Spinner'
import { aportarEnvelope, criarEnvelope, definirEnvelopeAtivo, distribuirEnvelopesDiario, editarEnvelope, listarEnvelopes, listarSaldosDisponiveisContas, listarTransacoesEnvelope, simularDistribuicaoEnvelopes } from '../../lib/financeiro/api'
import { formatarBRL } from '../../lib/financeiro/moeda'
import { dataCompetenciaBrt, periodoMensalBrt } from '../../lib/financeiro/periodo'
import { classificarEnvelope, mensagemErroEnvelope, podeAdicionarReserva } from '../../lib/financeiro/envelopes-ui'
import { envelopeIntentKeyFor } from '../../lib/financeiro/envelopeIntent'
import { FINALIDADES_ENVELOPE } from '../../lib/financeiro/schemas'

const PAGE_SIZE = 25
const PURPOSE_LABELS = { reserva: 'Reserva', reinvestimento: 'Reinvestimento', socios: 'Sócios', impostos: 'Impostos', outros: 'Outros' }

const transactionColumns = [
  { key: 'data_brt', header: 'Data BRT', dataType: true },
  { key: 'tipo', header: 'Tipo', render: (value) => value === 'distribuicao' ? 'Distribuição' : value === 'resgate' ? 'Resgate / uso' : value === 'aporte_avulso' ? 'Reserva adicionada' : 'Estorno' },
  { key: 'direcao', header: 'Direção', render: (value) => <Badge variant={value === 'credito' ? 'success' : 'warning'}>{value === 'credito' ? 'Crédito' : 'Débito'}</Badge> },
  { key: 'valor', header: 'Valor', align: 'right', dataType: true, render: formatarBRL },
  { key: 'saldo_depois', header: 'Saldo após', align: 'right', dataType: true, render: formatarBRL },
]

export default function FinanceEnvelopes() {
  const [envelopes, setEnvelopes] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [transactionsError, setTransactionsError] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [formModal, setFormModal] = useState(null)
  const [statusModal, setStatusModal] = useState(null)
  const [distribution, setDistribution] = useState(null)
  const [reserveModal, setReserveModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const formIntentRef = useRef(null)
  const statusIntentRef = useRef(null)
  const distributionIntentRef = useRef(null)
  const reserveIntentRef = useRef(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [envelopeRows, accountRows] = await Promise.all([
        listarEnvelopes({ incluirInativos: includeInactive }),
        listarSaldosDisponiveisContas(),
      ])
      setEnvelopes(envelopeRows ?? [])
      setAccounts(accountRows ?? [])
      return envelopeRows ?? []
    } catch {
      setEnvelopes([])
      setAccounts([])
      setError('Não foi possível carregar os envelopes. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => { loadData() }, [loadData])

  async function loadStatement(envelope, page) {
    setTransactionsLoading(true)
    setTransactionsError('')
    try {
      const today = dataCompetenciaBrt()
      const date = new Date(`${today}T12:00:00Z`)
      const period = periodoMensalBrt(date.getUTCFullYear(), date.getUTCMonth() + 1)
      const result = await listarTransacoesEnvelope({
        envelopeId: envelope.id,
        dataInicio: period.inicio,
        dataFim: period.fim,
        pagina: page,
        porPagina: PAGE_SIZE,
      })
      setTransactions(result?.items ?? [])
      setTransactionsTotal(Number(result?.total) || 0)
      setTransactionsPage(page)
    } catch {
      setTransactions([])
      setTransactionsTotal(0)
      setTransactionsError('Não foi possível carregar o extrato. Tente novamente.')
    } finally {
      setTransactionsLoading(false)
    }
  }

  function openStatement(envelope) {
    setSelected(envelope)
    setTransactions([])
    setTransactionsPage(1)
    loadStatement(envelope, 1)
  }

  function closeStatement() {
    setSelected(null)
    setTransactions([])
    setTransactionsError('')
  }

  function openEnvelopeForm(envelope = null) {
    const mode = envelope ? 'edit' : 'create'
    formIntentRef.current = envelopeIntentKeyFor(null, mode, envelope?.id ?? 'novo')
    setFormModal({
      mode,
      row: envelope,
      nome: envelope?.nome ?? '',
      finalidade: envelope?.finalidade ?? 'reserva',
      contaBancariaId: envelope?.conta_bancaria_id ?? accounts[0]?.conta_bancaria_id ?? '',
      percentual: envelope?.percentual_distribuicao ?? '',
      error: '',
      conflict: false,
    })
  }

  function closeEnvelopeForm() {
    formIntentRef.current = null
    setFormModal(null)
  }

  async function submitEnvelopeForm(event) {
    event.preventDefault()
    if (!formModal) return
    setSubmitting(true)
    setFormModal((current) => ({ ...current, error: '', conflict: false }))
    try {
      const input = {
        contaBancariaId: formModal.contaBancariaId,
        nome: formModal.nome,
        finalidade: formModal.finalidade,
        percentual: formModal.percentual,
        idempotencyKey: formIntentRef.current.key,
      }
      if (formModal.mode === 'create') await criarEnvelope(input)
      else await editarEnvelope({ ...input, envelopeId: formModal.row.id, expectedUpdatedAt: formModal.row.updated_at })
      closeEnvelopeForm()
      setFeedback(`Envelope ${formModal.mode === 'create' ? 'criado' : 'atualizado'} com sucesso.`)
      await loadData()
    } catch (requestError) {
      const mapped = mensagemErroEnvelope(requestError)
      setFormModal((current) => ({ ...current, error: mapped.message, conflict: mapped.conflict }))
    } finally {
      setSubmitting(false)
    }
  }

  async function reloadConflictedEnvelope() {
    if (!formModal?.row) return
    const rows = await loadData()
    const updated = rows?.find((item) => item.id === formModal.row.id)
    if (updated) {
      formIntentRef.current = envelopeIntentKeyFor(null, 'edit', updated.id)
      setFormModal((current) => ({ ...current, row: updated, nome: updated.nome, finalidade: updated.finalidade, contaBancariaId: updated.conta_bancaria_id, percentual: updated.percentual_distribuicao ?? '', error: '', conflict: false }))
    }
  }

  function openStatusModal(envelope) {
    statusIntentRef.current = envelopeIntentKeyFor(null, envelope.ativa ? 'desativar' : 'ativar', envelope.id)
    setStatusModal({ row: envelope, error: '' })
  }

  function closeStatusModal() {
    statusIntentRef.current = null
    setStatusModal(null)
  }

  async function confirmStatusChange() {
    if (!statusModal) return
    setSubmitting(true)
    setStatusModal((current) => ({ ...current, error: '' }))
    try {
      await definirEnvelopeAtivo({ envelopeId: statusModal.row.id, ativo: !statusModal.row.ativa, idempotencyKey: statusIntentRef.current.key })
      const action = statusModal.row.ativa ? 'desativado' : 'reativado'
      closeStatusModal()
      setFeedback(`Envelope ${action} com sucesso.`)
      await loadData()
    } catch (requestError) {
      setStatusModal((current) => ({ ...current, error: mensagemErroEnvelope(requestError).message }))
    } finally {
      setSubmitting(false)
    }
  }

  function openDistribution() {
    distributionIntentRef.current = null
    setDistribution({ data: dataCompetenciaBrt(), simulation: null, error: '', loading: false })
  }

  function closeDistribution() {
    distributionIntentRef.current = null
    setDistribution(null)
  }

  async function simulateDistribution() {
    if (!distribution) return
    distributionIntentRef.current = null
    setDistribution((current) => ({ ...current, loading: true, simulation: null, error: '' }))
    try {
      const simulation = await simularDistribuicaoEnvelopes({ data: distribution.data, hojeBrt: dataCompetenciaBrt() })
      distributionIntentRef.current = envelopeIntentKeyFor(null, 'distribuir', distribution.data)
      setDistribution((current) => ({ ...current, loading: false, simulation }))
    } catch (requestError) {
      setDistribution((current) => ({ ...current, loading: false, error: mensagemErroEnvelope(requestError).message }))
    }
  }

  async function confirmDistribution() {
    if (!distribution?.simulation || !distributionIntentRef.current) return
    setSubmitting(true)
    setDistribution((current) => ({ ...current, error: '' }))
    try {
      await distribuirEnvelopesDiario({ data: distribution.data, hojeBrt: dataCompetenciaBrt(), idempotencyKey: distributionIntentRef.current.key })
      closeDistribution()
      setFeedback('Distribuição diária concluída com sucesso.')
      await loadData()
    } catch (requestError) {
      setDistribution((current) => ({ ...current, error: mensagemErroEnvelope(requestError).message }))
    } finally {
      setSubmitting(false)
    }
  }

  function openReserveModal(envelope) {
    reserveIntentRef.current = envelopeIntentKeyFor(null, 'aportar', envelope.id)
    setReserveModal({ row: envelope, valor: null, error: '' })
  }

  function closeReserveModal() {
    reserveIntentRef.current = null
    setReserveModal(null)
  }

  async function confirmReserve(event) {
    event.preventDefault()
    if (!reserveModal || !reserveIntentRef.current) return
    const envelope = reserveModal.row
    const intent = reserveIntentRef.current
    setSubmitting(true)
    setReserveModal((current) => ({ ...current, error: '' }))
    try {
      await aportarEnvelope({
        envelopeId: envelope.id,
        valor: reserveModal.valor,
        idempotencyKey: intent.key,
        correlationId: intent.key,
      })
      closeReserveModal()
      setFeedback('Reserva adicionada ao envelope com sucesso.')
      await loadData()
      if (selected?.id === envelope.id) await loadStatement(envelope, 1)
    } catch (requestError) {
      const mapped = mensagemErroEnvelope(requestError)
      setReserveModal((current) => ({ ...current, error: mapped.message }))
      const detail = [requestError?.code, requestError?.message, requestError?.details].filter(Boolean).join(' ')
      if (detail.includes('FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE')) await loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const accountById = new Map(accounts.map((account) => [account.conta_bancaria_id, account]))
  const totalPages = Math.max(1, Math.ceil(transactionsTotal / PAGE_SIZE))
  const simulationItems = distribution?.simulation?.itens ?? []
  const simulatedByAccount = simulationItems.reduce((totals, item) => {
    const accountId = item.conta_bancaria_id
    totals.set(accountId, (totals.get(accountId) ?? 0) + Number(item.valor || 0))
    return totals
  }, new Map())
  const insufficientAccounts = [...simulatedByAccount.entries()].filter(([accountId, value]) => value > Number(accountById.get(accountId)?.saldo_disponivel ?? 0))
  const simulationBase = Number(distribution?.simulation?.base_distribuivel || 0)
  const simulationValue = Number(distribution?.simulation?.valor_distribuido || 0)

  if (loading) return <div className="flex min-h-64 items-center justify-center"><span className="inline-flex items-center gap-3 text-body text-steel"><Spinner size={24} /> Carregando envelopes</span></div>

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      <header className="flex flex-col items-start gap-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl"><p className="text-label text-copper">Financeiro</p><h1 className="mt-2 text-display text-warm-white">Envelopes</h1><p className="mt-2 text-body text-steel">Reservas lógicas vinculadas às contas bancárias. Reservar não reduz o saldo bancário real; reduz somente o valor disponível.</p></div>
        <div className="flex flex-wrap gap-3"><Button onClick={() => openEnvelopeForm()}>Novo envelope</Button><Button variant="secondary" onClick={openDistribution}>Distribuir lucro diário</Button></div>
      </header>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-danger bg-danger/12 p-4 text-body text-danger"><span>{error}</span><Button variant="secondary" size="sm" onClick={loadData}>Tentar novamente</Button></div>}
      {feedback && <div role="status" className="rounded-md border border-success bg-success/12 p-4 text-body text-success">{feedback}</div>}

      {!error && accounts.length === 0 ? (
        <Card><EmptyState icon={WalletCards} title="Nenhuma conta bancária ativa" description="Cadastre uma conta antes de acompanhar reservas e saldos disponíveis." /></Card>
      ) : !error && (
        <>
          <section aria-labelledby="accounts-summary-title" className="space-y-5">
            <div><h2 id="accounts-summary-title" className="text-h1 text-warm-white">Disponibilidade por conta</h2><p className="mt-2 text-body text-steel">Valores retornados pela consulta financeira; o saldo disponível não é recalculado nesta tela.</p></div>
            <div className={`grid gap-4 ${accounts.length === 1 ? 'max-w-3xl' : accounts.length === 2 ? 'max-w-5xl md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
              {accounts.map((account) => <Card key={account.conta_bancaria_id}><Card.Header title={account.nome} /><Card.Body className={`grid gap-5 ${accounts.length === 1 ? 'sm:grid-cols-3' : ''}`}><div><p className="text-label text-steel">Saldo bancário</p><p className="mt-2 text-data-lg text-warm-white">{formatarBRL(account.saldo_bancario)}</p></div><div><p className="text-label text-steel">Reservado</p><p className="mt-2 text-data-lg text-warning">{formatarBRL(account.saldo_reservado)}</p></div><div><p className="text-label text-steel">Disponível</p><p className={`mt-2 text-data-lg ${Number(account.saldo_disponivel) < 0 ? 'text-danger' : 'text-success'}`}>{formatarBRL(account.saldo_disponivel)}</p></div><p className={`border-t border-line pt-4 text-body-sm text-steel ${accounts.length === 1 ? 'sm:col-span-3' : ''}`}>A reserva não cria uma segunda movimentação bancária.</p></Card.Body></Card>)}
            </div>
          </section>

          <section aria-labelledby="envelopes-title" className="space-y-5">
            <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-end"><div className="max-w-3xl"><h2 id="envelopes-title" className="text-h1 text-warm-white">Reservas por propósito</h2><p className="mt-2 text-body text-steel">Crie, edite e organize percentuais. O resgate permanece indisponível nesta fase.</p></div><div className="flex rounded-sm border border-line-strong p-1" role="group" aria-label="Filtro de envelopes"><Button size="sm" variant={!includeInactive ? 'secondary' : 'ghost'} aria-pressed={!includeInactive} onClick={() => setIncludeInactive(false)}>Ativos</Button><Button size="sm" variant={includeInactive ? 'secondary' : 'ghost'} aria-pressed={includeInactive} onClick={() => setIncludeInactive(true)}>Todos</Button></div></div>
            {envelopes.length === 0 ? <Card><EmptyState icon={Inbox} title="Nenhum envelope cadastrado" description="Os envelopes ativos aparecerão aqui quando forem cadastrados em uma próxima etapa operacional." /></Card> : (
              <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                {envelopes.map((envelope) => {
                  const account = accountById.get(envelope.conta_bancaria_id)
                  const status = classificarEnvelope(envelope, account)
                  const canReserve = podeAdicionarReserva(envelope, account)
                  const reserveHelpId = `envelope-${envelope.id}-reserve-help`
                  return <Card key={envelope.id} className="flex h-full flex-col" aria-labelledby={`envelope-${envelope.id}-title`}><Card.Body className="flex flex-1 flex-col"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><WalletCards size={20} className="mt-1 shrink-0 text-copper" aria-hidden="true" /><div className="min-w-0"><h3 id={`envelope-${envelope.id}-title`} className="text-h3 text-warm-white">{envelope.nome}</h3><p className="mt-1 text-body-sm text-steel">{envelope.finalidade}</p></div></div><Badge variant={status.variant}>{Number(envelope.percentual_distribuicao || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</Badge></div><p className="mt-4 text-body-sm text-steel">Conta vinculada: {envelope.conta_nome}</p><div className="mt-6"><p className="text-label text-steel">Saldo reservado</p><p className="mt-2 text-data-lg text-warm-white">{formatarBRL(envelope.saldo_acumulado)}</p></div>{account && <ReserveMeter className="mt-6 border-t border-line pt-4" label={`Uso de ${envelope.nome}`} bankBalance={account.saldo_bancario} reserved={account.saldo_reservado} available={account.saldo_disponivel} />}<div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4"><span className="text-body-sm text-steel">Situação</span><Badge variant={status.variant}>{status.label}</Badge></div><div className="mt-auto flex flex-col gap-3 pt-6"><Button className="w-full" disabled={!canReserve} aria-describedby={!canReserve ? reserveHelpId : undefined} onClick={() => openReserveModal(envelope)}><CirclePlus size={16} aria-hidden="true" />Adicionar reserva</Button>{!canReserve && <p id={reserveHelpId} className="text-body-sm text-steel">{!envelope.ativa ? 'Ative o envelope para adicionar uma reserva.' : !account ? 'A conta vinculada ainda não foi carregada.' : 'A conta não possui valor disponível para reservar.'}</p>}<div className="grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => openEnvelopeForm(envelope)}>Editar</Button><Button variant="ghost" disabled={envelope.ativa && Number(envelope.saldo_acumulado) > 0} aria-describedby={envelope.ativa && Number(envelope.saldo_acumulado) > 0 ? `envelope-${envelope.id}-status-help` : undefined} onClick={() => openStatusModal(envelope)}>{envelope.ativa ? 'Desativar' : 'Ativar'}</Button></div>{envelope.ativa && Number(envelope.saldo_acumulado) > 0 && <p id={`envelope-${envelope.id}-status-help`} className="text-body-sm text-warning">Resgate todo o saldo antes de desativar.</p>}<div className="grid grid-cols-2 gap-3"><Button variant="secondary" className="w-full" onClick={() => openStatement(envelope)}><History size={16} aria-hidden="true" />Ver extrato</Button><Button variant="ghost" className="w-full" disabled aria-describedby={`envelope-${envelope.id}-resgate-help`}><ReceiptText size={16} aria-hidden="true" />Usar / resgatar</Button></div><p id={`envelope-${envelope.id}-resgate-help`} className="text-body-sm text-steel">Disponível após a implantação de lançamentos manuais a pagar.</p></div></Card.Body></Card>
                })}
              </div>
            )}
          </section>
        </>
      )}

      <Modal open={Boolean(formModal)} onClose={closeEnvelopeForm} title={formModal?.mode === 'edit' ? 'Editar envelope' : 'Novo envelope'} footer={<><Button variant="secondary" onClick={closeEnvelopeForm}>Cancelar</Button><Button type="submit" form="envelope-form" loading={submitting}>{formModal?.mode === 'edit' ? 'Salvar alterações' : 'Criar envelope'}</Button></>}>
        {formModal && <form id="envelope-form" className="space-y-5" onSubmit={submitEnvelopeForm}>
          <div><Label htmlFor="envelope-name">Nome</Label><Input id="envelope-name" required maxLength={80} value={formModal.nome} onChange={(event) => setFormModal((current) => ({ ...current, nome: event.target.value }))} /></div>
          <div><Label htmlFor="envelope-purpose">Finalidade</Label><select id="envelope-purpose" required value={formModal.finalidade} onChange={(event) => setFormModal((current) => ({ ...current, finalidade: event.target.value }))} className="mt-2 h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30">{FINALIDADES_ENVELOPE.map((purpose) => <option key={purpose} value={purpose}>{PURPOSE_LABELS[purpose]}</option>)}</select></div>
          <div><Label htmlFor="envelope-account">Conta bancária ativa</Label><select id="envelope-account" required disabled={formModal.mode === 'edit' && Number(formModal.row.saldo_acumulado) > 0} value={formModal.contaBancariaId} onChange={(event) => setFormModal((current) => ({ ...current, contaBancariaId: event.target.value }))} className="mt-2 h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white disabled:opacity-50 focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30">{accounts.map((account) => <option key={account.conta_bancaria_id} value={account.conta_bancaria_id}>{account.nome}</option>)}</select>{formModal.mode === 'edit' && Number(formModal.row.saldo_acumulado) > 0 && <p className="mt-2 text-body-sm text-warning">A conta não pode ser alterada enquanto o envelope tiver saldo.</p>}</div>
          <div><Label htmlFor="envelope-percentage">Percentual de distribuição (opcional)</Label><Input id="envelope-percentage" type="number" min="0" max="100" step="0.01" value={formModal.percentual} onChange={(event) => setFormModal((current) => ({ ...current, percentual: event.target.value }))} /></div>
          {formModal.error && <div role="alert" className="rounded-md border border-danger bg-danger/12 p-4 text-body text-danger">{formModal.error}{formModal.conflict && <div className="mt-3"><Button variant="secondary" size="sm" onClick={reloadConflictedEnvelope}>Recarregar dados atuais</Button></div>}</div>}
        </form>}
      </Modal>

      <Modal open={Boolean(reserveModal)} onClose={closeReserveModal} title="Adicionar reserva" footer={<><Button variant="secondary" onClick={closeReserveModal}>Cancelar</Button><Button type="submit" form="reserve-form" loading={submitting}>Adicionar reserva</Button></>}>
        {reserveModal && <form id="reserve-form" className="space-y-5" onSubmit={confirmReserve}>
          <div><p className="text-label text-steel">Envelope</p><p className="mt-2 text-body text-warm-white">{reserveModal.row.nome}</p></div>
          <div><p className="text-label text-steel">Conta vinculada</p><p className="mt-2 text-body text-warm-white">{accountById.get(reserveModal.row.conta_bancaria_id)?.nome ?? reserveModal.row.conta_nome}</p></div>
          <div><p className="text-label text-steel">Saldo disponível atual</p><p className="mt-2 text-data-lg text-success">{formatarBRL(accountById.get(reserveModal.row.conta_bancaria_id)?.saldo_disponivel)}</p></div>
          <CurrencyInput id="reserve-value" label="Valor a reservar" value={reserveModal.valor} onValueChange={(valor) => setReserveModal((current) => ({ ...current, valor, error: '' }))} error={reserveModal.error} autoFocus />
          <p className="rounded-md border border-info bg-info/12 p-4 text-body text-steel">Esta operação reserva parte do saldo da conta no sistema. O saldo bancário real não é movimentado.</p>
        </form>}
      </Modal>

      <Modal open={Boolean(statusModal)} onClose={closeStatusModal} title={statusModal?.row.ativa ? 'Desativar envelope' : 'Ativar envelope'} footer={<><Button variant="secondary" onClick={closeStatusModal}>Cancelar</Button><Button variant={statusModal?.row.ativa ? 'danger' : 'primary'} loading={submitting} onClick={confirmStatusChange}>{statusModal?.row.ativa ? 'Desativar' : 'Ativar'}</Button></>}>
        {statusModal && <div className="space-y-4"><p className="text-body text-steel">Confirme a alteração de situação do envelope <strong className="text-warm-white">{statusModal.row.nome}</strong>.</p>{statusModal.error && <div role="alert" className="rounded-md border border-danger bg-danger/12 p-4 text-body text-danger">{statusModal.error}</div>}</div>}
      </Modal>

      <Modal open={Boolean(distribution)} onClose={closeDistribution} title="Distribuir lucro diário" className="max-w-3xl" footer={<><Button variant="secondary" onClick={closeDistribution}>Cancelar</Button>{distribution?.simulation ? <Button loading={submitting} disabled={simulationValue <= 0 || insufficientAccounts.length > 0} onClick={confirmDistribution}>Confirmar distribuição</Button> : <Button loading={distribution?.loading} onClick={simulateDistribution}>Simular distribuição</Button>}</>}>
        {distribution && <div className="space-y-5">
          <div><Label htmlFor="distribution-date">Data de competência (BRT)</Label><Input id="distribution-date" type="date" required max={dataCompetenciaBrt()} value={distribution.data} onChange={(event) => { distributionIntentRef.current = null; setDistribution((current) => ({ ...current, data: event.target.value, simulation: null, error: '' })) }} /></div>
          <p className="text-body-sm text-steel">A confirmação só fica disponível depois da simulação desta data.</p>
          {distribution.error && <div role="alert" className="rounded-md border border-danger bg-danger/12 p-4 text-body text-danger">{distribution.error}</div>}
          {distribution.simulation && <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-label text-steel">Base distribuível</p><p className="mt-2 text-data text-warm-white">{formatarBRL(simulationBase)}</p></div><div><p className="text-label text-steel">Percentual total</p><p className="mt-2 text-data text-warm-white">{Number(distribution.simulation.percentual_total || 0).toLocaleString('pt-BR')}%</p></div><div><p className="text-label text-steel">A distribuir</p><p className="mt-2 text-data text-success">{formatarBRL(simulationValue)}</p></div><div><p className="text-label text-steel">Resíduo</p><p className="mt-2 text-data text-steel">{formatarBRL(simulationBase - simulationValue)}</p></div></div>
            <div className="space-y-3"><h3 className="text-h3 text-warm-white">Destino da distribuição</h3>{simulationItems.length === 0 ? <p className="text-body text-steel">Nenhum envelope receberá valor nesta data.</p> : simulationItems.map((item) => <div key={item.envelope_id} className="flex items-center justify-between gap-4 rounded-sm border border-line p-3"><div><p className="text-body text-warm-white">{item.envelope_nome ?? envelopes.find((row) => row.id === item.envelope_id)?.nome ?? 'Envelope'}</p><p className="text-body-sm text-steel">{accountById.get(item.conta_bancaria_id)?.nome ?? 'Conta vinculada'} · {Number(item.percentual || 0).toLocaleString('pt-BR')}%</p></div><span className="text-data text-warm-white">{formatarBRL(item.valor)}</span></div>)}</div>
            {insufficientAccounts.length > 0 && <div role="alert" className="rounded-md border border-warning bg-warning/12 p-4 text-body text-warning">Saldo disponível insuficiente nas contas vinculadas. Transfira recursos em Contas antes de confirmar a distribuição.</div>}
          </div>}
        </div>}
      </Modal>

      <Modal open={Boolean(selected)} onClose={closeStatement} title={selected ? `Extrato — ${selected.nome}` : 'Extrato'} className="max-w-5xl" footer={<Button variant="secondary" onClick={closeStatement}>Fechar extrato</Button>}>
        {selected && <div className="space-y-4"><p className="text-body text-steel">Movimentos do mês atual em BRT. Distribuição, resgate e estorno não criam uma segunda saída bancária.</p>{transactionsError && <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-danger bg-danger/12 p-4 text-body text-danger"><span>{transactionsError}</span><Button variant="secondary" size="sm" onClick={() => loadStatement(selected, transactionsPage)}>Tentar novamente</Button></div>}<DataTable caption={`Extrato real do envelope ${selected.nome}`} columns={transactionColumns} rows={transactions} loading={transactionsLoading} emptyTitle="Nenhuma transação no período" emptyDescription="Este envelope não possui movimentos no mês atual." /><div className="flex items-center justify-between gap-4"><Button variant="ghost" size="sm" disabled={transactionsLoading || transactionsPage <= 1} onClick={() => loadStatement(selected, transactionsPage - 1)}>Anterior</Button><span className="text-data text-steel">Página {transactionsPage} de {totalPages}</span><Button variant="ghost" size="sm" disabled={transactionsLoading || transactionsPage >= totalPages} onClick={() => loadStatement(selected, transactionsPage + 1)}>Próxima</Button></div></div>}
      </Modal>
    </div>
  )
}
