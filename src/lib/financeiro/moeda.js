export function arredondarCentavos(valor) {
  const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(numero)) throw new TypeError('Valor monetário inválido')
  return Math.round((numero + Number.EPSILON) * 100) / 100
}

export function normalizarMoeda(valor) {
  const texto = String(valor ?? '').trim().replace(/\s/g, '')
  if (!texto) return 0
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto
  return arredondarCentavos(normalizado)
}

export function interpretarEntradaCentavos(valor, { allowNegative = false } = {}) {
  const texto = String(valor ?? '')
  if (texto === '') return null

  const algarismos = texto.replace(/\D/g, '')
  if (!algarismos) return null

  const centavos = Number(algarismos)
  if (!Number.isSafeInteger(centavos)) throw new RangeError('Valor monetário excede o limite seguro')

  const numero = centavos / 100
  if (!Number.isFinite(numero)) throw new TypeError('Valor monetário inválido')
  return allowNegative && texto.includes('-') && centavos !== 0 ? -numero : numero
}

export function formatarEntradaCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  const numero = arredondarCentavos(valor)
  if (!Number.isSafeInteger(Math.round(numero * 100))) throw new RangeError('Valor monetário excede o limite seguro')
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero)
}

export function formatarBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(arredondarCentavos(valor))
}
