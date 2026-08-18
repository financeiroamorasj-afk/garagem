/**
 * EmptyState — estado vazio centralizado, sem ilustração nem emoji.
 *
 * <EmptyState icon={Inbox} title="Nenhum agendamento" description="A agenda de hoje está livre."
 *   action={<Button>Novo agendamento</Button>} />
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  vignette = false,
  className = '',
  ...props
}) {
  return (
    <div
      className={[
        'relative flex flex-col items-center justify-center gap-3 py-16 text-center',
        vignette ? 'atmosphere-vignette' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {Icon && <Icon size={20} className="text-steel" aria-hidden="true" />}
      <h3 className="text-h3 text-warm-white">{title}</h3>
      {description && (
        <p className="text-body max-w-sm text-steel">{description}</p>
      )}
      {action}
    </div>
  )
}

export default EmptyState
