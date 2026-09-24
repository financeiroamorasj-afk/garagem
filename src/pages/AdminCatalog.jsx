import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Pencil, Plus, Scissors, Search, Wrench } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import CurrencyInput from '../components/ui/CurrencyInput'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import Tabs from '../components/ui/Tabs'
import {
  atualizarMaterial,
  atualizarServico,
  criarMaterial,
  criarServico,
  definirMaterialAtivo,
  definirServicoAtivo,
  listarMateriaisCatalogo,
  listarServicosCatalogo,
  mensagemErroCatalogo,
} from '../lib/catalogo/api'
import { formatarBRL } from '../lib/financeiro/moeda'

const SELECT_CLASS = 'h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-40'

function initialService(row) {
  return {
    nome: row?.nome ?? '',
    preco: row ? Number(row.preco) : null,
    duracao_minutos: row?.duracao_minutos ?? 30,
    descricao: row?.descricao ?? '',
    comissao_percentual: row?.comissao_percentual ?? '',
    materiais: (row?.materiais ?? []).map((item) => ({
      material_id: item.id,
      quantidade: Number(item.quantidade),
      observacao: item.observacao ?? '',
    })),
  }
}

function initialMaterial(row) {
  return { nome: row?.nome ?? '', tipo: row?.tipo ?? 'insumo', unidade: row?.unidade ?? 'unidade' }
}

function normalizar(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

export default function AdminCatalog() {
  const [tab, setTab] = useState('services')
  const [filter, setFilter] = useState({ services: 'active', materials: 'active' })
  const [query, setQuery] = useState('')
  const [services, setServices] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pageError, setPageError] = useState('')
  const [status, setStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [formError, setFormError] = useState('')
  const [statusTarget, setStatusTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const [serviceRows, materialRows] = await Promise.all([
        listarServicosCatalogo({ incluirInativos: filter.services === 'all' }),
        listarMateriaisCatalogo({ incluirInativos: filter.materials === 'all' }),
      ])
      setServices(serviceRows)
      setMaterials(materialRows)
    } catch (error) {
      setPageError(mensagemErroCatalogo(error).message)
    } finally {
      setLoading(false)
    }
  }, [filter.materials, filter.services])

  useEffect(() => { load() }, [load])

  const visibleServices = useMemo(() => {
    const search = normalizar(query).trim()
    return services.filter((row) => !search || normalizar(`${row.nome} ${row.descricao ?? ''} ${(row.materiais ?? []).map((item) => item.nome).join(' ')}`).includes(search))
  }, [query, services])

  const visibleMaterials = useMemo(() => {
    const search = normalizar(query).trim()
    return materials.filter((row) => !search || normalizar(`${row.nome} ${row.tipo} ${row.unidade}`).includes(search))
  }, [materials, query])

  function openForm(entity, row = null) {
    setModal({ entity, row })
    setForm(entity === 'service' ? initialService(row) : initialMaterial(row))
    setFormError('')
    setStatus('')
  }

  function closeForm() {
    if (!submitting) setModal(null)
  }

  async function submitForm(event) {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      if (modal.entity === 'service') {
        if (modal.row) await atualizarServico({ ...form, id: modal.row.id, expectedUpdatedAt: modal.row.updated_at })
        else await criarServico(form)
      } else if (modal.row) {
        await atualizarMaterial({ ...form, id: modal.row.id, expectedUpdatedAt: modal.row.updated_at })
      } else {
        await criarMaterial(form)
      }
      const label = modal.entity === 'service' ? 'Serviço' : 'Material'
      setModal(null)
      setStatus(`${label} ${modal.row ? 'atualizado' : 'cadastrado'} com sucesso.`)
      await load()
    } catch (error) {
      setFormError(mensagemErroCatalogo(error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function changeStatus() {
    if (!statusTarget) return
    setSubmitting(true)
    setFormError('')
    try {
      const active = !statusTarget.row.ativo
      if (statusTarget.entity === 'service') await definirServicoAtivo({ id: statusTarget.row.id, ativo: active })
      else await definirMaterialAtivo({ id: statusTarget.row.id, ativo: active })
      setStatus(`${statusTarget.entity === 'service' ? 'Serviço' : 'Material'} ${active ? 'reativado' : 'desativado'}.`)
      setStatusTarget(null)
      await load()
    } catch (error) {
      setFormError(mensagemErroCatalogo(error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const serviceContent = (
    <CatalogSection
      filter={filter.services}
      onFilter={(value) => setFilter((current) => ({ ...current, services: value }))}
      createLabel="Novo serviço"
      onCreate={() => openForm('service')}
    >
      {loading ? <Loading /> : visibleServices.length === 0 ? (
        <Card><EmptyState icon={Scissors} title={query ? 'Nenhum serviço encontrado' : 'Nenhum serviço cadastrado'} description={query ? 'Tente outro termo de busca.' : 'Cadastre os serviços oferecidos pela barbearia.'} action={!query && <Button onClick={() => openForm('service')}>Novo serviço</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleServices.map((service) => <ServiceCard key={service.id} service={service} onEdit={() => openForm('service', service)} onStatus={() => { setFormError(''); setStatusTarget({ entity: 'service', row: service }) }} />)}
        </div>
      )}
    </CatalogSection>
  )

  const materialContent = (
    <CatalogSection
      filter={filter.materials}
      onFilter={(value) => setFilter((current) => ({ ...current, materials: value }))}
      createLabel="Novo material"
      onCreate={() => openForm('material')}
    >
      {loading ? <Loading /> : visibleMaterials.length === 0 ? (
        <Card><EmptyState icon={Package} title={query ? 'Nenhum material encontrado' : 'Nenhum material cadastrado'} description={query ? 'Tente outro termo de busca.' : 'Cadastre insumos e ferramentas para vinculá-los aos serviços.'} action={!query && <Button onClick={() => openForm('material')}>Novo material</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleMaterials.map((material) => <MaterialCard key={material.id} material={material} onEdit={() => openForm('material', material)} onStatus={() => { setFormError(''); setStatusTarget({ entity: 'material', row: material }) }} />)}
        </div>
      )}
    </CatalogSection>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-2 block text-label text-copper">CATÁLOGO OPERACIONAL</span>
          <h1 className="text-h1 text-warm-white sm:text-display">Serviços e materiais</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Defina duração, preço e o que é usado em cada atendimento.</p>
        </div>
        <div className="w-full sm:max-w-xs"><Input label="Buscar no catálogo" icon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Serviço ou material" /></div>
      </header>

      {status && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{status}</div>}
      {pageError && <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between"><span>{pageError}</span><Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button></div>}

      <section className="grid grid-cols-2 gap-3 sm:max-w-lg">
        <Card className="p-4"><Scissors size={18} className="mb-2 text-copper" /><span className="block text-data-lg text-warm-white">{services.filter((row) => row.ativo).length}</span><span className="text-label text-steel">Serviços ativos</span></Card>
        <Card className="p-4"><Package size={18} className="mb-2 text-info" /><span className="block text-data-lg text-warm-white">{materials.filter((row) => row.ativo).length}</span><span className="text-label text-steel">Materiais ativos</span></Card>
      </section>

      <Tabs label="Cadastros operacionais" value={tab} onValueChange={(value) => { setTab(value); setQuery(''); setStatus('') }} items={[
        { value: 'services', label: 'Serviços', content: serviceContent },
        { value: 'materials', label: 'Materiais', content: materialContent },
      ]} />

      {modal && (
        <Modal open onClose={closeForm} title={`${modal.row ? 'Editar' : 'Novo'} ${modal.entity === 'service' ? 'serviço' : 'material'}`} className="sm:max-w-2xl" footer={<><Button variant="ghost" onClick={closeForm} disabled={submitting}>Cancelar</Button><Button type="submit" form="catalog-form" loading={submitting}>Salvar</Button></>}>
          <form id="catalog-form" className="space-y-5" onSubmit={submitForm} noValidate>
            {formError && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{formError}</div>}
            {modal.entity === 'service' ? <ServiceForm form={form} setForm={setForm} materials={materials.filter((item) => item.ativo)} disabled={submitting} /> : <MaterialForm form={form} setForm={setForm} disabled={submitting} />}
          </form>
        </Modal>
      )}

      {statusTarget && (
        <Modal open onClose={() => !submitting && setStatusTarget(null)} title={`${statusTarget.row.ativo ? 'Desativar' : 'Reativar'} ${statusTarget.entity === 'service' ? 'serviço' : 'material'}`} footer={<><Button variant="ghost" onClick={() => setStatusTarget(null)} disabled={submitting}>Cancelar</Button><Button variant={statusTarget.row.ativo ? 'danger' : 'primary'} loading={submitting} onClick={changeStatus}>{statusTarget.row.ativo ? 'Desativar' : 'Reativar'}</Button></>}>
          {formError && <div role="alert" className="mb-4 rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{formError}</div>}
          <p className="text-body text-steel">{statusTarget.row.ativo ? `${statusTarget.row.nome} deixará de aparecer em novos atendimentos.` : `${statusTarget.row.nome} voltará a ficar disponível.`}</p>
        </Modal>
      )}
    </div>
  )
}

function CatalogSection({ filter, onFilter, createLabel, onCreate, children }) {
  return <section className="space-y-4"><div className="flex items-center justify-between gap-3"><div className="flex gap-2"><Button size="sm" variant={filter === 'active' ? 'secondary' : 'ghost'} onClick={() => onFilter('active')}>Ativos</Button><Button size="sm" variant={filter === 'all' ? 'secondary' : 'ghost'} onClick={() => onFilter('all')}>Todos</Button></div><Button size="sm" onClick={onCreate}><Plus size={15} /> {createLabel}</Button></div>{children}</section>
}

function Loading() {
  return <Card className="flex min-h-48 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Carregando catálogo</Card>
}

function ServiceCard({ service, onEdit, onStatus }) {
  return <Card className={`flex min-w-0 flex-col gap-4 p-4 sm:p-6 ${service.ativo ? '' : 'opacity-70'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-h2 text-warm-white">{service.nome}</h2><p className="mt-1 line-clamp-2 text-body-sm text-steel">{service.descricao || 'Sem descrição'}</p></div><Badge variant={service.ativo ? 'success' : 'neutral'}>{service.ativo ? 'Ativo' : 'Inativo'}</Badge></div><div className="grid grid-cols-3 gap-2 rounded-sm border border-line bg-surface-0 p-3"><div><span className="block text-label text-steel">Valor</span><span className="text-data text-warm-white">{formatarBRL(service.preco)}</span></div><div><span className="block text-label text-steel">Duração</span><span className="text-data text-warm-white">{service.duracao_minutos} min</span></div><div><span className="block text-label text-steel">Comissão</span><span className="text-data text-warm-white">{service.comissao_percentual == null ? 'Padrão' : `${Number(service.comissao_percentual).toLocaleString('pt-BR')}%`}</span></div></div><div><span className="mb-2 block text-label text-steel">Materiais previstos</span>{service.materiais.length ? <div className="flex flex-wrap gap-2">{service.materiais.map((item) => <Badge key={item.id} variant={item.tipo === 'insumo' ? 'info' : 'neutral'}>{item.nome} · {Number(item.quantidade).toLocaleString('pt-BR')} {item.unidade}</Badge>)}</div> : <p className="text-body-sm text-steel">Nenhum material vinculado.</p>}</div><div className="mt-auto flex justify-end gap-2 border-t border-line pt-4"><Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={14} /> Editar</Button><Button size="sm" variant={service.ativo ? 'danger' : 'secondary'} onClick={onStatus}>{service.ativo ? 'Desativar' : 'Reativar'}</Button></div></Card>
}

function MaterialCard({ material, onEdit, onStatus }) {
  const Icon = material.tipo === 'insumo' ? Package : Wrench
  return <Card className={`flex min-w-0 flex-col gap-4 p-4 ${material.ativo ? '' : 'opacity-70'}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-sm bg-copper/10 p-2 text-copper"><Icon size={18} /></div><div className="min-w-0"><h2 className="truncate text-h3 text-warm-white">{material.nome}</h2><p className="text-body-sm capitalize text-steel">{material.tipo} · {material.unidade}</p></div></div><Badge variant={material.ativo ? 'success' : 'neutral'}>{material.ativo ? 'Ativo' : 'Inativo'}</Badge></div><div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-4"><Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={14} /> Editar</Button><Button size="sm" variant={material.ativo ? 'danger' : 'secondary'} onClick={onStatus}>{material.ativo ? 'Desativar' : 'Reativar'}</Button></div></Card>
}

function MaterialForm({ form, setForm, disabled }) {
  return <><Input label="Nome do material" required maxLength={100} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Ex.: Lâmina descartável" disabled={disabled} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-label text-steel"><span className="mb-2 block">Tipo</span><select className={SELECT_CLASS} value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })} disabled={disabled}><option value="insumo">Insumo consumível</option><option value="ferramenta">Ferramenta / técnica</option></select></label><Input label="Unidade de uso" required maxLength={30} value={form.unidade} onChange={(event) => setForm({ ...form, unidade: event.target.value })} placeholder="unidade, ml, g..." disabled={disabled} /></div><div className="rounded-sm border border-info/30 bg-info/10 p-3 text-body-sm text-info">Insumos poderão ser ligados ao estoque posteriormente. Ferramentas registram o padrão necessário sem baixar estoque.</div></>
}

function ServiceForm({ form, setForm, materials, disabled }) {
  function toggleMaterial(material) {
    const selected = form.materiais.some((item) => item.material_id === material.id)
    setForm({ ...form, materiais: selected ? form.materiais.filter((item) => item.material_id !== material.id) : [...form.materiais, { material_id: material.id, quantidade: 1, observacao: '' }] })
  }
  function updateQuantity(materialId, value) {
    setForm({ ...form, materiais: form.materiais.map((item) => item.material_id === materialId ? { ...item, quantidade: value } : item) })
  }
  return <><Input label="Nome do serviço" required maxLength={120} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Ex.: Corte degradê" disabled={disabled} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><CurrencyInput label="Valor" value={form.preco} onValueChange={(value) => setForm({ ...form, preco: value })} disabled={disabled} /><Input label="Duração (minutos)" type="number" min="5" max="480" step="5" required value={form.duracao_minutos} onChange={(event) => setForm({ ...form, duracao_minutos: event.target.value })} disabled={disabled} /><Input label="Comissão específica (%)" type="number" min="0" max="100" step="0.01" value={form.comissao_percentual} onChange={(event) => setForm({ ...form, comissao_percentual: event.target.value })} helpText="Opcional; vazio usa a comissão do barbeiro." disabled={disabled} /></div><label className="block text-label text-steel"><span className="mb-2 block">Descrição</span><textarea className="min-h-24 w-full resize-y rounded-sm border border-line-strong bg-surface-2 p-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper" maxLength={1000} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} disabled={disabled} /></label><section className="space-y-3"><div><h3 className="text-h3 text-warm-white">Materiais utilizados</h3><p className="mt-1 text-body-sm text-steel">Selecione o padrão previsto para este serviço.</p></div>{materials.length === 0 ? <div className="rounded-sm border border-warning/30 bg-warning/10 p-3 text-body-sm text-warning">Cadastre materiais na aba Materiais antes de vinculá-los.</div> : <div className="space-y-2">{materials.map((material) => { const selected = form.materiais.find((item) => item.material_id === material.id); return <div key={material.id} className={`rounded-sm border p-3 ${selected ? 'border-copper bg-copper/8' : 'border-line bg-surface-1'}`}><div className="flex items-center gap-3"><input id={`material-${material.id}`} type="checkbox" checked={Boolean(selected)} onChange={() => toggleMaterial(material)} disabled={disabled} className="h-5 w-5 accent-copper" /><label htmlFor={`material-${material.id}`} className="min-w-0 flex-1 cursor-pointer"><span className="block truncate text-body font-semibold text-warm-white">{material.nome}</span><span className="text-body-sm capitalize text-steel">{material.tipo} · {material.unidade}</span></label>{selected && <div className="w-28"><label className="text-label text-steel">Quantidade<input type="number" min="0.001" step="0.001" value={selected.quantidade} onChange={(event) => updateQuantity(material.id, event.target.value)} disabled={disabled} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-surface-0 px-2 text-data text-warm-white focus:border-copper focus:outline-none" /></label></div>}</div></div>})}</div>}</section></>
}
