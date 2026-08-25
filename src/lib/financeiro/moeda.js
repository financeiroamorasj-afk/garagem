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

export function formatarBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(arredondarCentavos(valor))
}
