export const DIRECOES_FINANCEIRAS = ['entrada', 'saida']
export const STATUS_PAGAR = ['pendente', 'pago', 'estornado', 'cancelado']
export const STATUS_RECEBER = ['previsto', 'liquidado', 'estornado', 'cancelado']
export const MOTIVOS_CREDITO = ['emissao', 'uso', 'estorno', 'ajuste', 'expiracao']

export function exigirUuid(valor, campo) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(valor))) throw new TypeError(`${campo} inválido`)
  return String(valor)
}

export function exigirChaveIdempotencia(valor) {
  const chave = String(valor ?? '').trim()
  if (chave.length < 8 || chave.length > 200) throw new TypeError('Chave de idempotência inválida')
  return chave
}

export function exigirValorPositivo(valor, campo = 'Valor') {
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0) throw new TypeError(`${campo} deve ser maior que zero`)
  return numero
}

export function exigirPeriodo(inicio, fim) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) throw new TypeError('Período inválido')
  const dias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) throw new RangeError('Período inválido')
  return { inicio, fim }
}

export function exigirPaginacao(pagina = 1, porPagina = 25) {
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(porPagina) || porPagina < 1 || porPagina > 100) throw new RangeError('Paginação inválida')
  return { pagina, porPagina }
}
