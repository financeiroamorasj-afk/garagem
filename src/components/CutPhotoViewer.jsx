import { useEffect, useRef, useState } from 'react'
import { Expand, LoaderCircle, X } from 'lucide-react'
import { createPortal } from 'react-dom'

export default function CutPhotoViewer({
  src = '',
  loadSrc,
  alt = 'Foto do corte',
  thumbnailClassName = 'h-24 w-24',
  className = '',
  placeholder,
}) {
  const triggerRef = useRef(null)
  const closeRef = useRef(null)
  const [resolvedSrc, setResolvedSrc] = useState(src)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setResolvedSrc(src), [src])

  useEffect(() => {
    if (!open) return undefined
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      document.body.style.overflow = previousOverflow
      trigger?.focus?.()
    }
  }, [open])

  async function showPhoto() {
    setError('')
    if (resolvedSrc) {
      setOpen(true)
      return
    }
    if (!loadSrc) return
    setLoading(true)
    try {
      const nextSrc = await loadSrc()
      if (!nextSrc) throw new Error('FOTO_NAO_DISPONIVEL')
      setResolvedSrc(nextSrc)
      setOpen(true)
    } catch {
      setError('Não foi possível abrir a foto agora. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!resolvedSrc && !loadSrc) return placeholder ?? null

  return (
    <>
      <div className={className}>
        <button
          ref={triggerRef}
          type="button"
          onClick={showPhoto}
          disabled={loading}
          aria-label={`Ampliar ${alt.toLowerCase()}`}
          className={`group relative block shrink-0 overflow-hidden rounded-sm border border-line bg-surface-2 text-steel outline-none transition hover:border-copper focus-visible:ring-2 focus-visible:ring-copper ${thumbnailClassName}`}
        >
          {resolvedSrc
            ? <img src={resolvedSrc} alt={alt} className="h-full w-full object-cover" />
            : placeholder}
          <span className="absolute inset-0 flex items-center justify-center bg-surface-0/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {loading ? <LoaderCircle size={21} className="animate-spin text-copper" /> : <Expand size={21} className="text-warm-white" />}
          </span>
        </button>
        {error && <p role="alert" className="mt-2 max-w-48 text-body-sm text-danger">{error}</p>}
      </div>

      {open && resolvedSrc && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-0/95 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada da foto do corte"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
        >
          <div className="relative flex max-h-full max-w-6xl flex-col items-center gap-3">
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Fechar foto" className="self-end rounded-sm border border-line bg-surface-2 p-2 text-warm-white hover:border-copper hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              <X size={22} />
            </button>
            <img src={resolvedSrc} alt={alt} className="max-h-[calc(100dvh-6rem)] max-w-full rounded-md object-contain shadow-overlay" />
            <p className="text-center text-body-sm text-steel">Toque fora da foto ou use o botão para fechar.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
