/**
 * Badge — rótulo semântico curto, para status e tags.
 *
 * <Badge>Padrão</Badge>
 * <Badge variant="success">Pago</Badge>
 * <Badge variant="warning">Pendente</Badge>
 */
const VARIANT_CLASSES = {
  neutral: 'bg-surface-2 text-steel',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
}

function Badge({ variant = 'neutral', className = '', children, ...props }) {
  return (
    <span
      className={[
        'inline-flex h-5 items-center rounded-sm px-2 py-0.5 text-label',
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
