import { useEffect, useState } from 'react'
import { Download, Share2, Smartphone, X } from 'lucide-react'
import Button from './ui/Button'

const DISMISSED_KEY = 'garagem-install-prompt-dismissed'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [ios] = useState(() => isIos())
  const [visible, setVisible] = useState(() => !isStandalone() && window.sessionStorage.getItem(DISMISSED_KEY) !== '1' && isIos())
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (isStandalone() || window.sessionStorage.getItem(DISMISSED_KEY) === '1') return undefined

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  async function install() {
    if (!deferredPrompt) return
    setInstalling(true)
    await deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') setVisible(false)
    setDeferredPrompt(null)
    setInstalling(false)
  }

  if (!visible) return null

  return (
    <aside className="fixed inset-x-4 bottom-20 z-[70] rounded-md border border-copper/50 bg-surface-2 p-4 shadow-overlay sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(25rem,calc(100vw-3rem))]" aria-label="Instalar Garagem como aplicativo">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper/15 text-copper">
          <Smartphone size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-body text-warm-white">Use o Garagem como app</strong>
          <p className="mt-1 text-body-sm text-steel">
            {ios
              ? <>Toque em <Share2 size={14} className="mx-1 inline-block align-text-bottom text-copper" aria-hidden="true" /> Compartilhar e depois em <strong className="text-warm-white">Adicionar à Tela de Início</strong>.</>
              : 'Deixe um atalho na tela do celular para abrir o sistema com um toque.'}
          </p>
          {!ios && <Button size="sm" className="mt-3" loading={installing} onClick={install}><Download size={16} /> Instalar app</Button>}
        </div>
        <button type="button" aria-label="Fechar aviso de instalação" onClick={dismiss} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-steel hover:bg-surface-3 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"><X size={18} aria-hidden="true" /></button>
      </div>
    </aside>
  )
}
