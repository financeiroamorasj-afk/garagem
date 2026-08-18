/**
 * Label — rótulo autônomo no estilo `label` (uppercase, mono), sempre ligado a um campo.
 *
 * <Label htmlFor="nome">Nome completo</Label>
 */
function Label({ htmlFor, className = '', children, ...props }) {
  return (
    <label
      htmlFor={htmlFor}
      className={['text-label text-steel', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </label>
  )
}

export default Label
