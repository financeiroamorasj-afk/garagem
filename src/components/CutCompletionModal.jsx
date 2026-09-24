import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, ImagePlus, Minus, PackagePlus, Plus, Sparkles } from 'lucide-react'
import Button from './ui/Button'
import Input from './ui/Input'
import Label from './ui/Label'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'
import { concluirCheckoutAtendimento, mensagemErroCorte, obterUrlFotoCorte } from '../lib/clientes/cortes-api'
import { compactarFotoCorte, formatarTamanho } from '../lib/clientes/imagem'
import { listarProdutosBarbeiro } from '../lib/produtos/api'
import { formatarBRL } from '../lib/financeiro/moeda'

const STYLES = ['Degradê', 'Social', 'Navalhado', 'Tesoura', 'Buzz cut']
const FINISHES = ['Navalha', 'Máquina', 'Tesoura', 'Natural']
const BEARDS = ['Não realizada', 'Marcada', 'Degradê', 'Completa']
const PAYMENTS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['debito', 'Cartão de débito'], ['credito', 'Cartão de crédito'], ['outro', 'Outro']]

function hojeLocal() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-label text-steel">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={`min-h-10 rounded-sm border px-3 text-body-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${value === option ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-1 text-steel hover:text-warm-white'}`}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function PreviousPhoto({ path }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true
    if (!path) return undefined
    obterUrlFotoCorte(path).then((nextUrl) => { if (active) setUrl(nextUrl ?? '') }).catch(() => {})
    return () => { active = false }
  }, [path])
  if (!url) return null
  return <img src={url} alt="Foto do último corte" className="h-24 w-24 shrink-0 rounded-sm border border-line object-cover" />
}

export default function CutCompletionModal({ appointment, open, onClose, onSuccess }) {
  const lastCut = appointment?.ultimo_corte
  const [style, setStyle] = useState('')
  const [combs, setCombs] = useState('')
  const [finish, setFinish] = useState('')
  const [beard, setBeard] = useState('Não realizada')
  const [notes, setNotes] = useState('')
  const [preferences, setPreferences] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [compressing, setCompressing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [productQuantities, setProductQuantities] = useState({})
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [serviceValue, setServiceValue] = useState('')
  const [discount, setDiscount] = useState('0')
  const [fee, setFee] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [receiptDate, setReceiptDate] = useState(hojeLocal())
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open || !appointment) return
    setStyle(lastCut?.estilo ?? '')
    setCombs(lastCut?.pentes ?? '')
    setFinish(lastCut?.acabamento ?? '')
    setBeard(lastCut?.barba ?? 'Não realizada')
    setNotes('')
    setPreferences(appointment.cliente_preferencias ?? lastCut?.preferencias_cliente ?? '')
    setPhoto(null)
    setError('')
    setProductQuantities({})
    setServiceValue(String(Number(appointment.valor_final ?? 0).toFixed(2)))
    setDiscount('0')
    setFee('0')
    setPaymentMethod('pix')
    setReceiptDate(hojeLocal())
    setIdempotencyKey(crypto.randomUUID())
    setLoadingProducts(true)
    listarProdutosBarbeiro()
      .then((rows) => setProducts(rows ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false))
  }, [appointment, lastCut, open])

  useEffect(() => {
    if (!photo?.blob) { setPreview(''); return undefined }
    const url = URL.createObjectURL(photo.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const reduction = useMemo(() => {
    if (!photo?.originalBytes) return 0
    return Math.max(0, Math.round((1 - photo.bytes / photo.originalBytes) * 100))
  }, [photo])

  const selectedProducts = useMemo(() => products
    .map((product) => ({ ...product, quantidade: Number(productQuantities[product.id] ?? 0) }))
    .filter((product) => product.quantidade > 0), [productQuantities, products])
  const productsTotal = useMemo(() => selectedProducts.reduce((total, product) => total + Number(product.preco_venda) * product.quantidade, 0), [selectedProducts])
  const grossTotal = Number(serviceValue || 0) + productsTotal
  const finalTotal = Math.max(0, grossTotal - Number(discount || 0))
  const netTotal = Math.max(0, finalTotal - Number(fee || 0))

  function changeProduct(product, delta) {
    setProductQuantities((current) => {
      const next = Math.max(0, Math.min(product.estoque_quantidade, Number(current[product.id] ?? 0) + delta))
      return { ...current, [product.id]: next }
    })
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setCompressing(true)
    setError('')
    try {
      setPhoto(await compactarFotoCorte(file))
    } catch (photoError) {
      setPhoto(null)
      setError(mensagemErroCorte(photoError))
    } finally {
      setCompressing(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const numericService = Number(serviceValue)
      const numericDiscount = Number(discount)
      const numericFee = Number(fee)
      if (!Number.isFinite(numericService) || numericService < 0) throw new TypeError('Revise o valor do serviço.')
      if (!Number.isFinite(numericDiscount) || numericDiscount < 0 || numericDiscount > grossTotal) throw new TypeError('O desconto não pode ultrapassar o total.')
      if (!Number.isFinite(numericFee) || numericFee < 0 || numericFee > finalTotal) throw new TypeError('A taxa não pode ultrapassar o valor final.')
      const result = await concluirCheckoutAtendimento({
        appointmentId: appointment.id,
        estilo: style,
        pentes: combs,
        acabamento: finish,
        barba: beard,
        observacoes: notes,
        preferencias: preferences,
        foto: photo ? { clienteId: appointment.cliente_id, imagem: photo } : null,
        produtos: selectedProducts.map((product) => ({ produtoId: product.id, quantidade: product.quantidade })),
        valorServico: numericService,
        desconto: numericDiscount,
        formaPagamento: paymentMethod,
        taxa: numericFee,
        dataRecebimento: receiptDate,
        chaveIdempotencia: idempotencyKey,
      })
      await onSuccess?.(result)
      onClose()
    } catch (saveError) {
      setError(mensagemErroCorte(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Concluir atendimento"
      className="sm:max-w-4xl"
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Voltar</Button>
          <Button type="submit" form="cut-completion-form" loading={saving} disabled={compressing || style.trim().length < 2 || finalTotal <= 0}><CheckCircle2 size={17} /> Confirmar {formatarBRL(finalTotal)}</Button>
        </>
      )}
    >
      <form id="cut-completion-form" className="space-y-5" onSubmit={submit}>
        <div className="rounded-sm border border-line bg-surface-1 p-3">
          <p className="text-label text-copper">CLIENTE</p>
          <p className="mt-1 text-h3 text-warm-white">{appointment?.cliente_nome}</p>
          <p className="mt-1 text-body-sm text-steel">{appointment?.servico_nome}</p>
        </div>

        {error && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</p>}

        {lastCut && (
          <section className="flex gap-3 rounded-md border border-info/30 bg-info/5 p-3">
            <PreviousPhoto path={lastCut.foto_path} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-label text-info"><Sparkles size={14} /> ÚLTIMO CORTE CARREGADO</p>
              <p className="mt-2 text-body font-semibold text-warm-white">{lastCut.estilo}</p>
              <p className="mt-1 text-body-sm text-steel">{[lastCut.pentes, lastCut.acabamento, lastCut.barba].filter(Boolean).join(' · ')}</p>
              <p className="mt-2 text-body-sm text-steel">Os dados anteriores foram preenchidos para você confirmar ou ajustar.</p>
            </div>
          </section>
        )}

        <ChoiceGroup label="Estilo do corte" options={STYLES} value={style} onChange={setStyle} />
        <Input label="Estilo personalizado" value={style} onChange={(event) => setStyle(event.target.value)} maxLength={80} placeholder="Ex.: degradê baixo com topo texturizado" />
        <Input label="Pentes e alturas" value={combs} onChange={(event) => setCombs(event.target.value)} maxLength={120} placeholder="Ex.: 0,5 nas laterais; pente 2 na conexão" />
        <ChoiceGroup label="Acabamento" options={FINISHES} value={finish} onChange={setFinish} />
        <ChoiceGroup label="Barba" options={BEARDS} value={beard} onChange={setBeard} />

        <label className="block text-label text-steel">
          <span className="mb-2 block">Observações deste corte</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Detalhes que ajudam a repetir o resultado" className="w-full resize-y rounded-sm border border-line-strong bg-surface-2 px-3 py-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper" />
        </label>
        <label className="block text-label text-steel">
          <span className="mb-2 block">Preferências permanentes do cliente</span>
          <textarea value={preferences} onChange={(event) => setPreferences(event.target.value)} maxLength={1000} rows={3} placeholder="Ex.: não subir muito a lateral; prefere acabamento natural" className="w-full resize-y rounded-sm border border-line-strong bg-surface-2 px-3 py-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper" />
        </label>

        <section className="space-y-3 border-t border-line pt-5">
          <div>
            <p className="flex items-center gap-2 text-label text-copper"><PackagePlus size={16} /> PRODUTOS DO ATENDIMENTO</p>
            <p className="mt-1 text-body-sm text-steel">Adicione somente o que o cliente está levando agora. A baixa de estoque será automática.</p>
          </div>
          {loadingProducts ? <p className="text-body-sm text-steel">Carregando produtos...</p> : products.length === 0 ? <p className="rounded-sm border border-line bg-surface-1 p-3 text-body-sm text-steel">Nenhum produto disponível para venda.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {products.map((product) => {
                const quantity = Number(productQuantities[product.id] ?? 0)
                return <div key={product.id} className={`flex items-center justify-between gap-3 rounded-sm border p-3 ${quantity > 0 ? 'border-copper bg-copper/5' : 'border-line bg-surface-1'}`}>
                  <div className="min-w-0"><p className="truncate font-semibold text-warm-white">{product.nome}</p><p className="mt-1 text-body-sm text-steel">{formatarBRL(product.preco_venda)} · {product.estoque_quantidade} em estoque</p></div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`Remover ${product.nome}`} disabled={quantity === 0 || saving} onClick={() => changeProduct(product, -1)} className="grid h-10 w-10 place-items-center rounded-sm border border-line text-steel disabled:opacity-30"><Minus size={16} /></button>
                    <span className="w-5 text-center text-data text-warm-white">{quantity}</span>
                    <button type="button" aria-label={`Adicionar ${product.nome}`} disabled={quantity >= product.estoque_quantidade || saving} onClick={() => changeProduct(product, 1)} className="grid h-10 w-10 place-items-center rounded-sm border border-copper text-copper disabled:opacity-30"><Plus size={16} /></button>
                  </div>
                </div>
              })}
            </div>
          )}
        </section>

        <section className="space-y-4 border-t border-line pt-5">
          <div><p className="flex items-center gap-2 text-label text-copper"><CreditCard size={16} /> PAGAMENTO</p><p className="mt-1 text-body-sm text-steel">Confirme os valores antes de encerrar. O lançamento financeiro será criado automaticamente.</p></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Valor do serviço" type="number" min="0" step="0.01" value={serviceValue} onChange={(event) => setServiceValue(event.target.value)} />
            <Input label="Desconto total" type="number" min="0" max={grossTotal} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            <Input label="Taxa da operação" type="number" min="0" max={finalTotal} step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} helpText="Ex.: taxa da maquininha" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-label text-steel">Forma de pagamento<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper">{PAYMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <Input label="Data prevista para receber" type="date" min={hojeLocal()} value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} helpText={receiptDate === hojeLocal() ? 'Baixa financeira imediata' : 'Ficará como valor previsto'} />
          </div>
          <div className="rounded-md border border-line bg-surface-0 p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm"><span className="text-steel">Serviço</span><strong className="text-right text-warm-white">{formatarBRL(Number(serviceValue || 0))}</strong><span className="text-steel">Produtos</span><strong className="text-right text-warm-white">{formatarBRL(productsTotal)}</strong><span className="text-steel">Desconto</span><strong className="text-right text-danger">− {formatarBRL(Number(discount || 0))}</strong><span className="border-t border-line pt-3 text-label text-copper">TOTAL COBRADO</span><strong className="border-t border-line pt-3 text-right text-data-lg text-gold-aged">{formatarBRL(finalTotal)}</strong><span className="text-steel">Líquido após taxa</span><strong className="text-right text-success">{formatarBRL(netTotal)}</strong></div>
          </div>
        </section>

        <section>
          <Label>Foto do resultado (opcional)</Label>
          <p className="mt-1 text-body-sm text-steel">A foto é compactada antes do envio e fica privada para esta barbearia.</p>
          <label className="mt-3 flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed border-line-strong bg-surface-1 p-4 text-center text-body-sm text-steel hover:border-copper hover:text-copper focus-within:ring-2 focus-within:ring-copper">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={selectPhoto} className="sr-only" disabled={compressing || saving} />
            {compressing ? <><Spinner size={20} /> Compactando no aparelho...</> : preview ? (
              <div className="flex w-full items-center gap-3 text-left">
                <img src={preview} alt="Prévia da foto compactada" className="h-24 w-24 shrink-0 rounded-sm object-cover" />
                <div><p className="font-semibold text-warm-white">Foto pronta para envio</p><p className="mt-1">{formatarTamanho(photo.bytes)} · {photo.width}×{photo.height}</p><p className="mt-1 text-success">{reduction}% menor que a original</p><p className="mt-2 text-copper">Toque para trocar</p></div>
              </div>
            ) : <><ImagePlus size={22} className="text-copper" /><span><strong className="block text-warm-white">Fotografar ou escolher imagem</strong>Máximo após compressão: 800 KB</span></>}
          </label>
        </section>
      </form>
    </Modal>
  )
}
