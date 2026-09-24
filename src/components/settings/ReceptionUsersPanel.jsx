import { useCallback, useEffect, useState } from 'react'
import { Mail, Pencil, Phone, Plus, UserRoundCheck, UsersRound } from 'lucide-react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { atualizarUsuarioRecepcao, criarUsuarioRecepcao, listarUsuariosRecepcao, mensagemErroRecepcao } from '../../lib/recepcao/api'

const emptyForm = { nome: '', email: '', telefone: '', ativo: true }

export default function ReceptionUsersPanel({ enabled }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true); setError('')
    try { setUsers(await listarUsuariosRecepcao()) }
    catch (loadError) { setError(mensagemErroRecepcao(loadError)) }
    finally { setLoading(false) }
  }, [enabled])

  useEffect(() => { load() }, [load])
  if (!enabled) return null

  function openCreate() { setForm(emptyForm); setModal({ type: 'create' }); setError(''); setNotice('') }
  function openEdit(user) { setForm({ nome: user.nome, email: user.email, telefone: user.telefone || '', ativo: user.ativo }); setModal({ type: 'edit', user }); setError(''); setNotice('') }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      if (modal.type === 'create') {
        await criarUsuarioRecepcao(form)
        setNotice(`Convite enviado para ${form.email.trim().toLowerCase()}.`)
      } else {
        await atualizarUsuarioRecepcao({ ...form, id: modal.user.id, expectedUpdatedAt: modal.user.updated_at })
        setNotice('Usuário da recepção atualizado.')
      }
      setModal(null); await load()
    } catch (saveError) { setError(mensagemErroRecepcao(saveError)) }
    finally { setSaving(false) }
  }

  return <section className="space-y-4" aria-labelledby="reception-users-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><UsersRound size={20} className="text-copper" /><h2 id="reception-users-title" className="text-h2 text-warm-white">Equipe da recepção</h2></div><p className="mt-1 text-body-sm text-steel">Cada pessoa recebe login próprio e acesso somente à operação do balcão.</p></div><Button onClick={openCreate}><Plus size={16} /> Novo acesso</Button></div>
    {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{notice}</div>}
    {error && !modal && <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error}</div>}
    {loading ? <Card className="flex min-h-36 items-center justify-center gap-3 text-steel"><Spinner size={20} /> Carregando equipe</Card> : users.length === 0 ? <Card><EmptyState icon={UserRoundCheck} title="Nenhum acesso criado" description="Cadastre a primeira pessoa da recepção. Ela receberá um convite para definir a própria senha." action={<Button onClick={openCreate}>Criar acesso</Button>} /></Card> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{users.map((user) => <Card key={user.id} className={`p-4 ${user.ativo ? '' : 'opacity-65'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-h3 text-warm-white">{user.nome}</h3><p className="mt-2 flex items-center gap-2 truncate text-body-sm text-steel"><Mail size={14} className="shrink-0" /> {user.email}</p>{user.telefone && <p className="mt-1 flex items-center gap-2 text-body-sm text-steel"><Phone size={14} /> {user.telefone}</p>}</div><Badge variant={user.ativo ? 'success' : 'neutral'}>{user.ativo ? 'Ativo' : 'Inativo'}</Badge></div><div className="mt-4 border-t border-line pt-3"><Button size="sm" variant="ghost" onClick={() => openEdit(user)}><Pencil size={14} /> Editar acesso</Button></div></Card>)}</div>}
    {modal && <Modal open onClose={() => !saving && setModal(null)} title={modal.type === 'create' ? 'Novo acesso da recepção' : 'Editar acesso'} footer={<><Button variant="ghost" disabled={saving} onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" form="reception-user-form" loading={saving}>{modal.type === 'create' ? 'Enviar convite' : 'Salvar'}</Button></>}><form id="reception-user-form" onSubmit={submit} className="space-y-4">{error && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</div>}<Input label="Nome" required maxLength={120} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /><Input label="E-mail" type="email" required disabled={modal.type === 'edit'} maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} helpText={modal.type === 'create' ? 'Será usado para enviar o convite de primeiro acesso.' : 'O e-mail do acesso não é alterado nesta tela.'} /><Input label="Telefone" type="tel" maxLength={30} value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} />{modal.type === 'edit' && <label className="flex min-h-11 items-center gap-3 text-body-sm text-steel"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} className="h-5 w-5 accent-copper" /> Acesso ativo</label>}</form></Modal>}
  </section>
}
