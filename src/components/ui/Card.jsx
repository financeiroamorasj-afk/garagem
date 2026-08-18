/**
 * Card — contêiner de superfície, com Header/Body e variante de métrica.
 *
 * <Card>
 *   <Card.Header title="Comissões" action={<Button size="sm">Ver tudo</Button>} />
 *   <Card.Body>...</Card.Body>
 * </Card>
 *
 * <Card.Metric label="Faturamento" value="R$ 12.480" badge={<Badge variant="success">+8%</Badge>} />
 */
function Card({ clickable = false, className = '', children, ...props }) {
  return (
    <div
      className={[
        'rounded-md border border-line bg-surface-1 p-6',
        clickable
          ? 'transition-colors duration-100 ease-brand hover:border-line-strong'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

function CardHeader({ title, action, className = '', ...props }) {
  return (
    <div
      className={[
        'mb-4 flex items-center justify-between border-b border-line pb-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <h3 className="text-h3 text-warm-white">{title}</h3>
      {action}
    </div>
  )
}

function CardBody({ className = '', children, ...props }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  )
}

function CardMetric({ label, value, badge, className = '', ...props }) {
  return (
    <div
      className={[
        'rounded-md border border-line bg-surface-1 p-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <p className="text-label text-steel">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-data-lg text-warm-white">{value}</span>
        {badge}
      </div>
    </div>
  )
}

Card.Header = CardHeader
Card.Body = CardBody
Card.Metric = CardMetric

export default Card
