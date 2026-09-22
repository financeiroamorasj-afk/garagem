/** FinancialChart — gráfico leve com resumo, legenda textual e tabela acessível. */
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { createElement } from 'react'
import Card from './Card'

const STATUS = {
  positive: { label: 'Positivo', className: 'text-success', icon: TrendingUp },
  warning: { label: 'Atenção', className: 'text-warning', icon: AlertTriangle },
  negative: { label: 'Negativo', className: 'text-danger', icon: TrendingDown },
}

function FinancialChart({ title, summary, data, formatValue = String, className = '', ...props }) {
  const max = Math.max(...data.map((item) => Math.abs(item.value)), 1)

  return (
    <Card className={className} {...props}>
      <Card.Header title={title} />
      <Card.Body>
        <p className="text-body text-steel">{summary}</p>
        <div className="mt-6 flex min-h-40 items-end gap-3" aria-hidden="true">
          {data.map((item) => {
            const status = STATUS[item.status] || STATUS.positive
            return (
              <div key={item.label} className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-data text-warm-white">{formatValue(item.value)}</span>
                <div className={['w-full max-w-12 rounded-sm border border-current bg-current/12', status.className].join(' ')} style={{ height: `${Math.max(12, Math.round((Math.abs(item.value) / max) * 96))}px` }} />
                <span className="text-label text-steel">{item.label}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-4" aria-label="Legenda">
          {Object.values(STATUS).map(({ label, className: statusClass, icon }) => (
            <span key={label} className={['inline-flex items-center gap-2 text-body-sm', statusClass].join(' ')}>{createElement(icon, { size: 16, 'aria-hidden': true })}{label}</span>
          ))}
        </div>

        <table className="sr-only">
          <caption>{title}: dados em formato tabular</caption>
          <thead><tr><th scope="col">Período</th><th scope="col">Valor</th><th scope="col">Estado</th></tr></thead>
          <tbody>{data.map((item) => <tr key={item.label}><th scope="row">{item.label}</th><td>{formatValue(item.value)}</td><td>{(STATUS[item.status] || STATUS.positive).label}</td></tr>)}</tbody>
        </table>
      </Card.Body>
    </Card>
  )
}

export default FinancialChart
