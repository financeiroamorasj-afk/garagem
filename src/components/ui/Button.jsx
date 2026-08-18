/**
 * Button — ação primária, secundária, terciária (ghost) ou destrutiva.
 *
 * <Button>Salvar</Button>
 * <Button variant="secondary" size="sm">Cancelar</Button>
 * <Button variant="danger" loading>Excluir</Button>
 * <Button variant="ghost" disabled>Indisponível</Button>
 */
import { forwardRef } from 'react'
import Spinner from './Spinner'

const SIZE_CLASSES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-sm',
}

const VARIANT_CLASSES = {
  primary:
    'bg-linear-135 from-copper to-gold-aged text-surface-0 hover:brightness-[1.12] active:brightness-[0.94]',
  secondary:
    'bg-transparent text-copper border border-copper hover:bg-copper/8 active:brightness-[0.94]',
  ghost:
    'bg-transparent text-steel border border-transparent hover:bg-steel/8 active:brightness-[0.94]',
  danger:
    'bg-transparent text-danger border border-danger hover:bg-danger/8 active:brightness-[0.94]',
}

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    className = '',
    children,
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-sm',
        'font-sans font-semibold uppercase tracking-button',
        'transition duration-100 ease-brand',
        'disabled:opacity-40 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {loading ? (
        <Spinner size={16} />
      ) : (
        children
      )}
    </button>
  )
})

export default Button
