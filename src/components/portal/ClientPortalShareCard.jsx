import { useState } from 'react'
import { Copy, ExternalLink, Link2, MessageCircle } from 'lucide-react'
import { criarLinkPortal, criarMensagemPortal } from '../../lib/portal/share'
import Button from '../ui/Button'
import Card from '../ui/Card'

export default function ClientPortalShareCard({ barbearia }) {
  const [copyState, setCopyState] = useState('')
  const portalUrl = criarLinkPortal(barbearia?.slug)
  const message = criarMensagemPortal({ nomeBarbearia: barbearia?.nome, portalUrl })

  async function copy(value, successMessage) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível')
      await navigator.clipboard.writeText(value)
      setCopyState(successMessage)
    } catch {
      setCopyState('Não foi possível copiar automaticamente. Toque no conteúdo para selecioná-lo.')
    }
  }

  return (
    <Card className="space-y-5 border-copper/30 bg-copper/5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-copper/40 bg-copper/10 text-copper"><Link2 size={20} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="text-h2 text-warm-white">Portal do cliente</h3>
          <p className="mt-1 max-w-3xl text-body-sm text-steel">Compartilhe este endereço nas mensagens automáticas do WhatsApp para o cliente consultar horários e fazer agendamentos.</p>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-label text-steel">LINK DA SUA BARBEARIA</span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <code className="min-w-0 flex-1 select-all break-all rounded-sm border border-line bg-surface-0 px-3 py-3 text-body-sm text-copper">{portalUrl || 'Carregando endereço do portal...'}</code>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="secondary" disabled={!portalUrl} onClick={() => copy(portalUrl, 'Link do portal copiado.')}><Copy size={16} /> Copiar link</Button>
            {portalUrl && <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center justify-center gap-2 rounded-sm border border-line px-3 text-[13px] font-semibold uppercase tracking-button text-steel transition-colors hover:border-copper hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"><ExternalLink size={16} /> Abrir portal</a>}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-5">
        <div className="flex items-center gap-2 text-label text-steel"><MessageCircle size={16} className="text-copper" aria-hidden="true" /> MENSAGEM PRONTA PARA O WHATSAPP</div>
        <textarea
          readOnly
          rows={6}
          value={message}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Mensagem pronta para compartilhar o Portal do Cliente"
          className="w-full resize-none rounded-sm border border-line bg-surface-0 p-3 text-body-sm text-warm-white outline-none focus:border-copper focus:ring-1 focus:ring-copper"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-steel">O texto pode ser colado na saudação, confirmação ou lembrete automático.</p>
          <Button className="shrink-0" size="sm" disabled={!message} onClick={() => copy(message, 'Mensagem do portal copiada.')}><Copy size={16} /> Copiar mensagem</Button>
        </div>
      </div>

      {copyState && <p role="status" aria-live="polite" className="text-body-sm text-steel">{copyState}</p>}
    </Card>
  )
}
