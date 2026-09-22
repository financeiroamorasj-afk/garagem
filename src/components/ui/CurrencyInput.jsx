/** CurrencyInput — entrada monetária por centavos; onValueChange devolve número em reais ou null. */
import { forwardRef, useId } from 'react'
import { formatarEntradaCentavos, interpretarEntradaCentavos } from '../../lib/financeiro/moeda'

const DEFAULT_HELP = 'Digite apenas algarismos. Ex.: 500 = R$ 5,00.'

const CurrencyInput = forwardRef(function CurrencyInput({
  label,
  value,
  onValueChange,
  error,
  helpText,
  id,
  className = '',
  disabled = false,
  allowNegative = false,
  onKeyDown,
  ...props
}, ref) {
  const autoId = useId()
  const inputId = id || autoId
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`
  const description = helpText ?? DEFAULT_HELP

  function handleChange(event) {
    const rawValue = event.target.value
    try {
      onValueChange(interpretarEntradaCentavos(rawValue, { allowNegative }))
    } catch {
      onValueChange(null)
    }
  }

  function handleKeyDown(event) {
    if (allowNegative && event.key === '-') {
      event.preventDefault()
      if (value !== null && value !== undefined && Number(value) !== 0) onValueChange(-Number(value))
    }
    onKeyDown?.(event)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-label text-steel">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-data text-steel" aria-hidden="true">R$</span>
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="numeric"
          value={formatarEntradaCentavos(value)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${helpId}` : helpId}
          className={[
            'h-10 w-full rounded-sm border border-line-strong bg-surface-2 pl-12 pr-3 text-data text-warm-white placeholder:text-steel',
            'transition-colors duration-100 ease-brand focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
            error ? 'border-danger' : '',
            'disabled:cursor-not-allowed disabled:opacity-40',
            className,
          ].filter(Boolean).join(' ')}
          {...props}
        />
      </div>
      {error && <p id={errorId} className="text-body-sm text-danger">{error}</p>}
      <p id={helpId} className="text-body-sm text-steel">{description}</p>
    </div>
  )
})

export default CurrencyInput
