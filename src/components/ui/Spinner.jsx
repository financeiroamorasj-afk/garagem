/**
 * Spinner — anel de carregamento, 16 ou 24px. Respeita prefers-reduced-motion.
 *
 * <Spinner />
 * <Spinner size={24} />
 */
function Spinner({ size = 16, className = '', ...props }) {
  const dimension = size === 24 ? 'h-6 w-6' : 'h-4 w-4'

  return (
    <span
      role="status"
      aria-label="Carregando"
      className={[
        dimension,
        'inline-block animate-spin rounded-full border-2 border-copper border-t-transparent',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}

export default Spinner
