import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Camera, ContactRound, History, LayoutGrid, List, Pencil, Phone, Plus, Scissors, Search, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import LastCutSummary from '../components/LastCutSummary'
import { listarBarbeiros } from '../lib/barbeiros/api'
import { carregarFichaCliente, listarClientes, mensagemErroCliente, salvarCliente } from '../lib/clientes/api'
import { obterUrlFotoCorte } from '../lib/clientes/cortes-api'
import { statusAgenda } from '../lib/agenda/ui'

function initialForm(row) {
  return {
    id: row?.id ?? null,
    nome: row?.nome ?? '',
    telefone: row?.telefone ?? '',
    cpf: '',
    cpf_cadastrado: Boolean(row?.cpf_cadastrado),
    cpf_final: row?.cpf_final ?? '',
    removerCpf: false,
    barbeiro_favorito_id: row?.barbeiro_favorito_id ?? '',
    notas_preferencias: row?.notas_preferencias ?? '',
    updated_at: row?.updated_at ?? null,
  }
}

function dateTime(value) {
  if (!value) return 'Ainda não ocorreu'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function dateOnly(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))
}

function CutHistoryCard({ cut }) {
  const [photoUrl, setPhotoUrl] = useState('')
  useEffect(() => {
    let active = true
    if (!cut.foto_path) return undefined
    obterUrlFotoCorte(cut.foto_path).then((url) => { if (active) setPhotoUrl(url ?? '') }).catch(() => {})
    return () => { active = false }
  }, [cut.foto_path])
  return (
    <article className={`rounded-md border p-4 ${cut.ativo ? 'border-copper bg-copper/5' : 'border-line bg-surface-1'}`}>
      <div className="flex gap-3">
        {photoUrl ? <img src={photoUrl} alt={`Resultado do corte ${cut.estilo}`} className="h-24 w-24 shrink-0 rounded-sm object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-steel"><Scissors size={19} /></div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><h4 className="text-h3 text-warm-white">{cut.estilo}</h4>{cut.ativo && <Badge variant="success">Atual</Badge>}</div>
          <p className="mt-1 text-body-sm text-steel">{dateOnly(cut.criado_em)} · {cut.profissional_nome}</p>
          <p className="mt-2 text-body-sm text-steel">{[cut.servico_nome, cut.pentes, cut.acabamento, cut.barba].filter(Boolean).join(' · ')}</p>
          {cut.observacoes && <p className="mt-2 text-body-sm text-warm-white">{cut.observacoes}</p>}
        </div>
      </div>
    </article>
  )
}

function ClientDetail({ data }) {
  const client = data.cliente
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-4"><p className="text-label text-steel">CONTATO</p><p className="mt-2 flex items-center gap-2 text-body text-warm-white"><Phone size={15} className="text-copper" />{client.telefone || 'Não informado'}</p><p className="mt-2 flex items-center gap-2 text-body-sm text-steel"><ShieldCheck size={15} />{client.cpf_cadastrado ? `CPF protegido · final ${client.cpf_final}` : 'CPF ainda não cadastrado'}</p></Card>
        <Card className="p-4"><p className="text-label text-steel">BARBEIRO FAVORITO</p><p className="mt-2 flex items-center gap-2 text-body text-warm-white"><UserRound size={15} className="text-copper" />{client.barbeiro_favorito_nome || 'Sem preferência'}</p></Card>
      </section>

      <section className="rounded-md border border-line bg-surface-1 p-4"><h3 className="text-h3 text-warm-white">Preferências do cliente</h3><p className="mt-2 whitespace-pre-wrap text-body text-steel">{client.notas_preferencias || 'Nenhuma preferência registrada.'}</p></section>

      <section><div className="mb-3 flex items-center gap-2"><Scissors size={18} className="text-copper" /><h3 className="text-h2 text-warm-white">Histórico de cortes</h3></div>{data.cortes.length === 0 ? <Card><EmptyState icon={Camera} className="py-10" title="Nenhum corte registrado" description="O primeiro registro será criado ao concluir um atendimento." /></Card> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{data.cortes.map((cut) => <CutHistoryCard key={cut.id} cut={cut} />)}</div>}</section>

      <section><div className="mb-3 flex items-center gap-2"><History size={18} className="text-copper" /><h3 className="text-h2 text-warm-white">Atendimentos</h3></div>{data.atendimentos.length === 0 ? <p className="text-body text-steel">Nenhum atendimento vinculado.</p> : <div className="space-y-2">{data.atendimentos.map((appointment) => { const status = statusAgenda(appointment.status); return <article key={appointment.id} className="flex items-center gap-3 rounded-sm border border-line bg-surface-1 p-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-copper"><CalendarDays size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-body font-semibold text-warm-white">{appointment.servico_nome}</p><p className="truncate text-body-sm text-steel">{dateTime(appointment.data_hora)} · {appointment.profissional_nome}</p></div><Badge variant={status.variant}>{status.label}</Badge></article> })}</div>}</section>
    </div>
  )
}

function ClientListItem({ client, onDetail, onEdit }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[auto_minmax(12rem,1.4fr)_minmax(7rem,.6fr)_minmax(9rem,.8fr)_minmax(10rem,1fr)_auto]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-copper/30 bg-copper/10 text-h3 text-copper">{client.nome.charAt(0).toUpperCase()}</div>
        <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-body font-semibold text-warm-white">{client.nome}</h2>{client.cpf_cadastrado && <Badge variant="info">CPF •{client.cpf_final}</Badge>}</div><p className="mt-1 truncate text-body-sm text-steel">{client.telefone || 'Telefone não informado'}</p></div>
        <div className="hidden min-w-0 lg:block"><span className="block text-label text-steel">VISITAS</span><strong className="mt-1 block text-body text-warm-white">{client.total_atendimentos}</strong></div>
        <div className="hidden min-w-0 lg:block"><span className="block text-label text-steel">FAVORITO</span><strong className="mt-1 block truncate text-body-sm text-warm-white">{client.barbeiro_favorito_nome || 'Não definido'}</strong></div>
        <div className="hidden min-w-0 lg:block"><span className="block text-label text-steel">ÚLTIMO CORTE</span><strong className="mt-1 block truncate text-body-sm text-warm-white">{client.ultimo_corte?.estilo || 'Sem memória'}</strong><span className="mt-1 block truncate text-body-sm text-steel">{dateTime(client.ultima_visita)}</span></div>
        <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => onDetail(client)}>Ficha</Button><Button size="sm" variant="ghost" aria-label={`Editar ${client.nome}`} onClick={() => onEdit(client)}><Pencil size={14} /></Button></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 lg:hidden"><div><span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">Visitas</span><strong className="text-body-sm text-warm-white">{client.total_atendimentos}</strong></div><div className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">Favorito</span><strong className="block truncate text-body-sm text-warm-white">{client.barbeiro_favorito_nome || 'Não definido'}</strong></div><div className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">Último corte</span><strong className="block truncate text-body-sm text-warm-white">{client.ultimo_corte?.estilo || 'Sem memória'}</strong></div></div>
    </Card>
  )
}

export default function AdminClients() {
  const [clients, setClients] = useState([])
  const [barbers, setBarbers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(initialForm())
  const [formError, setFormError] = useState('')
  const [detailTarget, setDetailTarget] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('garagem-clientes-view') === 'list' ? 'list' : 'cards')

  const load = useCallback(async (search = '') => {
    setLoading(true); setError('')
    try {
      setClients(await listarClientes(search))
    } catch (requestError) { setError(mensagemErroCliente(requestError).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    listarBarbeiros().then((team) => { if (active) setBarbers(team.filter((item) => item.ativo)) }).catch((requestError) => { if (active) setError(mensagemErroCliente(requestError).message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(query), 250)
    return () => clearTimeout(timer)
  }, [load, query])

  useEffect(() => { localStorage.setItem('garagem-clientes-view', viewMode) }, [viewMode])

  const stats = useMemo(() => ({ total: clients.length, identified: clients.filter((item) => item.cpf_cadastrado).length, history: clients.filter((item) => item.ultimo_corte).length }), [clients])

  function openForm(row = null) { setForm(initialForm(row)); setFormError(''); setNotice(''); setFormOpen(true) }

  async function save(event) {
    event.preventDefault(); setSaving(true); setFormError('')
    try {
      await salvarCliente(form)
      setFormOpen(false); setNotice(form.id ? 'Ficha do cliente atualizada.' : 'Cliente cadastrado.')
      await load(query)
    } catch (saveError) { setFormError(mensagemErroCliente(saveError).message) }
    finally { setSaving(false) }
  }

  async function openDetail(row) {
    setDetailTarget(row); setDetail(null); setDetailLoading(true); setError('')
    try { setDetail(await carregarFichaCliente(row.id)) }
    catch (requestError) { setError(mensagemErroCliente(requestError).message); setDetailTarget(null) }
    finally { setDetailLoading(false) }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><span className="mb-2 block text-label text-copper">RELACIONAMENTO</span><h1 className="text-h1 text-warm-white sm:text-display">Clientes</h1><p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Preferências, último corte e histórico em uma ficha única.</p></div><Button size="lg" className="w-full sm:w-auto" onClick={() => openForm()}><Plus size={18} /> Novo cliente</Button></header>

      {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{notice}</div>}
      {error && <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error}</div>}

      <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Resumo dos clientes">{[[<UsersRound key="clients" size={18} className="mb-2 text-copper" />,'Clientes',stats.total],[<ShieldCheck key="cpf" size={18} className="mb-2 text-info" />,'Com CPF',stats.identified],[<Scissors key="memory" size={18} className="mb-2 text-success" />,'Com memória',stats.history]].map(([icon,label,value]) => <Card key={label} className="min-w-0 p-3 sm:p-5">{icon}<span className="block text-data-lg text-warm-white">{value}</span><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-steel sm:text-label">{label}</span></Card>)}</section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="w-full max-w-xl"><Input label="Buscar cliente" icon={Search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, telefone ou CPF" /></div><div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-surface-1 p-1" role="group" aria-label="Modo de visualização"><Button size="sm" variant={viewMode === 'cards' ? 'secondary' : 'ghost'} aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')}><LayoutGrid size={15} /> Cards</Button><Button size="sm" variant={viewMode === 'list' ? 'secondary' : 'ghost'} aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={15} /> Lista</Button></div></div>

      {loading ? <Card className="flex min-h-48 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Carregando clientes</Card> : clients.length === 0 ? <Card><EmptyState icon={ContactRound} title={query ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'} description={query ? 'Tente buscar por outro nome, telefone ou CPF.' : 'Cadastre o primeiro cliente ou crie-o durante um agendamento.'} action={!query && <Button onClick={() => openForm()}>Cadastrar cliente</Button>} /></Card> : viewMode === 'list' ? (
        <section className="space-y-2" aria-label="Clientes em lista">{clients.map((client) => <ClientListItem key={client.id} client={client} onDetail={openDetail} onEdit={openForm} />)}</section>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Clientes em cards">{clients.map((client) => <Card key={client.id} className="flex min-w-0 flex-col p-4 sm:p-5"><div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10 text-h2 text-copper">{client.nome.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><h2 className="truncate text-h3 text-warm-white">{client.nome}</h2><p className="mt-1 truncate text-body-sm text-steel">{client.telefone || 'Telefone não informado'}</p></div>{client.cpf_cadastrado && <Badge variant="info">CPF •{client.cpf_final}</Badge>}</div><div className="mt-4 grid grid-cols-2 gap-2 rounded-sm border border-line bg-surface-0 p-3 text-body-sm"><div><span className="block text-label text-steel">VISITAS</span><strong className="mt-1 block text-warm-white">{client.total_atendimentos}</strong></div><div><span className="block text-label text-steel">FAVORITO</span><strong className="mt-1 block truncate text-warm-white">{client.barbeiro_favorito_nome || 'Não definido'}</strong></div><div className="col-span-2"><span className="block text-label text-steel">ÚLTIMA VISITA</span><strong className="mt-1 block text-warm-white">{dateTime(client.ultima_visita)}</strong></div></div><LastCutSummary cut={client.ultimo_corte} /><div className="mt-auto grid grid-cols-2 gap-2 pt-4"><Button size="sm" variant="secondary" onClick={() => openDetail(client)}>Abrir ficha</Button><Button size="sm" variant="ghost" onClick={() => openForm(client)}><Pencil size={14} /> Editar</Button></div></Card>)}</section>
      )}

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={form.id ? 'Editar cliente' : 'Novo cliente'} className="sm:max-w-2xl" footer={<><Button variant="secondary" disabled={saving} onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="submit" form="client-form" loading={saving}>Salvar ficha</Button></>}>
        <form id="client-form" className="space-y-4" onSubmit={save}>{formError && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{formError}</p>}<Input label="Nome" required maxLength={120} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /><Input label="Telefone" type="tel" maxLength={30} value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} /><Input label={form.cpf_cadastrado ? `Novo CPF (atual termina em ${form.cpf_final})` : 'CPF'} inputMode="numeric" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value, removerCpf: false })} helpText={form.cpf_cadastrado ? 'Deixe em branco para manter. O número completo não é armazenado nem exibido.' : 'Será validado e transformado em uma identificação protegida; o número completo não será armazenado.'} />{form.cpf_cadastrado && <label className="flex min-h-10 items-center gap-3 text-body-sm text-steel"><input type="checkbox" checked={form.removerCpf} onChange={(event) => setForm({ ...form, removerCpf: event.target.checked, cpf: '' })} className="h-5 w-5 accent-copper" /> Remover CPF protegido desta ficha</label>}<label className="block text-label text-steel"><span className="mb-2 block">Barbeiro favorito</span><select value={form.barbeiro_favorito_id} onChange={(event) => setForm({ ...form, barbeiro_favorito_id: event.target.value })} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none focus:border-copper"><option value="">Sem preferência</option>{barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.apelido || barber.nome}</option>)}</select></label><label className="block text-label text-steel"><span className="mb-2 block">Preferências e observações</span><textarea rows={5} maxLength={1000} value={form.notas_preferencias} onChange={(event) => setForm({ ...form, notas_preferencias: event.target.value })} placeholder="Preferências de corte, atendimento e observações importantes" className="w-full resize-y rounded-sm border border-line-strong bg-surface-2 px-3 py-3 text-body text-warm-white outline-none focus:border-copper" /></label></form>
      </Modal>

      <Modal open={Boolean(detailTarget)} onClose={() => setDetailTarget(null)} title={detailTarget?.nome || 'Ficha do cliente'} className="sm:max-w-4xl" footer={<><Button variant="secondary" onClick={() => setDetailTarget(null)}>Fechar</Button><Button onClick={() => { const row = detail?.cliente || detailTarget; setDetailTarget(null); openForm(row) }} disabled={!detail}>Editar ficha</Button></>}>{detailLoading ? <div className="flex min-h-64 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Carregando ficha</div> : detail && <ClientDetail data={detail} />}</Modal>
    </div>
  )
}
