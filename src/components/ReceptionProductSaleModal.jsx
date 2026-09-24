import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Minus, PackagePlus, Plus, ShoppingBag } from 'lucide-react'
import Button from './ui/Button'
import Input from './ui/Input'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'
import { formatarBRL } from '../lib/financeiro/moeda'
import {
  listarProdutosRecepcao,
  listarProfissionaisRecepcao,
  mensagemErroRecepcao,
  venderProdutosRecepcao,
} from '../lib/recepcao/api'

const PAYMENTS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['debito', 'Cartão de débito'], ['credito', 'Cartão de crédito'], ['outro', 'Outro']]

function hojeLocal() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default function ReceptionProductSaleModal({ open, onClose, onSuccess }) {
  const [products, setProducts] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [quantities, setQuantities] = useState({})
  const [professionalId, setProfessionalId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [fee, setFee] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [receiptDate, setReceiptDate] = useState(hojeLocal())
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setQuantities({})
    setProfessionalId('')
    setDiscount('0')
    setFee('0')
    setPaymentMethod('pix')
    setReceiptDate(hojeLocal())
    setIdempotencyKey(crypto.randomUUID())
    setError('')
    setLoading(true)
    Promise.all([listarProdutosRecepcao(), listarProfissionaisRecepcao()])
      .then(([productRows, professionalRows]) => { setProducts(productRows ?? []); setProfessionals(professionalRows ?? []) })
      .catch((loadError) => setError(mensagemErroRecepcao(loadError)))
      .finally(() => setLoading(false))
  }, [open])

  const selectedProducts = useMemo(() => products
    .map((product) => ({ ...product, quantidade: Number(quantities[product.id] ?? 0) }))
    .filter((product) => product.quantidade > 0), [products, quantities])
  const grossTotal = useMemo(() => selectedProducts.reduce((total, product) => total + Number(product.preco_venda) * product.quantidade, 0), [selectedProducts])
  const finalTotal = Math.max(0, grossTotal - Number(discount || 0))
  const netTotal = Math.max(0, finalTotal - Number(fee || 0))

  function changeProduct(product, delta) {
    setQuantities((current) => ({ ...current, [product.id]: Math.max(0, Math.min(product.estoque_quantidade, Number(current[product.id] ?? 0) + delta)) }))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const numericDiscount = Number(discount)
      const numericFee = Number(fee)
      if (selectedProducts.length === 0) throw new TypeError('Adicione pelo menos um produto.')
      if (!Number.isFinite(numericDiscount) || numericDiscount < 0 || numericDiscount > grossTotal) throw new TypeError('O desconto não pode ultrapassar o total.')
      if (!Number.isFinite(numericFee) || numericFee < 0 || numericFee > finalTotal) throw new TypeError('A taxa não pode ultrapassar o valor cobrado.')
      const result = await venderProdutosRecepcao({
        produtos: selectedProducts.map((product) => ({ produtoId: product.id, quantidade: product.quantidade })),
        profissionalId: professionalId || null,
        desconto: numericDiscount,
        formaPagamento: paymentMethod,
        taxa: numericFee,
        dataRecebimento: receiptDate,
        chaveIdempotencia: idempotencyKey,
      })
      await onSuccess?.(result)
      onClose()
    } catch (saleError) {
      setError(mensagemErroRecepcao(saleError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Venda avulsa" className="sm:max-w-4xl" footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Voltar</Button><Button type="submit" form="reception-product-sale-form" loading={saving} disabled={loading || selectedProducts.length === 0 || finalTotal <= 0}><CheckCircle2 size={17} /> Receber {formatarBRL(finalTotal)}</Button></>}>
      <form id="reception-product-sale-form" className="space-y-5" onSubmit={submit}>
        <div className="rounded-sm border border-line bg-surface-1 p-3"><p className="flex items-center gap-2 text-label text-copper"><ShoppingBag size={16} /> VENDA NO BALCÃO</p><p className="mt-2 text-body-sm text-steel">Monte o carrinho. A baixa do estoque acontece somente ao confirmar o recebimento.</p></div>
        {error && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</p>}

        <section className="space-y-3">
          <p className="flex items-center gap-2 text-label text-copper"><PackagePlus size={16} /> PRODUTOS</p>
          {loading ? <p className="flex items-center gap-2 text-body-sm text-steel"><Spinner size={16} /> Carregando catálogo...</p> : products.length === 0 ? <p className="rounded-sm border border-line bg-surface-1 p-3 text-body-sm text-steel">Nenhum produto disponível para venda.</p> : <div className="grid gap-2 sm:grid-cols-2">{products.map((product) => { const quantity = Number(quantities[product.id] ?? 0); return <div key={product.id} className={`flex items-center justify-between gap-3 rounded-sm border p-3 ${quantity > 0 ? 'border-copper bg-copper/5' : 'border-line bg-surface-1'}`}><div className="min-w-0"><p className="truncate font-semibold text-warm-white">{product.nome}</p><p className="mt-1 text-body-sm text-steel">{formatarBRL(product.preco_venda)} · {product.estoque_quantidade} em estoque</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" aria-label={`Remover ${product.nome}`} disabled={quantity === 0 || saving} onClick={() => changeProduct(product, -1)} className="grid h-10 w-10 place-items-center rounded-sm border border-line text-steel disabled:opacity-30"><Minus size={16} /></button><span className="w-5 text-center text-data text-warm-white">{quantity}</span><button type="button" aria-label={`Adicionar ${product.nome}`} disabled={quantity >= product.estoque_quantidade || saving} onClick={() => changeProduct(product, 1)} className="grid h-10 w-10 place-items-center rounded-sm border border-copper text-copper disabled:opacity-30"><Plus size={16} /></button></div></div> })}</div>}
        </section>

        <section className="space-y-4 border-t border-line pt-5">
          <label className="flex flex-col gap-2 text-label text-steel">Profissional responsável (opcional)<select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper"><option value="">Venda direta da recepção</option>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.apelido || professional.nome}</option>)}</select><span className="text-body-sm normal-case tracking-normal text-steel">Selecione somente quando um barbeiro tiver indicado ou realizado a venda.</span></label>
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Desconto total" type="number" min="0" max={grossTotal} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /><Input label="Taxa da operação" type="number" min="0" max={finalTotal} step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} helpText="Ex.: taxa da maquininha" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-label text-steel">Forma de pagamento<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper">{PAYMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Input label="Data prevista para receber" type="date" min={hojeLocal()} value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} helpText={receiptDate === hojeLocal() ? 'Recebimento confirmado agora' : 'Ficará como valor previsto'} /></div>
          <div className="rounded-md border border-line bg-surface-0 p-4"><div className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm"><span className="text-steel">Produtos</span><strong className="text-right text-warm-white">{formatarBRL(grossTotal)}</strong><span className="text-steel">Desconto</span><strong className="text-right text-danger">− {formatarBRL(Number(discount || 0))}</strong><span className="border-t border-line pt-3 text-label text-copper">TOTAL COBRADO</span><strong className="border-t border-line pt-3 text-right text-data-lg text-gold-aged">{formatarBRL(finalTotal)}</strong><span className="text-steel">Líquido após taxa</span><strong className="text-right text-success">{formatarBRL(netTotal)}</strong></div></div>
        </section>
      </form>
    </Modal>
  )
}

