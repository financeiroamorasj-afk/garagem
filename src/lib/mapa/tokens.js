// Espelho em JS dos tokens do mapa declarados em src/index.css (@theme) e
// documentados em docs/design-system/DESIGN-SYSTEM.md, seção 13 ("Mapa da
// barbearia"). O SVG do radar precisa das cores como valor literal
// (gradientes, stop-color), por isso elas existem aqui também. O teste
// tests/mapa-modelo.test.js garante que os dois lugares não divergem.

export const MAPA_CORES = {
  // paleta categórica dos núcleos
  cobre: '#c1793f',
  latao: '#c9a45c',
  patina: '#6f9a8d',
  oliva: '#9aa66a',
  aco: '#7f95a8',
  ameixa: '#a07c96',
  osso: '#cfc2a8',
  // estrutura do radar
  grade: '#2a2419',
  trilho: '#2b251b',
  trilhoForte: '#3d3629',
  faixa: '#110e0a',
  painel: '#0a0908',
  texto: '#e6dfd2',
  alertaSuave: '#e8998a',
  lancamentoSuave: '#e8c27a',
}

// Tokens do design system usados diretamente pelo radar (seção 1).
export const DS = {
  surface0: '#050505',
  surface2: '#17150f',
  copper: '#c1793f',
  warmWhite: '#f2ece0',
  steel: '#8b877d',
  danger: '#d4614a',
  warning: '#d9a03f',
  success: '#7ba05b',
}

export const ALERT = DS.danger
export const MICRO = DS.warning
export const ACCENT = DS.copper

// nome do token CSS de cada chave de MAPA_CORES (cobre → --color-mapa-cobre)
export function nomeTokenCss(chave) {
  return `--color-mapa-${chave.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}`
}
