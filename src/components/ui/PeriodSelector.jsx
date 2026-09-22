/** PeriodSelector — seleção controlada de período, sem cálculo ou consulta de domínio. */
import { useId } from 'react'
import Button from './Button'
import Input from './Input'
import Label from './Label'

const OPTIONS = [
  ['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês'], ['quarter', 'Trimestre'], ['custom', 'Personalizado'],
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

function formatDate(value) {
  if (!value) return 'não definida'
  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

function PeriodSelector({
  value,
  onChange,
  customStart = '',
  customEnd = '',
  onCustomRangeChange,
  onApply,
  className = '',
  ...props
}) {
  const selectId = useId()

  return (
    <div className={['rounded-md border border-line bg-surface-1 p-6', className].filter(Boolean).join(' ')} {...props}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={selectId}>Período</Label>
          <select
            id={selectId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white transition-colors duration-100 ease-brand focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
          >
            {OPTIONS.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
          </select>
        </div>
        <Button onClick={onApply}>Aplicar período</Button>
      </div>

      {value === 'custom' && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input label="Data inicial" type="date" value={customStart} onChange={(event) => onCustomRangeChange?.({ start: event.target.value, end: customEnd })} />
          <Input label="Data final" type="date" value={customEnd} onChange={(event) => onCustomRangeChange?.({ start: customStart, end: event.target.value })} />
          <p className="text-body-sm text-steel sm:col-span-2">Período selecionado: {formatDate(customStart)} até {formatDate(customEnd)}.</p>
        </div>
      )}
    </div>
  )
}

export default PeriodSelector
