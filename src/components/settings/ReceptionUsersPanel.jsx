import { useCallback, useEffect, useState } from 'react'
import { Mail, Pencil, Plus, ShieldCheck, ShieldOff, UserRoundCheck, UsersRound } from 'lucide-react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import EmptyState from '../ui/EmptyState'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import ReceptionTeamLink from '../reception/ReceptionTeamLink'
import {
  atualizarUsuarioRecepcao, criarUsuarioRecepcao, definirAcessoRecepcaoBarbeiro,
  listarBarbeirosParaRecepcao, listarUsuariosRecepcao, mensagemErroRecepcao,
} from '../../lib/recepcao/api'

const emptyForm = { nome: '', email: '', telefone: '', ativo: true }

export default function ReceptionUsersPanel({ enabled }) {
  const [users, setUsers] = useState([])
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const [nextUsers, nextBarbers] = await Promise.all([listarUsuariosRecepcao(), listarBarbeirosParaRecepcao()])
      setUsers(nextUsers)
      setBarbers(nextBarbers)
      setError('')
    } catch (loadError) { setError(mensagemErroRecepcao(loadError)) }
    finally { setLoading(false) }
  }, [enabled])

  useEffect(() => { load() }, [load])
  if (!enabled) return null

  function openCreate() { setForm(emptyForm); setModal({ type: 'create' }); setError(''); setNotice('') }
  function openEdit(user) {
    setForm({ nome: user.nome, email: user.email, telefone: user.telefone || '', ativo: user.ativo })
    setModal({ type: 'edit', user }); setError(''); setNotice('')
  }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      if (modal.type === 'create') {
        await criarUsuarioRecepcao(form)
        setNotice(`Convite enviado para ${form.email.trim().toLowerCase()}.`)
      } else {
        await atualizarUsuarioRecepcao({ ...form, id: modal.user.id, expectedUpdatedAt: modal.user.updated_at })
        setNotice('Acesso da recepção atualizado.')
      }
      setModal(null)
      await load()
    } catch (saveError) { setError(mensagemErroRecepcao(saveError)) }
    finally { setSaving(false) }
  }

  async function revokeUser(user) {
    setSaving(true); setError('')
    try {
      await atualizarUsuarioRecepcao({ id: user.id, nome: user.nome, telefone: user.telefone, ativo: false, expectedUpdatedAt: user.updated_at })
      setModal(null)
      setNotice(`Acesso de ${user.nome} removido. O histórico foi preservado.`)
      await load()
    } catch (revokeError) { setError(mensagemErroRecepcao(revokeError)) }
    finally { setSaving(false) }
  }

  async function toggleBarber(barber, permitir) {
    setBusyId(barber.id); setError('')
    try {
      await definirAcessoRecepcaoBarbeiro(barber.id, permitir)
      setModal(null)
      setNotice(permitir ? `${barber.nome} agora pode operar a recepção com o próprio login.` : `Acesso de ${barber.nome} ao balcão removido; o painel de barbeiro permanece.`)
      await load()
    } catch (toggleError) { setError(mensagemErroRecepcao(toggleError)) }
    finally { setBusyId('') }
  }

  return <section className="space-y-6" aria-labelledby="reception-users-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><UsersRound size={20} className="text-copper" /><h2 id="reception-users-title" className="text-h2 text-warm-white">Acessos à recepção</h2></div><p className="mt-1 text-body-sm text-steel">Controle quem pode operar o balcão. Remover um acesso não apaga o histórico.</p></div><Button onClick={openCreate}><Plus size={16} /> Novo login exclusivo</Button></div>
    <ReceptionTeamLink />
    {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{notice}</div>}
    {error && !modal && <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error}</div>}
    {loading ? <Card className="flex min-h-36 items-center justify-center gap-3 text-steel"><Spinner size={20} /> Carregando acessos</Card> : <>
      <div className="space-y-3"><div><h3 className="text-h3 text-warm-white">Equipe de barbeiros</h3><p className="mt-1 text-body-sm text-steel">Habilite profissionais já cadastrados. Eles continuam usando o próprio painel e ganham um botão para o balcão.</p></div>
        {barbers.length === 0 ? <Card><EmptyState icon={UserRoundCheck} title="Nenhum barbeiro com login" description="Cadastre o acesso do profissional na área Barbeiros para habilitá-lo aqui." /></Card> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{barbers.map((barber) => <Card key={barber.id} className="flex flex-col gap-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-h3 text-warm-white">{barber.nome}</h4>{barber.email && <p className="mt-1 truncate text-body-sm text-steel">{barber.email}</p>}</div><Badge variant={barber.acesso_recepcao && barber.ativo ? 'success' : 'neutral'}>{!barber.ativo ? 'Barbeiro inativo' : barber.acesso_recepcao ? 'Balcão liberado' : 'Sem acesso'}</Badge></div><div className="mt-auto border-t border-line pt-3">{barber.acesso_recepcao ? <Button size="sm" variant="danger" disabled={Boolean(busyId)} onClick={() => setModal({ type: 'revoke-barber', barber })}><ShieldOff size={16} /> Remover acesso</Button> : <Button size="sm" variant="secondary" loading={busyId === barber.id} disabled={!barber.ativo || Boolean(busyId)} onClick={() => toggleBarber(barber, true)}><ShieldCheck size={16} /> Dar acesso à recepção</Button>}</div></Card>)}</div>}
      </div>
      <div className="space-y-3"><div><h3 className="text-h3 text-warm-white">Logins exclusivos da recepção</h3><p className="mt-1 text-body-sm text-steel">Pessoas que trabalham apenas no balcão, sem papel de barbeiro.</p></div>
        {users.length === 0 ? <Card><EmptyState icon={UserRoundCheck} title="Nenhum login exclusivo" description="Você pode criar um convite ou habilitar um barbeiro acima." action={<Button onClick={openCreate}>Criar login</Button>} /></Card> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{users.map((user) => <Card key={user.id} className={`p-4 ${user.ativo ? '' : 'opacity-70'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-h3 text-warm-white">{user.nome}</h4><p className="mt-2 flex items-center gap-2 truncate text-body-sm text-steel"><Mail size={14} className="shrink-0" /> {user.email}</p>{user.telefone && <p className="mt-1 text-body-sm text-steel">{user.telefone}</p>}</div><Badge variant={user.ativo ? 'success' : 'neutral'}>{user.ativo ? 'Ativo' : 'Acesso removido'}</Badge></div><div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3"><Button size="sm" variant="ghost" onClick={() => openEdit(user)}><Pencil size={14} /> Editar</Button>{user.ativo && <Button size="sm" variant="danger" onClick={() => setModal({ type: 'revoke-user', user })}><ShieldOff size={14} /> Remover acesso</Button>}</div></Card>)}</div>}
      </div>
    </>}

    {modal && ['create','edit'].includes(modal.type) && <Modal open onClose={() => !saving && setModal(null)} title={modal.type === 'create' ? 'Novo login da recepção' : 'Editar acesso'} footer={<><Button variant="ghost" disabled={saving} onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" form="reception-user-form" loading={saving}>{modal.type === 'create' ? 'Enviar convite' : 'Salvar'}</Button></>}><form id="reception-user-form" onSubmit={submit} className="space-y-4">{error && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</div>}<Input label="Nome" required maxLength={120} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /><Input label="E-mail" type="email" required disabled={modal.type === 'edit'} maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} helpText={modal.type === 'create' ? 'Será usado no convite de primeiro acesso.' : 'O e-mail não é alterado nesta tela.'} /><Input label="Telefone" type="tel" maxLength={30} value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} />{modal.type === 'edit' && <label className="flex min-h-11 items-center gap-3 text-body-sm text-steel"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} className="h-5 w-5 accent-copper" /> Acesso ativo</label>}</form></Modal>}
    {modal?.type === 'revoke-user' && <Modal open onClose={() => !saving && setModal(null)} title="Remover acesso à recepção" footer={<><Button variant="ghost" disabled={saving} onClick={() => setModal(null)}>Cancelar</Button><Button variant="danger" loading={saving} onClick={() => revokeUser(modal.user)}>Remover acesso</Button></>}><p className="text-body text-steel">O login de <strong className="text-warm-white">{modal.user.nome}</strong> será desativado. Cobranças e vendas já registradas permanecerão no histórico.</p>{error && <p role="alert" className="mt-3 text-body-sm text-danger">{error}</p>}</Modal>}
    {modal?.type === 'revoke-barber' && <Modal open onClose={() => !busyId && setModal(null)} title="Retirar acesso ao balcão" footer={<><Button variant="ghost" disabled={Boolean(busyId)} onClick={() => setModal(null)}>Cancelar</Button><Button variant="danger" loading={busyId === modal.barber.id} onClick={() => toggleBarber(modal.barber, false)}>Remover acesso</Button></>}><p className="text-body text-steel"><strong className="text-warm-white">{modal.barber.nome}</strong> perderá o acesso à recepção, mas manterá login, agenda e painel de barbeiro.</p>{error && <p role="alert" className="mt-3 text-body-sm text-danger">{error}</p>}</Modal>}
  </section>
}
