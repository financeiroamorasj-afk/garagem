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

function Modal({ open, onClose, title, footer, className = '', children }) {
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
    const focusable = panel?.querySelectorAll(FOCUSABLE_SELECTOR)
    const first = focusable?.[0] ?? panel
    first?.focus()

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
      triggerRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-surface-0/80 p-0 sm:items-center sm:p-6"
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
        className={[
          'max-h-[100dvh] w-full max-w-modal overflow-y-auto rounded-t-md bg-surface-3 p-4 shadow-overlay focus:outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-md sm:p-6',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <h2 id={titleId} className="text-h2 text-warm-white">
          {title}
        </h2>

        <div className="mt-4">{children}</div>

        {footer && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-end">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default Modal
