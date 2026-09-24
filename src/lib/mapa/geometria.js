// Geometria do Mapa da barbearia — radar em anéis concêntricos.
// Portado do "Mapa da casa" (FinanceiroApp/client/src/pages/Map.jsx): mesmas
// medidas, mesma lógica. Do centro pra fora:
//   1. BARBEARIA no centro;
//   2. anel de NÚCLEOS (Contas, Categorias, Cofres, Comissões, Equipe,
//      Clientes, Agenda), cada um dono de uma fatia do círculo;
//   3. faixa de ITENS — matriz polar de pontos: cada item é uma coluna dentro
//      da fatia do seu núcleo e o comprimento da coluna é o valor dele;
//   4. anel de LANÇAMENTOS — as micro-conexões do item selecionado;
//   5. anel de ACESSOS — atalhos para as telas, em hexágonos.

import { MAPA_CORES } from './tokens.js'

export const SECTOR_DEFS = [
  { key: 'contas', label: 'Contas', route: '/admin/financeiro', icon: 'contas', color: MAPA_CORES.cobre },
  { key: 'categorias', label: 'Categorias', route: '/admin/financeiro/cadastros', icon: 'categorias', color: MAPA_CORES.latao },
  { key: 'cofres', label: 'Cofres', route: '/admin/financeiro/envelopes', icon: 'cofres', color: MAPA_CORES.patina },
  { key: 'comissoes', label: 'Comissões', route: '/admin/barbeiros', icon: 'comissoes', color: MAPA_CORES.oliva },
  { key: 'equipe', label: 'Equipe', route: '/admin/barbeiros', icon: 'equipe', color: MAPA_CORES.aco },
  { key: 'clientes', label: 'Clientes', route: null, icon: 'clientes', color: MAPA_CORES.ameixa },
  { key: 'agenda', label: 'Agenda', route: '/reception/board', icon: 'agenda', color: MAPA_CORES.osso },
]

export const WEDGE = 360 / SECTOR_DEFS.length
export const SECTORS = SECTOR_DEFS.map((s, i) => ({
  ...s,
  start: -90 + i * WEDGE,
  center: -90 + (i + 0.5) * WEDGE,
  end: -90 + (i + 1) * WEDGE,
}))
export const SECTOR_BY_KEY = Object.fromEntries(SECTORS.map((s) => [s.key, s]))

// Telas que não são núcleos — ficam no anel de acessos, entre os núcleos.
export const EXTRA_ACCESS = [
  { key: 'inicio', label: 'Início', route: '/admin/dashboard', icon: 'inicio', angle: -90 + 1 * WEDGE },
  { key: 'titulos', label: 'Títulos', route: '/admin/financeiro/titulos', icon: 'titulos', angle: -90 + 3 * WEDGE },
  { key: 'configuracoes', label: 'Configurações', route: '/admin/configuracoes', icon: 'configuracoes', angle: -90 + 5 * WEDGE },
]

// medidas em unidades do viewBox
export const VB = 474
export const R_CORE = 96
export const R_BAND_IN = 184
export const R0 = 191
export const ROW = 6.5
export const ROWS = 15
export const R_BAND_OUT = R0 + (ROWS - 1) * ROW + 7
export const R_LABEL = R_BAND_OUT + 10
export const R_MICRO = 390
export const R_HEX = 442
export const GAP = 3
export const COL_STEP = 2.6
export const COLS = Math.floor((WEDGE - 2 * GAP) / COL_STEP) + 1
export const COL_SPAN = (COLS - 1) * COL_STEP
export const MICRO_STEP = 6
export const MAX_MICRO = 8

export function polar(r, deg) {
  const a = (deg * Math.PI) / 180
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}

export function colAngle(sector, col) {
  return sector.center - COL_SPAN / 2 + col * COL_STEP
}

export function arcPath(r, a0, a1) {
  const p0 = polar(r, a0)
  const p1 = polar(r, a1)
  return `M${p0.x} ${p0.y} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y}`
}

export function sectorPath(r0, r1, a0, a1) {
  const p0 = polar(r1, a0)
  const p1 = polar(r1, a1)
  const p2 = polar(r0, a1)
  const p3 = polar(r0, a0)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${p0.x} ${p0.y} A${r1} ${r1} 0 ${large} 1 ${p1.x} ${p1.y} L${p2.x} ${p2.y} A${r0} ${r0} 0 ${large} 0 ${p3.x} ${p3.y} Z`
}

export function ringPath(r0, r1) {
  return `M${r1} 0 A${r1} ${r1} 0 1 1 ${-r1} 0 A${r1} ${r1} 0 1 1 ${r1} 0 Z M${r0} 0 A${r0} ${r0} 0 1 0 ${-r0} 0 A${r0} ${r0} 0 1 0 ${r0} 0 Z`
}

export function hexPoints(r) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90)
    pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`)
  }
  return pts.join(' ')
}

// Texto radial (ao longo do raio), virado 180° na metade esquerda para nunca
// ficar de cabeça pra baixo.
export function radialText(r, deg) {
  const p = polar(r, deg)
  const a = ((deg % 360) + 360) % 360
  const flip = a > 90 && a < 270
  return { transform: `translate(${p.x} ${p.y}) rotate(${flip ? deg + 180 : deg})`, textAnchor: flip ? 'end' : 'start' }
}

// Distribui os itens de um núcleo nas colunas da fatia: poucos itens ganham
// colunas "grossas" (até 3), muitos ficam com uma coluna cada.
export function layoutSector(items) {
  const n = Math.min(items.length, COLS)
  if (!n) return []
  let width
  let gap
  if (2 * n - 1 <= COLS) {
    width = Math.max(1, Math.min(3, Math.floor((COLS + 1) / n) - 1))
    gap = 1
  } else {
    width = 1
    gap = 0
  }
  const used = n * width + (n - 1) * gap
  const offset = Math.floor((COLS - used) / 2)
  return items.slice(0, n).map((item, i) => ({
    item,
    cols: Array.from({ length: width }, (_, k) => offset + i * (width + gap) + k),
  }))
}

// Posiciona os itens de cada núcleo: ângulos das colunas, comprimento (raiz do
// valor relativo, pra um item não dominar a fatia) e bordas da área de clique.
export function placeSectors(groups) {
  return SECTORS.map((s) => {
    const all = groups[s.key] || []
    let items = all
    if (items.length > COLS) {
      const alerts = items.filter((i) => i.alert)
      const rest = items.filter((i) => !i.alert).sort((a, b) => b.value - a.value)
      items = [...alerts, ...rest].slice(0, COLS)
    }
    items = [...items].sort((a, b) => b.value - a.value)
    const maxVal = Math.max(0, ...items.map((i) => i.value)) || 1
    const placed = layoutSector(items).map(({ item, cols }) => {
      const angles = cols.map((c) => colAngle(s, c))
      const len = 2 + Math.round(Math.sqrt(Math.max(item.value, 0) / maxVal) * (ROWS - 2))
      return {
        ...item,
        sector: s.key,
        route: item.route ?? s.route,
        angles,
        len,
        angle: angles.reduce((sum, a) => sum + a, 0) / angles.length,
        a0: angles[0] - COL_STEP / 2,
        a1: angles[angles.length - 1] + COL_STEP / 2,
      }
    })
    return { ...s, items: placed, total: all.length, alerts: all.filter((i) => i.alert).length }
  })
}
