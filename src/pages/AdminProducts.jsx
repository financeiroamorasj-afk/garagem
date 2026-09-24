import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, Package, Pencil, Plus, Search } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import CurrencyInput from '../components/ui/CurrencyInput'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { formatarBRL } from '../lib/financeiro/moeda'
import {
  atualizarProduto,
  criarProduto,
  definirProdutoAtivo,
  listarProdutosAdmin,
  mensagemErroProduto,
} from '../lib/produtos/api'

function initialForm(row) {
  return {
    nome: row?.nome ?? '',
    sku: row?.sku ?? '',
    categoria: row?.categoria ?? '',
    descricao: row?.descricao ?? '',
    preco_venda: row ? Number(row.preco_venda) : null,
    preco_custo: row ? Number(row.preco_custo) : null,
    estoque_quantidade: row?.estoque_quantidade ?? 0,
    estoque_minimo: row?.estoque_minimo ?? 0,
    comissao_percentual: row?.comissao_percentual ?? '',
  }
}

function normalizar(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

export default function AdminProducts() {
  const [products, setProducts] = useState([])
  const [includeInactive, setIncludeInactive] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(initialForm())
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setProducts(await listarProdutosAdmin({ incluirInativos: includeInactive }))
    } catch (loadError) {
      setError(mensagemErroProduto(loadError))
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const search = normalizar(query).trim()
    return products.filter((item) => !search || normalizar(`${item.nome} ${item.sku ?? ''} ${item.categoria ?? ''}`).includes(search))
  }, [products, query])
  const lowStock = products.filter((item) => item.ativo && item.estoque_quantidade <= item.estoque_minimo).length

  function openForm(row = null) {
    setModal({ type: 'form', row })
    setForm(initialForm(row))
    setFormError('')
    setNotice('')
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      if (modal.row) await atualizarProduto({ ...form, id: modal.row.id, expectedUpdatedAt: modal.row.updated_at })
      else await criarProduto(form)
      setModal(null)
      setNotice(`Produto ${modal.row ? 'atualizado' : 'cadastrado'} com sucesso.`)
      await load()
    } catch (submitError) {
      setFormError(mensagemErroProduto(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  async function changeStatus() {
    const row = modal.row
    setSubmitting(true)
    setFormError('')
    try {
      await definirProdutoAtivo({ id: row.id, ativo: !row.ativo })
      setModal(null)
      setNotice(`Produto ${row.ativo ? 'desativado' : 'reativado'}.`)
      await load()
    } catch (statusError) {
      setFormError(mensagemErroProduto(statusError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-2 block text-label text-copper">VAREJO E ESTOQUE</span>
          <h1 className="text-h1 text-warm-white sm:text-display">Produtos para venda</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Cadastre pomadas, ceras e outros itens vendidos pela equipe.</p>
        </div>
        <Button onClick={() => openForm()}><Plus size={17} /> Novo produto</Button>
      </header>

      {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{notice}</div>}
      {error && <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error}</div>}

      <section className="grid grid-cols-2 gap-3 sm:max-w-lg">
        <Card className="p-4"><Package size={18} className="mb-2 text-copper" /><span className="block text-data-lg text-warm-white">{products.filter((item) => item.ativo).length}</span><span className="text-label text-steel">Produtos ativos</span></Card>
        <Card className="p-4"><AlertTriangle size={18} className={`mb-2 ${lowStock ? 'text-warning' : 'text-success'}`} /><span className="block text-data-lg text-warm-white">{lowStock}</span><span className="text-label text-steel">Estoque baixo</span></Card>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-sm"><Input label="Buscar produto" icon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, código ou categoria" /></div>
        <div className="flex gap-2"><Button size="sm" variant={!includeInactive ? 'secondary' : 'ghost'} onClick={() => setIncludeInactive(false)}>Ativos</Button><Button size="sm" variant={includeInactive ? 'secondary' : 'ghost'} onClick={() => setIncludeInactive(true)}>Todos</Button></div>
      </div>

      {loading ? (
        <Card className="flex min-h-48 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Carregando produtos</Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={Boxes} title={query ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} description={query ? 'Tente outro termo.' : 'Cadastre o primeiro item que a equipe poderá vender.'} action={!query && <Button onClick={() => openForm()}>Novo produto</Button>} /></Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Produtos cadastrados">
          {visible.map((item) => {
            const low = item.estoque_quantidade <= item.estoque_minimo
            return <Card key={item.id} className={`flex flex-col gap-4 p-4 sm:p-5 ${item.ativo ? '' : 'opacity-65'}`}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-h2 text-warm-white">{item.nome}</h2><p className="mt-1 truncate text-body-sm text-steel">{item.categoria || 'Sem categoria'}{item.sku ? ` · ${item.sku}` : ''}</p></div><Badge variant={item.ativo ? low ? 'warning' : 'success' : 'neutral'}>{item.ativo ? low ? 'Estoque baixo' : 'Ativo' : 'Inativo'}</Badge></div>
              <div className="grid grid-cols-3 gap-2 rounded-sm border border-line bg-surface-0 p-3"><div><span className="block text-label text-steel">Venda</span><span className="text-data text-warm-white">{formatarBRL(item.preco_venda)}</span></div><div><span className="block text-label text-steel">Estoque</span><span className={`text-data ${low ? 'text-warning' : 'text-warm-white'}`}>{item.estoque_quantidade}</span></div><div><span className="block text-label text-steel">Comissão</span><span className="text-data text-warm-white">{Number(item.comissao_percentual || 0).toLocaleString('pt-BR')}%</span></div></div>
              <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-4"><Button size="sm" variant="ghost" onClick={() => openForm(item)}><Pencil size={14} /> Editar</Button><Button size="sm" variant={item.ativo ? 'danger' : 'secondary'} onClick={() => { setFormError(''); setModal({ type: 'status', row: item }) }}>{item.ativo ? 'Desativar' : 'Reativar'}</Button></div>
            </Card>
          })}
        </section>
      )}

      {modal?.type === 'form' && <Modal open onClose={() => !submitting && setModal(null)} title={`${modal.row ? 'Editar' : 'Novo'} produto`} className="sm:max-w-2xl" footer={<><Button variant="ghost" disabled={submitting} onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" form="product-form" loading={submitting}>Salvar produto</Button></>}>
        <form id="product-form" onSubmit={submit} className="space-y-4" noValidate>
          {formError && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{formError}</div>}
          <Input label="Nome do produto" required maxLength={120} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Ex.: Pomada modeladora" disabled={submitting} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Input label="Código / SKU" maxLength={60} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="Opcional" disabled={submitting} /><Input label="Categoria" maxLength={80} value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} placeholder="Ex.: Finalização" disabled={submitting} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><CurrencyInput label="Preço de venda" value={form.preco_venda} onValueChange={(value) => setForm({ ...form, preco_venda: value })} disabled={submitting} /><CurrencyInput label="Preço de custo" value={form.preco_custo} onValueChange={(value) => setForm({ ...form, preco_custo: value })} disabled={submitting} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Input label="Estoque atual" type="number" min="0" step="1" required value={form.estoque_quantidade} onChange={(event) => setForm({ ...form, estoque_quantidade: event.target.value })} disabled={submitting} /><Input label="Estoque mínimo" type="number" min="0" step="1" required value={form.estoque_minimo} onChange={(event) => setForm({ ...form, estoque_minimo: event.target.value })} disabled={submitting} /><Input label="Comissão (%)" type="number" min="0" max="100" step="0.01" value={form.comissao_percentual} onChange={(event) => setForm({ ...form, comissao_percentual: event.target.value })} helpText="Opcional" disabled={submitting} /></div>
          <label className="block text-label text-steel"><span className="mb-2 block">Descrição</span><textarea className="min-h-24 w-full resize-y rounded-sm border border-line-strong bg-surface-2 p-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper" maxLength={1000} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} disabled={submitting} /></label>
        </form>
      </Modal>}

      {modal?.type === 'status' && <Modal open onClose={() => !submitting && setModal(null)} title={`${modal.row.ativo ? 'Desativar' : 'Reativar'} produto`} footer={<><Button variant="ghost" disabled={submitting} onClick={() => setModal(null)}>Cancelar</Button><Button variant={modal.row.ativo ? 'danger' : 'primary'} loading={submitting} onClick={changeStatus}>{modal.row.ativo ? 'Desativar' : 'Reativar'}</Button></>}>
        {formError && <div role="alert" className="mb-4 rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{formError}</div>}
        <p className="text-body text-steel">{modal.row.ativo ? `${modal.row.nome} deixará de aparecer para a equipe nas novas vendas.` : `${modal.row.nome} voltará a ficar disponível para venda.`}</p>
      </Modal>}
    </div>
  )
}
