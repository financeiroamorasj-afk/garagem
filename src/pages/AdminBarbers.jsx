import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BriefcaseBusiness,
  ImagePlus,
  KeyRound,
  Mail,
  Pencil,
  Percent,
  Phone,
  Scissors,
  Search,
  Send,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Trash2,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import BarberStatementModal from '../components/BarberStatementModal'
import { atualizarBarbeiro, criarBarbeiroComAcesso, listarBarbeiros, obterUsuarioAtualId, reenviarConviteBarbeiro, removerFotoBarbeiro, salvarFotoBarbeiro, vincularAdminComoProfissional } from '../lib/barbeiros/api'
import { mensagemErroBarbeiro } from '../lib/barbeiros/ui'
import { compactarImagem, formatarTamanho } from '../lib/clientes/imagem'

function initialForm(row) {
  return {
    nome: row?.nome ?? '',
    apelido: row?.apelido ?? '',
    email: row?.email ?? '',
    telefone: row?.telefone ?? '',
    especialidade: row?.especialidade ?? '',
    comissao_percentual: row?.comissao_percentual ?? '',
    comissao_produtos_percentual: row?.comissao_produtos_percentual ?? '',
    tipo_vinculo: row?.tipo_vinculo ?? 'clt',
    responsavel_disponibilidade: row?.responsavel_disponibilidade ?? 'gestao',
  }
}

function displayName(barber) {
  return barber.apelido || barber.nome
}

export default function AdminBarbers() {
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [invitingId, setInvitingId] = useState(null)
  const [filter, setFilter] = useState('active')
  const [query, setQuery] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [statementBarber, setStatementBarber] = useState(null)
  const [formModal, setFormModal] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [form, setForm] = useState(initialForm())
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [removePhoto, setRemovePhoto] = useState(false)
  const [compressingPhoto, setCompressingPhoto] = useState(false)
  const [photoInfo, setPhotoInfo] = useState('')
  const [errors, setErrors] = useState({})
  const [pageError, setPageError] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const [rows, userId] = await Promise.all([
        listarBarbeiros({ incluirInativos: true }),
        obterUsuarioAtualId(),
      ])
      setBarbers(rows)
      setCurrentUserId(userId)
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
    setPhoto(null)
    setPhotoPreview(row?.foto_url ?? '')
    setRemovePhoto(false)
    setPhotoInfo('')
    setErrors({})
    setStatus('')
  }

  function closeForm() {
    if (submitting || compressingPhoto) return
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setFormModal(null)
    setErrors({})
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setCompressingPhoto(true)
    setErrors((current) => ({ ...current, photo: '' }))
    try {
      const image = await compactarImagem(file, { maxDimension: 900, maxBytes: 500 * 1024 })
      setPhoto(image)
      setPhotoPreview((current) => {
        if (current.startsWith('blob:')) URL.revokeObjectURL(current)
        return URL.createObjectURL(image.blob)
      })
      setRemovePhoto(false)
      setPhotoInfo(`${formatarTamanho(file.size)} → ${formatarTamanho(image.bytes)}`)
    } catch (error) {
      setErrors((current) => ({ ...current, photo: error instanceof TypeError ? error.message : 'Não foi possível preparar a foto.' }))
    } finally {
      setCompressingPhoto(false)
    }
  }

  function markPhotoForRemoval() {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview('')
    setPhotoInfo('A foto será removida ao salvar.')
    setRemovePhoto(true)
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
      let profissionalId = row?.id
      if (!row?.user_id) {
        const created = await criarBarbeiroComAcesso({ ...form, id: row?.id })
        profissionalId = created?.professional?.id ?? profissionalId
      } else {
        await atualizarBarbeiro({
          ...form,
          id: row.id,
          ativo: row.ativo,
          expectedUpdatedAt: row.updated_at,
        })
      }
      let photoFailure = null
      try {
        if (photo) await salvarFotoBarbeiro(profissionalId, photo)
        else if (removePhoto && row?.foto_url) await removerFotoBarbeiro(profissionalId)
      } catch (error) {
        photoFailure = error
      }
      await load()
      if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
      setFormModal(null)
      setStatus(row
        ? row.user_id
          ? `${displayName(row)} foi atualizado.`
          : `Acesso criado e convite enviado para ${form.email.trim().toLowerCase()}.`
        : `Barbeiro cadastrado e convite enviado para ${form.email.trim().toLowerCase()}.`)
      if (photoFailure) setPageError('O cadastro foi salvo, mas não foi possível atualizar a foto. Abra o barbeiro e tente novamente.')
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

  async function resendInvite(barber) {
    setInvitingId(barber.id)
    setPageError('')
    setStatus('')
    try {
      await reenviarConviteBarbeiro(barber.id)
      setStatus(`Novo convite enviado para ${barber.email}.`)
    } catch (error) {
      setPageError(mensagemErroBarbeiro(error).message)
    } finally {
      setInvitingId(null)
    }
  }

  async function addOwnerToSchedule() {
    setSubmitting(true)
    setPageError('')
    setStatus('')
    try {
      const professional = await vincularAdminComoProfissional()
      await load()
      setStatus(`${professional.nome} agora também aparece como profissional na agenda.`)
      window.dispatchEvent(new CustomEvent('garagem:professional-access-changed'))
    } catch (error) {
      setPageError(mensagemErroBarbeiro(error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const ownerAlreadyLinked = Boolean(currentUserId && barbers.some((barber) => barber.user_id === currentUserId))

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

      {!loading && currentUserId && !ownerAlreadyLinked && (
        <section className="flex flex-col gap-4 rounded-md border border-copper/30 bg-copper/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <BriefcaseBusiness size={22} className="mt-0.5 shrink-0 text-copper" aria-hidden="true" />
            <div>
              <h2 className="text-h3 text-warm-white">O dono também atende?</h2>
              <p className="mt-1 max-w-2xl text-body-sm text-steel">Crie seu perfil profissional com o mesmo acesso administrativo. Você entrará na agenda e poderá configurar seus horários sem manter outro login.</p>
            </div>
          </div>
          <Button variant="secondary" loading={submitting} onClick={addOwnerToSchedule} className="w-full shrink-0 sm:w-auto"><Scissors size={16} /> Eu também atendo</Button>
        </section>
      )}

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
                  <button type="button" onClick={() => setStatementBarber(barber)} className="flex min-w-0 items-center gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label={`Abrir extrato de ${displayName(barber)}`}>
                    {barber.foto_url
                      ? <img src={barber.foto_url} alt="" className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />
                      : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10 text-h2 text-copper">{displayName(barber).charAt(0).toUpperCase()}</div>}
                    <div className="min-w-0">
                      <h2 className="truncate text-h3 text-warm-white">{displayName(barber)}</h2>
                      <p className="truncate text-body-sm text-steel">{barber.nome}</p>
                    </div>
                  </button>
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
                  <p className="flex flex-wrap gap-2 text-body-sm text-steel">
                    <Badge variant="neutral">{barber.tipo_vinculo === 'clt' ? 'CLT' : barber.tipo_vinculo === 'pj' ? 'PJ' : barber.tipo_vinculo === 'freelancer' ? 'Freelancer' : barber.tipo_vinculo === 'parceiro' ? 'Parceiro' : 'Outro vínculo'}</Badge>
                    <Badge variant={barber.responsavel_disponibilidade === 'profissional' ? 'info' : 'neutral'}>{barber.responsavel_disponibilidade === 'profissional' ? 'Agenda pelo profissional' : 'Agenda pela gestão'}</Badge>
                  </p>
                </div>

                <div className="space-y-3 border-t border-line pt-4">
                  <div className="flex min-h-8 items-center justify-between gap-3">
                    <Badge variant={barber.user_id ? 'info' : 'warning'}>
                      {barber.user_id ? 'Acesso vinculado' : 'Acesso pendente'}
                    </Badge>
                    <span className="text-label text-steel">AÇÕES</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => setStatementBarber(barber)}>
                      <BarChart3 size={15} aria-hidden="true" /> Ver extrato
                    </Button>
                    <Button size="sm" variant="ghost" className="w-full border border-line" onClick={() => openForm(barber)}>
                      <Pencil size={15} aria-hidden="true" /> {barber.user_id ? 'Editar' : 'Criar acesso'}
                    </Button>
                    {barber.user_id && barber.email && (
                      <Button size="sm" variant="ghost" className="w-full border border-line" loading={invitingId === barber.id} disabled={Boolean(invitingId)} onClick={() => resendInvite(barber)}>
                        <Send size={15} aria-hidden="true" /> Reenviar convite
                      </Button>
                    )}
                    <Button size="sm" className="w-full" variant={barber.ativo ? 'danger' : 'secondary'} onClick={() => { setErrors({}); setStatusTarget(barber) }}>
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
              <Button variant="ghost" onClick={closeForm} disabled={submitting || compressingPhoto}>Cancelar</Button>
              {errors.conflict && <Button variant="secondary" onClick={load} disabled={submitting}>Recarregar</Button>}
              <Button type="submit" form="barber-form" loading={submitting} disabled={compressingPhoto}>
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
            <section className="flex flex-col gap-4 rounded-md border border-line bg-surface-1 p-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-0">
                {photoPreview
                  ? <img src={photoPreview} alt="Prévia da foto do barbeiro" className="h-full w-full object-cover" />
                  : <UserPlus size={30} className="text-steel" aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label text-copper">FOTO DO PERFIL</p>
                <p className="mt-1 text-body-sm text-steel">A foto aparece na equipe e na escolha do profissional no app do cliente.</p>
                {photoInfo && <p className="mt-2 text-label text-success">{photoInfo}</p>}
                {errors.photo && <p role="alert" className="mt-2 text-body-sm text-danger">{errors.photo}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-sm border border-copper px-3 text-body-sm font-semibold text-copper ${compressingPhoto || submitting ? 'pointer-events-none opacity-40' : ''}`}>
                    {compressingPhoto ? <Spinner size={15} /> : <ImagePlus size={16} />} {photoPreview ? 'Trocar foto' : 'Escolher foto'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" disabled={compressingPhoto || submitting} onChange={selectPhoto} />
                  </label>
                  {photoPreview && <Button type="button" size="sm" variant="danger" disabled={compressingPhoto || submitting} onClick={markPhotoForRemoval}><Trash2 size={15} /> Remover</Button>}
                </div>
              </div>
            </section>
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
              <p className="mb-3 text-label text-copper">VÍNCULO E DISPONIBILIDADE</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-label text-steel">
                  <span className="mb-2 block">Tipo de vínculo</span>
                  <select value={form.tipo_vinculo} disabled={submitting} onChange={(event) => { const tipo = event.target.value; setForm({ ...form, tipo_vinculo: tipo, responsavel_disponibilidade: ['freelancer', 'pj'].includes(tipo) ? 'profissional' : 'gestao' }) }} className="h-12 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white outline-none focus:border-copper">
                    <option value="clt">CLT</option><option value="freelancer">Freelancer</option><option value="pj">PJ</option><option value="parceiro">Parceiro</option><option value="outro">Outro</option>
                  </select>
                </label>
                <label className="text-label text-steel">
                  <span className="mb-2 block">Quem controla os horários</span>
                  <select value={form.responsavel_disponibilidade} disabled={submitting} onChange={(event) => setForm({ ...form, responsavel_disponibilidade: event.target.value })} className="h-12 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white outline-none focus:border-copper">
                    <option value="gestao">Gestão da barbearia</option><option value="profissional">Próprio profissional</option>
                  </select>
                </label>
              </div>
              <p className="mt-3 text-body-sm text-steel">CLT começa sob controle da gestão; freelancer e PJ começam sob controle do profissional. Você pode alterar a exceção separadamente.</p>
            </div>
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

      {statementBarber && <BarberStatementModal barber={statementBarber} onClose={() => setStatementBarber(null)} />}

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
