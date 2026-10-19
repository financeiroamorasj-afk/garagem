/**
 * Modal — overlay com painel focável, usado para confirmação e formulários curtos.
 *
 * <Modal open={open} onClose={() => setOpen(false)} title="Excluir cliente"
 *   footer={<><Button variant="secondary" onClick={close}>Cancelar</Button><Button variant="danger">Excluir</Button></>}>
 *   Tem certeza? Essa ação não pode ser desfeita.
 * </Modal>
 */
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Modal({ open, onClose, title, footer, fullScreenMobile = false, className = '', children }) {
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    triggerRef.current = document.activeElement

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    panel?.focus({ preventScroll: true })

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const items = panel.querySelectorAll(FOCUSABLE_SELECTOR)
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  const mobileShellClasses = fullScreenMobile
    ? 'flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col overflow-hidden rounded-none bg-surface-0 shadow-overlay focus:outline-none sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-modal sm:rounded-md sm:border sm:border-line sm:bg-surface-3'
    : 'flex max-h-[100dvh] w-full max-w-modal flex-col overflow-hidden rounded-t-md bg-surface-3 shadow-overlay focus:outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-md'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-surface-0/80 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[mobileShellClasses, className].filter(Boolean).join(' ')}
      >
        <header className="shrink-0 border-b border-line bg-surface-1 px-4 py-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:bg-transparent sm:px-6 sm:py-4">
          <h2 id={titleId} className="truncate text-h2 text-warm-white">
            {title}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        {footer && (
          <footer className="grid shrink-0 grid-cols-1 gap-3 border-t border-line bg-surface-1 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] min-[440px]:grid-cols-2 sm:flex sm:justify-end sm:bg-transparent sm:px-6 sm:py-4 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  )
}

export default Modal
