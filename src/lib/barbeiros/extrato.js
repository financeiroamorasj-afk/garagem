const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDateKey(dateKey, days) {
  if (!DATE_KEY.test(String(dateKey ?? ''))) throw new TypeError('Data inválida')
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(year, month - 1, day, 12)
  value.setDate(value.getDate() + days)
  return localDateKey(value)
}

export function periodoExtrato(dias = 30, hoje = localDateKey()) {
  const total = Number(dias)
  if (!Number.isInteger(total) || total < 1 || total > 367) throw new TypeError('Período inválido')
  return { inicio: shiftDateKey(hoje, -(total - 1)), fim: hoje }
}

export function validarPeriodoExtrato(inicio, fim) {
  if (!DATE_KEY.test(String(inicio ?? '')) || !DATE_KEY.test(String(fim ?? '')) || inicio > fim) return false
  const start = new Date(`${inicio}T12:00:00`)
  const end = new Date(`${fim}T12:00:00`)
  return Math.round((end - start) / 86400000) <= 366
}

export const STATUS_TEMPO = {
  acima: { label: 'Acima do previsto', variant: 'warning', description: 'A média real está maior que o tempo cadastrado.' },
  abaixo: { label: 'Abaixo do previsto', variant: 'info', description: 'A equipe pode ter espaço para reduzir a reserva na agenda.' },
  no_padrao: { label: 'Dentro do previsto', variant: 'success', description: 'A média está dentro da tolerância de 5 min ou 10%.' },
  sem_amostra: { label: 'Pouca amostra', variant: 'neutral', description: 'São necessários ao menos 3 atendimentos cronometrados.' },
}

export function statusTempo(value) {
  return STATUS_TEMPO[value] ?? STATUS_TEMPO.sem_amostra
}
