import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Landmark, Tags } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import CurrencyInput from '../../components/ui/CurrencyInput'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import {
  criarCategoria,
  criarContaBancaria,
  definirCategoriaAtiva,
  definirContaAtiva,
  definirContaPrincipal,
  editarCategoria,
  editarContaBancaria,
  listarCategoriasCadastro,
  listarContasBancariasCadastro,
} from '../../lib/financeiro/api'
import { mensagemErroCadastro } from '../../lib/financeiro/cadastros-ui'
import { formatarBRL } from '../../lib/financeiro/moeda'
import { GRUPOS_DRE, TIPOS_CATEGORIA, TIPOS_CONTA } from '../../lib/financeiro/schemas'

const accountColumns = [
  { key: 'nome', header: 'Nome' },
  { key: 'instituicao', header: 'Instituição', render: (value) => value || 'Não informada' },
  { key: 'tipo', header: 'Tipo' },
  { key: 'saldo_inicial', header: 'Saldo inicial', align: 'right', dataType: true, render: formatarBRL },
  { key: 'ativa', header: 'Situação', render: (value) => <Badge variant={value ? 'success' : 'neutral'}>{value ? 'Ativa' : 'Inativa'}</Badge> },
  { key: 'conta_principal', header: 'Principal', render: (value) => <Badge variant={value ? 'info' : 'neutral'}>{value ? 'Principal' : 'Secundária'}</Badge> },
]

const categoryColumns = [
  { key: 'nome', header: 'Nome' },
  { key: 'tipo', header: 'Tipo', render: (value) => <Badge variant={value === 'entrada' ? 'success' : value === 'saida' ? 'warning' : 'info'}>{value}</Badge> },
  { key: 'grupo_dre', header: 'Grupo DRE' },
  { key: 'ativa', header: 'Situação', render: (value) => <Badge variant={value ? 'success' : 'neutral'}>{value ? 'Ativa' : 'Inativa'}</Badge> },
]

const SELECT_CLASS = 'h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white transition-colors duration-100 ease-brand focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-40'

function SelectField({ id, label, value, onChange, options, error, helpText, disabled }) {
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-steel">{label}</label>
      <select id={id} value={value} onChange={onChange} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : helpText ? helpId : undefined} className={[SELECT_CLASS, error ? 'border-danger' : ''].filter(Boolean).join(' ')}>
        <option value="">Selecione</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error ? <p id={errorId} className="text-body-sm text-danger">{error}</p> : helpText ? <p id={helpId} className="text-body-sm text-steel">{helpText}</p> : null}
    </div>
  )
}

function labelize(value) {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function initialForm(modal) {
  const row = modal?.row
  if (modal?.entity === 'account') return { nome: row?.nome ?? '', instituicao: row?.instituicao ?? '', tipo: row?.tipo ?? '', saldoValue: row ? Number(row.saldo_inicial ?? 0) : null, negativeConfirmed: false }
  return { nome: row?.nome ?? '', tipo: row?.tipo ?? '', grupoDre: row?.grupo_dre ?? '' }
}

export default function FinanceRegistrations() {
  const [tab, setTab] = useState('accounts')
  const [accountFilter, setAccountFilter] = useState('active')
  const [categoryFilter, setCategoryFilter] = useState('active')
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [substituteId, setSubstituteId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const createIntentRef = useRef(null)

  const loadAccounts = useCallback(async () => {
    const rows = await listarContasBancariasCadastro({ incluirInativas: accountFilter === 'all' })
    setAccounts(rows ?? [])
    return rows ?? []
  }, [accountFilter])

  const loadCategories = useCallback(async () => {
    const rows = await listarCategoriasCadastro({ incluirInativas: categoryFilter === 'all' })
    setCategories(rows ?? [])
    return rows ?? []
  }, [categoryFilter])

  const loadActiveTab = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'accounts') await loadAccounts()
      else await loadCategories()
    } catch (requestError) {
      setError(mensagemErroCadastro(requestError).message)
    } finally {
      setLoading(false)
    }
  }, [loadAccounts, loadCategories, tab])

  useEffect(() => { loadActiveTab() }, [loadActiveTab])

  const activeAccounts = useMemo(() => accounts.filter((account) => account.ativa), [accounts])

  function openModal(nextModal) {
    if (nextModal.kind === 'form' && nextModal.mode === 'create') createIntentRef.current = crypto.randomUUID()
    else createIntentRef.current = null
    setModal(nextModal)
    setForm(initialForm(nextModal))
    setErrors({})
    setSubstituteId('')
    setStatus('')
  }

  function closeModal() {
    if (submitting) return
    createIntentRef.current = null
    setModal(null)
  }

  function validateForm() {
    const nextErrors = {}
    const name = String(form.nome ?? '').trim()
    if (name.length < 2 || name.length > 100) nextErrors.nome = 'Informe entre 2 e 100 caracteres.'
    if (modal.entity === 'account') {
      if (String(form.instituicao ?? '').trim().length > 100) nextErrors.instituicao = 'Use no máximo 100 caracteres.'
      if (!TIPOS_CONTA.includes(form.tipo)) nextErrors.tipo = 'Selecione um tipo de conta válido.'
      if (modal.mode === 'create' && !Number.isFinite(form.saldoValue)) nextErrors.saldo = 'Informe um saldo inicial válido.'
      if (modal.mode === 'create' && form.saldoValue < 0 && !form.negativeConfirmed) nextErrors.negativeConfirmed = 'Confirme explicitamente o saldo inicial negativo.'
    } else {
      if (!TIPOS_CATEGORIA.includes(form.tipo)) nextErrors.tipo = 'Selecione um tipo de categoria válido.'
      if (!GRUPOS_DRE.includes(form.grupoDre)) nextErrors.grupoDre = 'Selecione um grupo DRE válido.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function validateAction() {
    const nextErrors = {}
    if (modal.action === 'deactivate' && modal.entity === 'account' && modal.row.conta_principal && !substituteId) nextErrors.substitute = 'Escolha uma conta ativa substituta.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function executeOperation() {
    if (modal.kind === 'form' && modal.entity === 'account' && modal.mode === 'create') return criarContaBancaria({ nome: form.nome, instituicao: form.instituicao, tipo: form.tipo, saldoInicial: form.saldoValue, idempotencyKey: createIntentRef.current })
    if (modal.kind === 'form' && modal.entity === 'account') return editarContaBancaria({ contaId: modal.row.id, nome: form.nome, instituicao: form.instituicao, tipo: form.tipo, expectedUpdatedAt: modal.row.updated_at })
    if (modal.kind === 'form' && modal.entity === 'category' && modal.mode === 'create') return criarCategoria({ nome: form.nome, tipo: form.tipo, grupoDre: form.grupoDre, idempotencyKey: createIntentRef.current })
    if (modal.kind === 'form' && modal.entity === 'category') return editarCategoria({ categoriaId: modal.row.id, nome: form.nome, tipo: form.tipo, grupoDre: form.grupoDre, expectedUpdatedAt: modal.row.updated_at })
    if (modal.entity === 'account' && modal.action === 'principal') return definirContaPrincipal({ contaId: modal.row.id })
    if (modal.entity === 'account') return definirContaAtiva({ contaId: modal.row.id, ativa: modal.action === 'reactivate', contaSubstitutaId: substituteId || null })
    return definirCategoriaAtiva({ categoriaId: modal.row.id, ativa: modal.action === 'reactivate' })
  }

  async function submit(event) {
    event.preventDefault()
    const valid = modal.kind === 'form' ? validateForm() : validateAction()
    if (!valid) return
    setSubmitting(true)
    setErrors({})
    try {
      await executeOperation()
      const entity = modal.entity
      const successMessage = successDescription(modal)
      if (entity === 'account') await loadAccounts()
      else await loadCategories()
      createIntentRef.current = null
      setModal(null)
      setStatus(successMessage)
    } catch (operationError) {
      const mapped = mensagemErroCadastro(operationError)
      setErrors({ submit: mapped.message, conflict: mapped.conflict })
    } finally {
      setSubmitting(false)
    }
  }

  async function reloadConflict() {
    setSubmitting(true)
    try {
      const rows = modal.entity === 'account' ? await loadAccounts() : await loadCategories()
      const freshRow = rows.find((row) => row.id === modal.row.id)
      if (!freshRow) throw new Error('FINANCEIRO_CADASTRO_NAO_ENCONTRADO')
      const nextModal = { ...modal, row: freshRow }
      setModal(nextModal)
      setForm(initialForm(nextModal))
      setErrors({})
    } catch (reloadError) {
      setErrors({ submit: mensagemErroCadastro(reloadError).message })
    } finally {
      setSubmitting(false)
    }
  }

  function renderAccountActions(row) {
    return <div className="flex min-w-max flex-wrap justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'form', entity: 'account', mode: 'edit', row })}>Editar</Button>
      {row.ativa && !row.conta_principal && <Button size="sm" variant="secondary" onClick={() => openModal({ kind: 'action', entity: 'account', action: 'principal', row })}>Tornar principal</Button>}
      {row.ativa && <Button size="sm" variant="danger" onClick={() => openModal({ kind: 'action', entity: 'account', action: 'deactivate', row })}>Desativar</Button>}
      {!row.ativa && <Button size="sm" variant="secondary" onClick={() => openModal({ kind: 'action', entity: 'account', action: 'reactivate', row })}>Reativar</Button>}
    </div>
  }

  function renderCategoryActions(row) {
    return <div className="flex min-w-max flex-wrap justify-end gap-2">
      {row.ativa && <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'form', entity: 'category', mode: 'edit', row })}>Editar</Button>}
      {row.ativa && <Button size="sm" variant="danger" onClick={() => openModal({ kind: 'action', entity: 'category', action: 'deactivate', row })}>Desativar</Button>}
      {!row.ativa && <Button size="sm" variant="secondary" onClick={() => openModal({ kind: 'action', entity: 'category', action: 'reactivate', row })}>Reativar</Button>}
    </div>
  }

  const accountContent = <RegistrationSection filter={accountFilter} setFilter={setAccountFilter} onCreate={() => openModal({ kind: 'form', entity: 'account', mode: 'create' })} createLabel="Nova conta"><DataTable columns={accountColumns} rows={accounts} loading={loading} caption="Contas bancárias cadastradas" emptyIcon={Landmark} emptyTitle="Nenhuma conta bancária" emptyDescription="Cadastre uma conta para iniciar o controle financeiro." renderAction={renderAccountActions} /></RegistrationSection>
  const categoryContent = <RegistrationSection filter={categoryFilter} setFilter={setCategoryFilter} onCreate={() => openModal({ kind: 'form', entity: 'category', mode: 'create' })} createLabel="Nova categoria"><DataTable columns={categoryColumns} rows={categories} loading={loading} caption="Categorias financeiras cadastradas" emptyIcon={Tags} emptyTitle="Nenhuma categoria financeira" emptyDescription="Cadastre categorias para classificar os movimentos financeiros." renderAction={renderCategoryActions} /></RegistrationSection>

  return <div className="mx-auto max-w-7xl space-y-8">
    <header><h1 className="text-display text-warm-white">Cadastros financeiros</h1><p className="mt-2 text-body text-steel">Gerencie contas bancárias e categorias da sua barbearia.</p></header>
    {status && <div role="status" className="rounded-md border border-success bg-success/12 p-4 text-body text-success">{status}</div>}
    {error && <div role="alert" className="flex flex-col items-start gap-4 rounded-md border border-danger bg-danger/12 p-4 text-body text-danger sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button variant="secondary" size="sm" onClick={loadActiveTab}>Tentar novamente</Button></div>}
    <Tabs label="Cadastros financeiros" value={tab} onValueChange={(value) => { setTab(value); setStatus('') }} items={[{ value: 'accounts', label: 'Contas bancárias', content: accountContent }, { value: 'categories', label: 'Categorias', content: categoryContent }]} />
    {modal && <RegistrationModal modal={modal} form={form} setForm={setForm} errors={errors} substituteId={substituteId} setSubstituteId={setSubstituteId} activeAccounts={activeAccounts} submitting={submitting} onClose={closeModal} onSubmit={submit} onReload={reloadConflict} />}
  </div>
}

function RegistrationSection({ filter, setFilter, onCreate, createLabel, children }) {
  return <section className="space-y-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2"><Button size="sm" variant={filter === 'active' ? 'secondary' : 'ghost'} onClick={() => setFilter('active')}>Ativas</Button><Button size="sm" variant={filter === 'all' ? 'secondary' : 'ghost'} onClick={() => setFilter('all')}>Todas</Button></div><Button onClick={onCreate}>{createLabel}</Button></div>{children}</section>
}

function RegistrationModal({ modal, form, setForm, errors, substituteId, setSubstituteId, activeAccounts, submitting, onClose, onSubmit, onReload }) {
  const isForm = modal.kind === 'form'
  const isAccount = modal.entity === 'account'
  const title = isForm ? `${modal.mode === 'create' ? 'Nova' : 'Editar'} ${isAccount ? 'conta bancária' : 'categoria financeira'}` : `${modal.action === 'principal' ? 'Tornar conta principal' : modal.action === 'deactivate' ? 'Desativar' : 'Reativar'} ${isAccount ? 'conta' : 'categoria'}`
  return <Modal open onClose={onClose} title={title} className="max-h-screen overflow-y-auto" footer={<><Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>{errors.conflict && <Button variant="secondary" onClick={onReload} disabled={submitting}>Recarregar dados</Button>}<Button type="submit" form="registration-form" loading={submitting} disabled={isForm && isAccount && modal.mode === 'create' && form.saldoValue < 0 && !form.negativeConfirmed}>{submitLabel(modal)}</Button></>}>
    <form id="registration-form" className="space-y-5" onSubmit={onSubmit} noValidate>
      <p className="text-body text-steel">{isForm ? 'Revise os dados antes de salvar.' : actionDescription(modal)}</p>
      {errors.submit && <div role="alert" className="rounded-md border border-danger bg-danger/12 p-4 text-body-sm text-danger">{errors.submit}</div>}
      {isForm && isAccount && <AccountForm modal={modal} form={form} setForm={setForm} errors={errors} disabled={submitting} />}
      {isForm && !isAccount && <CategoryForm form={form} setForm={setForm} errors={errors} disabled={submitting} />}
      {!isForm && modal.action === 'deactivate' && isAccount && modal.row.conta_principal && <SelectField id="substitute-account" label="Conta principal substituta" value={substituteId} onChange={(event) => setSubstituteId(event.target.value)} options={activeAccounts.filter((account) => account.id !== modal.row.id).map((account) => ({ value: account.id, label: account.nome }))} error={errors.substitute} helpText="A substituição e a desativação serão realizadas na mesma operação." disabled={submitting} />}
      {!isForm && modal.entity === 'category' && modal.action === 'deactivate' && <div className="rounded-md border border-info bg-info/12 p-4 text-body-sm text-info">O histórico existente será preservado. Use uma nova categoria para classificações futuras.</div>}
      {!isForm && modal.action === 'reactivate' && <div className="rounded-md border border-warning bg-warning/12 p-4 text-body-sm text-warning">A reativação será recusada se já existir um nome ativo equivalente.</div>}
    </form>
  </Modal>
}

function AccountForm({ modal, form, setForm, errors, disabled }) {
  const negative = modal.mode === 'create' && form.saldoValue < 0
  return <><Input label="Nome" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} error={errors.nome} maxLength={100} required disabled={disabled} /><Input label="Instituição" value={form.instituicao} onChange={(event) => setForm((current) => ({ ...current, instituicao: event.target.value }))} error={errors.instituicao} helpText="Opcional, até 100 caracteres." maxLength={100} disabled={disabled} /><SelectField id="account-type" label="Tipo" value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))} options={TIPOS_CONTA.map((value) => ({ value, label: labelize(value) }))} error={errors.tipo} disabled={disabled} />{modal.mode === 'create' ? <CurrencyInput label="Saldo inicial" value={form.saldoValue} onValueChange={(value) => setForm((current) => ({ ...current, saldoValue: value, negativeConfirmed: value < 0 ? current.negativeConfirmed : false }))} allowNegative error={errors.saldo} helpText="Digite apenas algarismos. A primeira conta ativa será definida como principal automaticamente." disabled={disabled} /> : <Card><p className="text-label text-steel">Saldo inicial imutável</p><p className="mt-2 text-data text-warm-white">{formatarBRL(modal.row.saldo_inicial)}</p><p className="mt-2 text-body-sm text-steel">Correções devem ocorrer por movimento de ajuste auditável.</p></Card>}{negative && <div className="space-y-3 rounded-md border border-warning bg-warning/12 p-4"><p className="text-body-sm text-warning">Saldo negativo representa uma conta que inicia devedora.</p><label className="flex items-start gap-3 text-body-sm text-warm-white"><input type="checkbox" checked={form.negativeConfirmed} onChange={(event) => setForm((current) => ({ ...current, negativeConfirmed: event.target.checked }))} disabled={disabled} aria-invalid={errors.negativeConfirmed ? true : undefined} className="mt-1 h-4 w-4 rounded-sm border border-line-strong accent-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" /><span>Confirmo que esta conta inicia com saldo negativo.</span></label>{errors.negativeConfirmed && <p className="text-body-sm text-danger">{errors.negativeConfirmed}</p>}</div>}</>
}

function CategoryForm({ form, setForm, errors, disabled }) {
  return <><Input label="Nome" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} error={errors.nome} maxLength={100} required disabled={disabled} /><SelectField id="category-type" label="Tipo" value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))} options={TIPOS_CATEGORIA.map((value) => ({ value, label: labelize(value) }))} error={errors.tipo} disabled={disabled} /><SelectField id="category-dre" label="Grupo DRE" value={form.grupoDre} onChange={(event) => setForm((current) => ({ ...current, grupoDre: event.target.value }))} options={GRUPOS_DRE.map((value) => ({ value, label: labelize(value) }))} error={errors.grupoDre} helpText="A classificação define a apresentação na DRE." disabled={disabled} /></>
}

function submitLabel(modal) {
  if (modal.kind === 'form') return modal.mode === 'create' ? 'Cadastrar' : 'Salvar alterações'
  if (modal.action === 'principal') return 'Tornar principal'
  return modal.action === 'deactivate' ? 'Desativar' : 'Reativar'
}

function successDescription(modal) {
  if (modal.kind === 'form') return `${modal.entity === 'account' ? 'Conta bancária' : 'Categoria'} ${modal.mode === 'create' ? 'cadastrada' : 'atualizada'} com sucesso.`
  if (modal.action === 'principal') return 'Conta principal atualizada com sucesso.'
  return `${modal.entity === 'account' ? 'Conta bancária' : 'Categoria'} ${modal.action === 'deactivate' ? 'desativada' : 'reativada'} com sucesso.`
}

function actionDescription(modal) {
  if (modal.action === 'principal') return `A conta “${modal.row.nome}” passará a ser a principal.`
  if (modal.action === 'deactivate') return `“${modal.row.nome}” deixará de estar disponível para novas operações. O histórico será preservado.`
  return `“${modal.row.nome}” voltará a ficar disponível para novas operações.`
}
