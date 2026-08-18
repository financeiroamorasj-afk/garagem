/**
 * Input — campo de texto com label obrigatório, ícone opcional, erro e ajuda.
 *
 * <Input label="Nome" placeholder="Digite o nome" />
 * <Input label="Busca" icon={Search} />
 * <Input label="E-mail" error="E-mail inválido" />
 * <Input label="Telefone" helpText="Com DDD" />
 */
import { forwardRef, useId } from 'react'

const Input = forwardRef(function Input(
  {
    label,
    icon: Icon,
    error,
    helpText,
    disabled = false,
    className = '',
    id,
    ...props
  },
  ref
) {
  const autoId = useId()
  const inputId = id || autoId
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-label text-steel"
      >
        {label}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? errorId : helpText ? helpId : undefined
          }
          className={[
            'peer h-10 w-full rounded-sm bg-surface-2 text-body text-warm-white placeholder:text-steel',
            'border border-line-strong px-3',
            Icon ? 'pl-9' : '',
            'transition-colors duration-100 ease-brand',
            'focus:outline-none focus:border-copper focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
            error ? 'border-danger' : '',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel peer-focus:text-copper"
          />
        )}
      </div>

      {error ? (
        <p id={errorId} className="text-body-sm text-danger">
          {error}
        </p>
      ) : helpText ? (
        <p id={helpId} className="text-body-sm text-steel">
          {helpText}
        </p>
      ) : null}
    </div>
  )
})

export default Input
