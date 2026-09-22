const TIME_ZONE = 'America/Sao_Paulo'

export function dataCompetenciaBrt(data = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(data)
}

export function periodoMensalBrt(ano, mes) {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) throw new RangeError('Período inválido')
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10)
  return { inicio, fim, timeZone: TIME_ZONE }
}
