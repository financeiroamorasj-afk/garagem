import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Mail,
  Pencil,
  Percent,
  Phone,
  Scissors,
  Search,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { atualizarBarbeiro, criarBarbeiroComAcesso, listarBarbeiros } from '../lib/barbeiros/api'
import { mensagemErroBarbeiro } from '../lib/barbeiros/ui'

function initialForm(row) {
  return {
    nome: row?.nome ?? '',
    apelido: row?.apelido ?? '',
    email: row?.email ?? '',
    telefone: row?.telefone ?? '',
    especialidade: row?.especialidade ?? '',
    comissao_percentual: row?.comissao_percentual ?? '',
    comissao_produtos_percentual: row?.comissao_produtos_percentual ?? '',
  }
}

function displayName(barber) {
  return barber.apelido || barber.nome
}

export default function AdminBarbers() {
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState('active')
  const [query, setQuery] = useState('')
  const [formModal, setFormModal] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [form, setForm] = useState(initialForm())
  const [errors, setErrors] = useState({})
  const [pageError, setPageError] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      setBarbers(await listarBarbeiros({ incluirInativos: true }))
    } catch (error) {
      setPageError(mensagemErroBarbeiro(error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    total: barbers.length,
    active: barbers.filter((barber) => barber.ativo).length,
    access: barbers.filter((barber) => barber.user_id).length,
  }), [barbers])

  const visibleBarbers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    return barbers.filter((barber) => {
      if (filter === 'active' && !barber.ativo) return false
      if (!normalizedQuery) return true
      return [barber.nome, barber.apelido, barber.email, barber.telefone, barber.especialidade]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalizedQuery))
    })
  }, [barbers, filter, query])

  function openForm(row = null) {
    setFormModal(row ? { mode: 'edit', row } : { mode: 'create', row: null })
    setForm(initialForm(row))
    setErrors({})
    setStatus('')
  }

  function closeForm() {
    if (submitting) return
    setFormModal(null)
    setErrors({})
  }

  function validateForm() {
    const nextErrors = {}
    const nome = form.nome.trim()
    const apelido = form.apelido.trim()
    const telefone = form.telefone.trim()
    const needsAccess = !formModal?.row?.user_id
    const commission = form.comissao_percentual === '' ? null : Number(form.comissao_percentual)
    const productCommission = form.comissao_produtos_percentual === '' ? null : Number(form.comissao_produtos_percentual)
    if (nome.length < 2 || nome.length > 120) nextErrors.nome = 'Informe entre 2 e 120 caracteres.'
    if (apelido && (apelido.length < 2 || apelido.length > 60)) nextErrors.apelido = 'Informe entre 2 e 60 caracteres.'
    if (telefone && (telefone.length < 8 || telefone.length > 30)) nextErrors.telefone = 'Informe um telefone válido.'
    if (needsAccess && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Informe o e-mail que o barbeiro usará para entrar.'
    if (commission !== null && (!Number.isFinite(commission) || commission < 0 || commission > 100)) nextErrors.comissao = 'Use um percentual entre 0 e 100.'
    if (productCommission !== null && (!Number.isFinite(productCommission) || productCommission < 0 || productCommission > 100)) nextErrors.comissaoProdutos = 'Use um percentual entre 0 e 100.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function submitForm(event) {
    event.preventDefault()
    if (!validateForm()) return
    setSubmitting(true)
    setErrors({})
    try {
      const row = formModal.row
      if (!row?.user_id) {
        await criarBarbeiroComAcesso({ ...form, id: row?.id })
      } else {
        await atualizarBarbeiro({
          ...form,
          id: row.id,
          ativo: row.ativo,
          expectedUpdatedAt: row.updated_at,
        })
      }
      await load()
      setFormModal(null)
      setStatus(row
        ? row.user_id
          ? `${displayName(row)} foi atualizado.`
          : `Acesso criado e convite enviado para ${form.email.trim().toLowerCase()}.`
        : `Barbeiro cadastrado e convite enviado para ${form.email.trim().toLowerCase()}.`)
    } catch (error) {
      const mapped = mensagemErroBarbeiro(error)
      setErrors({ submit: mapped.message, conflict: mapped.conflict })
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmStatusChange() {
    if (!statusTarget) return
    setSubmitting(true)
    setErrors({})
    try {
      await atualizarBarbeiro({
        ...statusTarget,
        ativo: !statusTarget.ativo,
        expectedUpdatedAt: statusTarget.updated_at,
      })
      await load()
      setStatus(`${displayName(statusTarget)} foi ${statusTarget.ativo ? 'desativado' : 'reativado'}.`)
      setStatusTarget(null)
    } catch (error) {
      const mapped = mensagemErroBarbeiro(error)
      setErrors({ status: mapped.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-2 block text-label text-copper">EQUIPE & ACESSOS</span>
          <h1 className="text-h1 text-warm-white sm:text-display">Barbeiros</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">
            Cadastre a equipe e entregue a cada barbeiro um acesso individual à própria agenda.
          </p>
        </div>
        <Button size="lg" onClick={() => openForm()} className="w-full gap-2 sm:w-auto">
          <UserPlus size={18} aria-hidden="true" /> Novo barbeiro
        </Button>
      </header>

      {status && (
        <div role="status" className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-warm-white">
          <UserCheck size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <span>{status}</span>
        </div>
      )}
      {pageError && (
        <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <span>{pageError}</span>
          <Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>
        </div>
      )}

      <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Resumo da equipe">
        <Card className="min-w-0 p-3 sm:p-5">
          <Users size={18} className="mb-3 text-copper" aria-hidden="true" />
          <span className="block text-data text-warm-white">{stats.total}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-label text-steel sm:text-label">Cadastrados</span>
        </Card>
        <Card className="min-w-0 p-3 sm:p-5">
          <UserCheck size={18} className="mb-3 text-success" aria-hidden="true" />
          <span className="block text-data text-warm-white">{stats.active}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-label text-steel sm:text-label">Ativos</span>
        </Card>
        <Card className="min-w-0 p-3 sm:p-5">
          <KeyRound size={18} className="mb-3 text-info" aria-hidden="true" />
          <span className="block text-data text-warm-white">{stats.access}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-label text-steel sm:text-label">Com acesso</span>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex gap-2">
            <Button size="sm" variant={filter === 'active' ? 'secondary' : 'ghost'} onClick={() => setFilter('active')}>Ativos</Button>
            <Button size="sm" variant={filter === 'all' ? 'secondary' : 'ghost'} onClick={() => setFilter('all')}>Todos</Button>
          </div>
          <div className="w-full sm:max-w-xs">
            <Input label="Buscar na equipe" icon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, apelido ou telefone" />
          </div>
        </div>

        {loading ? (
          <Card className="flex min-h-48 items-center justify-center gap-3 text-body text-steel">
            <Spinner size={22} /> Carregando equipe
          </Card>
        ) : visibleBarbers.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title={query ? 'Nenhum barbeiro encontrado' : 'Nenhum barbeiro cadastrado'}
              description={query ? 'Tente buscar por outro nome ou telefone.' : 'Cadastre o primeiro profissional e envie seu acesso individual.'}
              action={!query && <Button onClick={() => openForm()}>Cadastrar barbeiro</Button>}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleBarbers.map((barber) => (
              <Card key={barber.id} className={`flex min-w-0 flex-col gap-5 p-4 sm:p-6 ${barber.ativo ? '' : 'opacity-70'}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10 text-h2 text-copper">
                      {displayName(barber).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-h3 text-warm-white">{displayName(barber)}</h2>
                      <p className="truncate text-body-sm text-steel">{barber.nome}</p>
                    </div>
                  </div>
                  <Badge variant={barber.ativo ? 'success' : 'neutral'}>{barber.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </div>

                <div className="space-y-3 rounded-sm border border-line bg-surface-0 p-3">
                  <p className="flex min-w-0 items-center gap-2 text-body-sm text-steel">
                    <Scissors size={15} className="shrink-0 text-copper" aria-hidden="true" />
                    <span className="truncate">{barber.especialidade || 'Especialidade não informada'}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-body-sm text-steel">
                    <Phone size={15} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{barber.telefone || 'Telefone não informado'}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-body-sm text-steel">
                    <Mail size={15} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{barber.email || 'Acesso ainda não criado'}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-body-sm text-steel">
                    <Percent size={15} className="shrink-0" aria-hidden="true" />
                    <span>{barber.comissao_percentual === null ? 'Serviços: não definida' : `Serviços: ${Number(barber.comissao_percentual).toLocaleString('pt-BR')}%`}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-body-sm text-steel">
                    <Percent size={15} className="shrink-0 text-info" aria-hidden="true" />
                    <span>{barber.comissao_produtos_percentual === null ? 'Produtos: não definida' : `Produtos: ${Number(barber.comissao_produtos_percentual).toLocaleString('pt-BR')}%`}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Badge variant={barber.user_id ? 'info' : 'warning'}>
                    {barber.user_id ? 'Acesso vinculado' : 'Acesso pendente'}
                  </Badge>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openForm(barber)}>
                      <Pencil size={15} aria-hidden="true" /> {barber.user_id ? 'Editar' : 'Criar acesso'}
                    </Button>
                    <Button size="sm" variant={barber.ativo ? 'danger' : 'secondary'} onClick={() => { setErrors({}); setStatusTarget(barber) }}>
                      {barber.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {formModal && (
        <Modal
          open
          onClose={closeForm}
          title={formModal.mode === 'create' ? 'Novo barbeiro' : formModal.row.user_id ? 'Editar barbeiro' : 'Completar cadastro e acesso'}
          className="sm:max-w-xl"
          footer={(
            <>
              <Button variant="ghost" onClick={closeForm} disabled={submitting}>Cancelar</Button>
              {errors.conflict && <Button variant="secondary" onClick={load} disabled={submitting}>Recarregar</Button>}
              <Button type="submit" form="barber-form" loading={submitting}>
                {formModal.row?.user_id ? 'Salvar' : 'Cadastrar e convidar'}
              </Button>
            </>
          )}
        >
          <form id="barber-form" className="space-y-4" onSubmit={submitForm} noValidate>
            {!formModal.row?.user_id && (
              <div className="rounded-sm border border-info/30 bg-info/10 p-3 text-body-sm text-info">
                O barbeiro receberá um convite para definir a própria senha e acessar somente sua agenda.
              </div>
            )}
            {errors.submit && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{errors.submit}</div>}
            <Input label="Nome completo" required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} error={errors.nome} maxLength={120} disabled={submitting} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Apelido" value={form.apelido} onChange={(event) => setForm({ ...form, apelido: event.target.value })} error={errors.apelido} maxLength={60} disabled={submitting} />
              <Input label="Telefone / WhatsApp" type="tel" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} error={errors.telefone} maxLength={30} disabled={submitting} />
            </div>
            <Input
              label="E-mail de acesso"
              type="email"
              required={!formModal.row?.user_id}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              error={errors.email}
              helpText={formModal.row?.user_id ? 'O e-mail pertence ao usuário vinculado e não é alterado nesta tela.' : 'O convite de primeiro acesso será enviado para este endereço.'}
              disabled={submitting || Boolean(formModal.row?.user_id)}
            />
            <Input label="Especialidade" value={form.especialidade} onChange={(event) => setForm({ ...form, especialidade: event.target.value })} maxLength={100} disabled={submitting} />
            <div className="rounded-md border border-line bg-surface-1 p-4">
              <p className="mb-3 text-label text-copper">COMISSÕES DO BARBEIRO</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Serviços / cortes (%)" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.comissao_percentual} onChange={(event) => setForm({ ...form, comissao_percentual: event.target.value })} error={errors.comissao} helpText="Padrão para os serviços sem comissão específica." disabled={submitting} />
                <Input label="Venda de produtos (%)" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.comissao_produtos_percentual} onChange={(event) => setForm({ ...form, comissao_produtos_percentual: event.target.value })} error={errors.comissaoProdutos} helpText="Padrão para os produtos sem comissão específica." disabled={submitting} />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {statusTarget && (
        <Modal
          open
          onClose={() => !submitting && setStatusTarget(null)}
          title={statusTarget.ativo ? 'Desativar barbeiro' : 'Reativar barbeiro'}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setStatusTarget(null)} disabled={submitting}>Cancelar</Button>
              <Button variant={statusTarget.ativo ? 'danger' : 'primary'} loading={submitting} onClick={confirmStatusChange}>
                {statusTarget.ativo ? 'Desativar' : 'Reativar'}
              </Button>
            </>
          )}
        >
          {errors.status && <div role="alert" className="mb-4 rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{errors.status}</div>}
          <div className="flex items-start gap-3 text-body text-steel">
            {statusTarget.ativo ? <UserX size={20} className="mt-0.5 shrink-0 text-danger" /> : <UserCheck size={20} className="mt-0.5 shrink-0 text-success" />}
            <p>
              {statusTarget.ativo
                ? `${displayName(statusTarget)} deixará de aparecer para novos agendamentos. O histórico e o usuário serão preservados, mas o acesso aos dados operacionais ficará bloqueado.`
                : `${displayName(statusTarget)} voltará a aparecer para novos agendamentos.`}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
