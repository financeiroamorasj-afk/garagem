import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { formatarBRL } from '../lib/financeiro/moeda'
import { carregarConfiguracaoPix, mensagemErroPix } from '../lib/pix/api'
import { gerarPayloadPix } from '../lib/pix/brcode'

export default function PixPaymentPanel({ active, amount, onReadyChange }) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [qrState, setQrState] = useState({ payload: '', url: '' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!active) return
    let mounted = true
    carregarConfiguracaoPix()
      .then((result) => { if (mounted) { setError(''); setConfig(result) } })
      .catch((loadError) => { if (mounted) setError(mensagemErroPix(loadError)) })
    return () => { mounted = false }
  }, [active])

  const payloadState = useMemo(() => {
    if (!active || !config?.configurado || Number(amount) <= 0) return { payload: '', error: '' }
    try {
      return { payload: gerarPayloadPix({ chave: config.chave, beneficiario: config.beneficiario, cidade: config.cidade, valor: amount }), error: '' }
    } catch (payloadError) {
      return { payload: '', error: mensagemErroPix(payloadError) }
    }
  }, [active, amount, config])
  const payload = payloadState.payload

  useEffect(() => {
    let mounted = true
    if (!payload) return undefined
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 360, color: { dark: '#080807', light: '#FFFFFF' } })
      .then((url) => { if (mounted) setQrState({ payload, url }) })
      .catch(() => { if (mounted) setError('Não foi possível gerar o QR Code PIX.') })
    return () => { mounted = false }
  }, [payload])

  const qrUrl = qrState.payload === payload ? qrState.url : ''
  const ready = Boolean(payload && qrUrl && !error && !payloadState.error)
  useEffect(() => { onReadyChange?.(!active || ready) }, [active, onReadyChange, ready])

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o código abaixo.')
    }
  }

  if (!active) return null
  if (!config && !error) return <div className="flex min-h-36 items-center justify-center gap-3 rounded-md border border-line bg-surface-0 text-body-sm text-steel"><Spinner size={18} /> Preparando cobrança PIX...</div>
  if (error || payloadState.error) return <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error || payloadState.error}</div>
  if (!config?.configurado) return <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-4 text-body-sm text-warning"><strong className="block text-warm-white">PIX ainda não configurado</strong>O proprietário precisa cadastrar a chave em Configurações antes de receber por QR Code.</div>

  return (
    <section aria-label="Cobrança PIX" className="grid gap-4 rounded-md border border-copper/40 bg-copper/5 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
      <div>
        <p className="flex items-center gap-2 text-label text-copper"><QrCode size={17} /> PIX PRONTO PARA PAGAMENTO</p>
        <p className="mt-2 text-h2 text-warm-white">{formatarBRL(Number(amount))}</p>
        <p className="mt-1 text-body-sm text-steel">Beneficiário: <strong className="text-warm-white">{config.beneficiario}</strong></p>
        <p className="mt-3 text-body-sm text-steel">Peça ao cliente para escanear o QR Code e confirme a cobrança somente após conferir o pagamento.</p>
        <Button type="button" variant="secondary" className="mt-4 w-full sm:w-auto" disabled={!payload} onClick={copyPayload}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Código copiado' : 'Copiar PIX'}</Button>
        <textarea aria-label="PIX copia e cola" readOnly value={payload} onFocus={(event) => event.currentTarget.select()} rows={3} className="mt-3 w-full resize-none rounded-sm border border-line bg-surface-0 px-3 py-2 font-mono text-xs text-steel outline-none focus:border-copper" />
      </div>
      <div className="mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center overflow-hidden rounded-md bg-white p-2">
        {qrUrl ? <img src={qrUrl} alt={`QR Code PIX de ${formatarBRL(Number(amount))}`} className="h-full w-full object-contain" /> : <Spinner size={24} className="text-surface-0" />}
      </div>
    </section>
  )
}
