/** ReserveMeter — proporção acessível entre saldo bancário e reserva, sem inferir o saldo disponível. */
function ReserveMeter({ bankBalance, reserved, available, label, className = '', ...props }) {
  const bank = Number(bankBalance) || 0
  const reserve = Number(reserved) || 0
  const percentage = bank > 0 ? (reserve / bank) * 100 : reserve > 0 ? 100 : 0
  const visualPercentage = Math.min(Math.max(percentage, 0), 100)
  const isExceeded = reserve > bank || Number(available) < 0
  const isAttention = !isExceeded && percentage >= 75
  const tone = isExceeded ? 'bg-danger' : isAttention ? 'bg-warning' : 'bg-success'
  const state = isExceeded ? 'Reserva acima do saldo bancário' : isAttention ? 'Atenção: reserva elevada' : bank === 0 ? 'Sem saldo bancário' : 'Reserva dentro do saldo bancário'

  const format = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

  return (
    <div className={['flex flex-col gap-3', className].filter(Boolean).join(' ')} {...props}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body font-semibold text-warm-white">{label}</p>
        <p className="text-data text-steel">{percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% reservado</p>
      </div>
      <div
        role="progressbar"
        aria-label={`Proporção reservada em ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(visualPercentage)}
        aria-valuetext={`${format(reserve)} reservados de ${format(bank)}; ${format(available)} disponíveis. ${state}.`}
        className="h-3 overflow-hidden rounded-sm border border-line-strong bg-surface-2"
      >
        <div className={`h-full ${tone}`} style={{ width: `${visualPercentage}%` }} />
      </div>
      <div className="grid gap-2 text-data">
        <span className="text-steel">Bancário: <strong className="font-medium text-warm-white">{format(bank)}</strong></span>
        <span className="text-steel">Reservado: <strong className="font-medium text-warm-white">{format(reserve)}</strong></span>
        <span className="text-steel">Disponível: <strong className={Number(available) < 0 ? 'font-medium text-danger' : 'font-medium text-warm-white'}>{format(available)}</strong></span>
      </div>
      <p className={`text-body-sm ${isExceeded ? 'text-danger' : isAttention ? 'text-warning' : 'text-steel'}`}>{state}.</p>
    </div>
  )
}

export default ReserveMeter
