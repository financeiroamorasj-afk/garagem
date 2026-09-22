export const DIRECOES_FINANCEIRAS = ['entrada', 'saida']
export const STATUS_PAGAR = ['pendente', 'pago', 'estornado', 'cancelado']
export const STATUS_RECEBER = ['previsto', 'liquidado', 'estornado', 'cancelado']
export const MOTIVOS_CREDITO = ['emissao', 'uso', 'estorno', 'ajuste', 'expiracao']
export const TIPOS_CONTA = ['corrente', 'poupanca', 'caixa', 'carteira_digital', 'cartao']
export const TIPOS_CATEGORIA = ['entrada', 'saida', 'ambos']
export const GRUPOS_DRE = ['receita_servicos', 'receita_produtos', 'cmv', 'despesa_fixa', 'despesa_variavel', 'despesa_financeira', 'pro_labore', 'impostos', 'outros']
export const FINALIDADES_ENVELOPE = ['reserva', 'reinvestimento', 'socios', 'impostos', 'outros']

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

export function exigirTexto(valor, campo, minimo = 2, maximo = 100) {
  const texto = String(valor ?? '').trim()
  if (texto.length < minimo || texto.length > maximo) throw new TypeError(`${campo} inválido`)
  return texto
}

export function textoOpcional(valor, campo, maximo = 100) {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  if (texto.length > maximo) throw new TypeError(`${campo} inválido`)
  return texto
}

export function exigirOpcao(valor, opcoes, campo) {
  if (!opcoes.includes(valor)) throw new TypeError(`${campo} inválido`)
  return valor
}

export function exigirValorMonetario(valor, campo = 'Valor') {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) throw new TypeError(`${campo} inválido`)
  return numero
}

export function exigirBooleano(valor, campo) {
  if (typeof valor !== 'boolean') throw new TypeError(`${campo} inválido`)
  return valor
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

export function exigirPercentualOpcional(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const percentual = Number(valor)
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) throw new TypeError('Percentual deve estar entre 0 e 100')
  return Math.round(percentual * 100) / 100
}

export function exigirDataBrtNaoFutura(valor, hojeBrt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor)) || String(valor) > String(hojeBrt)) throw new TypeError('Data BRT inválida')
  return String(valor)
}

export function exigirVersao(valor) {
  const versao = String(valor ?? '').trim()
  if (!versao || Number.isNaN(Date.parse(versao))) throw new TypeError('Versão inválida')
  return versao
}
