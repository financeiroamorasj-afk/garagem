import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Maximize, Minimize, Search, TriangleAlert } from 'lucide-react'
import IconeMapa from '../components/mapa/IconeMapa'
import { formatarBRL } from '../lib/financeiro/moeda'
import { carregarFontes, carregarMovimentosEnvelope } from '../lib/mapa/fontes'
import { MICRO_ACTION, MICRO_TITLE, dataCurta, dataLonga, microDoModelo, montarModelo, movimentoEnvelopeMicro } from '../lib/mapa/modelo'
import {
  COLS, EXTRA_ACCESS, MAX_MICRO, MICRO_STEP, R0, R_BAND_IN, R_BAND_OUT, R_CORE, R_HEX, R_LABEL, R_MICRO, ROW, ROWS, SECTORS, SECTOR_BY_KEY, VB,
  arcPath, colAngle, hexPoints, polar, radialText, ringPath, sectorPath,
} from '../lib/mapa/geometria'
import { ACCENT, ALERT, DS, MAPA_CORES, MICRO } from '../lib/mapa/tokens'

// Mapa da barbearia — radar do negócio. Portado do "Mapa da casa"
// (FinanceiroApp) com a identidade do Garagem. Detalhes da geometria em
// src/lib/mapa/geometria.js; dados em src/lib/mapa/fontes.js e modelo.js.

function normalize(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
function truncate(s, n) {
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s || ''
}

// ---- camadas estáticas do radar (memo: não re-renderizam no hover) ----------

const StaticFrame = memo(function StaticFrame() {
  const grid = []
  for (const s of SECTORS) {
    for (let c = 0; c < COLS; c++) {
      const a = colAngle(s, c)
      for (let r = 0; r < ROWS; r++) {
        const p = polar(R0 + r * ROW, a)
        grid.push(<circle key={`${s.key}-${c}-${r}`} cx={p.x} cy={p.y} r="1" />)
      }
    }
  }
  const coreDots = []
  for (let a = 0; a < 360; a += 4) {
    const p = polar(R_CORE, a)
    coreDots.push(<circle key={a} cx={p.x} cy={p.y} r="1.1" />)
  }
  const microMarks = []
  for (let a = -90 + 20; a < 270 - 15; a += 20) {
    const p = polar(R_MICRO, a)
    microMarks.push(<circle key={a} cx={p.x} cy={p.y} r="2.2" />)
  }
  const ticks = []
  for (let a = 0; a < 360; a += 3) {
    const major = a % 15 === 0
    const p0 = polar(R_HEX + 20, a)
    const p1 = polar(R_HEX + (major ? 29 : 24), a)
    ticks.push(<line key={a} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={major ? MAPA_CORES.trilhoForte : MAPA_CORES.trilho} strokeWidth={major ? 1 : 0.7} />)
  }
  const ringLabel = (id, r, text, color, opacity = 0.75) => (
    <g key={id}>
      <path id={id} d={arcPath(r, -90 - 40, -90 + 40)} fill="none" />
      <text fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="3" fill={color} fillOpacity={opacity}>
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
      </text>
    </g>
  )

  return (
    <g pointerEvents="none">
      <circle r={VB} fill="url(#mb-bg)" />
      <circle r="62" fill="none" stroke={MAPA_CORES.trilho} strokeDasharray="1 5" />
      <path d={ringPath(R_BAND_IN, R_BAND_OUT)} fill={MAPA_CORES.faixa} fillOpacity="0.7" fillRule="evenodd" />
      <circle r={R_BAND_IN} fill="none" stroke={MAPA_CORES.trilho} />
      <circle r={R_BAND_OUT} fill="none" stroke={MAPA_CORES.trilho} />
      {SECTORS.map((s) => {
        const p0 = polar(R_BAND_IN, s.start)
        const p1 = polar(R_BAND_OUT, s.start)
        return <line key={s.key} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={MAPA_CORES.trilho} />
      })}
      <g fill={MAPA_CORES.grade}>{grid}</g>
      <g fill={ACCENT} opacity="0.5">{coreDots}</g>
      <circle r={R_MICRO} fill="none" stroke={MICRO} strokeOpacity="0.3" strokeWidth="0.8" />
      <g fill="none" stroke={MICRO} strokeOpacity="0.3">{microMarks}</g>
      <circle r={R_HEX} fill="none" stroke={MAPA_CORES.trilhoForte} strokeOpacity="0.8" strokeWidth="0.8" />
      <circle r={R_HEX + 20} fill="none" stroke={MAPA_CORES.trilho} strokeWidth="0.6" />
      {ticks}
      {ringLabel('mb-arc-items', R_BAND_IN - 10, 'ITENS', DS.steel, 0.7)}
      {ringLabel('mb-arc-micro', R_MICRO + 6, 'LANÇAMENTOS', MICRO, 0.8)}
      {ringLabel('mb-arc-hex', R_HEX + 7, 'ACESSOS', DS.steel, 0.7)}
    </g>
  )
})

// ---- painel ------------------------------------------------------------------

function PanelTitle({ children }) {
  return <p className="px-4 pb-2 pt-4 text-label tracking-[0.25em] text-steel">{children}</p>
}

function Stat({ label, value, tone = 'text-warm-white' }) {
  return (
    <div className="min-w-0 bg-mapa-painel px-4 py-3">
      <p className="truncate text-label text-steel">{label}</p>
      <p className={`truncate text-data ${tone}`}>{value}</p>
    </div>
  )
}

function ItemRow({ item, active, showSector, onClick, onHover }) {
  const sector = SECTOR_BY_KEY[item.sector]
  const dot = item.alert ? ALERT : sector.color
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      className={`flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors duration-100 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper ${active ? 'bg-warm-white/6' : 'hover:bg-warm-white/4'}`}
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body text-warm-white">{item.name}</span>
          {showSector && <span className="ml-auto shrink-0 text-label" style={{ color: sector.color }}>{sector.label}</span>}
        </span>
        <span className="block truncate text-body-sm text-steel">{item.sub}</span>
        {item.alert && <span className="block truncate text-body-sm text-danger">{item.alertLabel}</span>}
      </span>
    </button>
  )
}

// ---- página ------------------------------------------------------------------

export default function MapaBarbearia() {
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const [fontes, setFontes] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [focus, setFocus] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedMicroId, setSelectedMicroId] = useState(null)
  const [hoverId, setHoverId] = useState(null)
  const [hoverMicroId, setHoverMicroId] = useState(null)
  const [micro, setMicro] = useState({ loading: false, items: [] })
  const [isFull, setIsFull] = useState(false)

  const carregar = useCallback(() => {
    setError('')
    carregarFontes()
      .then(setFontes)
      .catch((e) => setError(e?.message || 'Não foi possível carregar o mapa.'))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement && document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  const model = useMemo(() => (fontes ? montarModelo(fontes) : null), [fontes])
  const itemById = useMemo(() => new Map((model?.items || []).map((i) => [i.id, i])), [model])
  const focusSector = model && focus ? model.sectors.find((s) => s.key === focus) : null
  const selectedItem = selectedId ? itemById.get(selectedId) : null
  const problemsOnly = !!focusSector && focusSector.alerts > 0 && !showAll

  const query = normalize(search.trim())
  const hasQuery = query.length > 0
  const matchIds = useMemo(() => {
    if (!model || !hasQuery) return new Set()
    return new Set(model.items.filter((i) => normalize(i.name).includes(query)).map((i) => i.id))
  }, [model, hasQuery, query])

  // micro-conexões do item selecionado
  useEffect(() => {
    if (!selectedItem || !model) {
      setMicro({ loading: false, items: [] })
      return undefined
    }
    if (selectedItem.sector !== 'cofres') {
      setMicro({ loading: false, items: microDoModelo(selectedItem, model.ctx).slice(0, MAX_MICRO) })
      return undefined
    }
    let cancelled = false
    setMicro({ loading: true, items: [] })
    carregarMovimentosEnvelope(selectedItem.rawId)
      .then((rows) => !cancelled && setMicro({ loading: false, items: rows.map(movimentoEnvelopeMicro).slice(0, MAX_MICRO) }))
      .catch(() => !cancelled && setMicro({ loading: false, items: [] }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, model])

  // a linha do painel sob o mouse some ao trocar de nível sem disparar
  // mouseleave — limpa o hover para não deixar rótulo "preso" no radar.
  useEffect(() => {
    setHoverId(null)
    setHoverMicroId(null)
  }, [focus, selectedId, hasQuery])

  const microNodes = useMemo(() => {
    if (!selectedItem) return []
    const n = micro.items.length
    return micro.items.map((m, i) => ({ ...m, angle: selectedItem.angle + (i - (n - 1) / 2) * MICRO_STEP }))
  }, [micro.items, selectedItem])

  function focusOn(key, { toggle = false } = {}) {
    setFocus((prev) => (toggle && prev === key ? null : key))
    if (focus !== key) setShowAll(false)
    setSelectedId(null)
    setSelectedMicroId(null)
  }
  function selectItem(item) {
    if (focus !== item.sector) {
      setFocus(item.sector)
      setShowAll(false)
    }
    setSelectedId((prev) => (prev === item.id ? null : item.id))
    setSelectedMicroId(null)
  }
  function reset() {
    setFocus(null)
    setSelectedId(null)
    setSelectedMicroId(null)
    setShowAll(false)
  }
  function back() {
    if (selectedMicroId) setSelectedMicroId(null)
    else if (selectedId) setSelectedId(null)
    else if (focus) setFocus(null)
  }
  function go(route) {
    if (route) navigate(route)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || document.fullscreenElement) return
      if (e.target instanceof HTMLInputElement && search) {
        setSearch('')
        return
      }
      back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const frame = `flex flex-col bg-surface-0 text-warm-white ${isFull ? 'h-screen' : '-m-6 h-[calc(100vh-4rem)]'}`

  if (error) {
    return (
      <div className={`${frame} items-center justify-center gap-4`}>
        <p className="text-body text-danger">{error}</p>
        <button type="button" onClick={carregar} className="h-10 rounded-sm border border-copper px-5 text-body font-semibold text-copper hover:bg-copper/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">Tentar novamente</button>
      </div>
    )
  }
  if (!model) {
    return (
      <div className={`${frame} items-center justify-center`}>
        <p className="animate-pulse text-label tracking-[0.3em] text-copper">Carregando radar…</p>
      </div>
    )
  }

  function emphasis(item) {
    if (hasQuery) return matchIds.has(item.id) ? 1 : 0.1
    if (focus) {
      if (item.sector !== focus) return 0.16
      if (problemsOnly && !item.alert) return 0.12
      return 1
    }
    return 0.85
  }
  function sectorDim(s) {
    if (hasQuery) return s.items.some((i) => matchIds.has(i.id)) ? 1 : 0.25
    if (focus && focus !== s.key) return 0.35
    return 1
  }
  const labeledItems = model.items.filter((item) => {
    if (item.id === selectedId) return false
    if (item.id === hoverId) return true
    if (hasQuery) return matchIds.has(item.id)
    return focus === item.sector && (!problemsOnly || item.alert)
  })
  const sectorList = focusSector ? focusSector.items.filter((i) => !problemsOnly || i.alert) : []
  const microTitle = selectedItem ? MICRO_TITLE[selectedItem.sector](selectedItem) : null
  const { stats } = model

  return (
    <div ref={rootRef} className={frame}>
      {/* barra superior */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.35em] text-copper">PAINEL DO DONO · RADAR</p>
          <h1 className="text-h2 text-warm-white">Mapa da barbearia</h1>
        </div>

        <nav aria-label="Nível do mapa" className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
          <button type="button" onClick={reset} className={focus ? 'text-steel hover:text-copper' : 'text-copper'}>Barbearia</button>
          {focusSector && (
            <>
              <span className="text-mapa-trilho-forte">/</span>
              <button type="button" onClick={() => setSelectedId(null)} className={selectedItem ? 'text-steel hover:text-copper' : ''} style={selectedItem ? undefined : { color: focusSector.color }}>
                {focusSector.label}
              </button>
            </>
          )}
          {selectedItem && (
            <>
              <span className="text-mapa-trilho-forte">/</span>
              <span className="max-w-[14rem] truncate text-warm-white">{selectedItem.name}</span>
            </>
          )}
        </nav>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          {model.alerts.length > 0 && (
            <button type="button" onClick={reset} title="Ver tudo o que precisa de atenção" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm border border-danger/35 bg-danger/12 px-3 font-mono text-xs text-mapa-alerta-suave hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
              {model.alerts.length}
            </button>
          )}
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-steel" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no mapa…"
              aria-label="Buscar no mapa"
              className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 pl-9 pr-3 text-body text-warm-white placeholder:text-steel focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"
            />
          </div>
          <button type="button" onClick={toggleFullscreen} title={isFull ? 'Sair da tela cheia' : 'Tela cheia'} aria-label={isFull ? 'Sair da tela cheia' : 'Tela cheia'} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface-2 text-steel hover:border-copper hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
            {isFull ? <Minimize size={18} strokeWidth={1.75} aria-hidden="true" /> : <Maximize size={18} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* radar */}
        <div className="relative aspect-square w-full lg:aspect-auto lg:min-h-0 lg:flex-1">
          <svg viewBox={`${-VB} ${-VB} ${2 * VB} ${2 * VB}`} className="absolute inset-0 h-full w-full select-none" role="img" aria-label="Radar da barbearia: núcleos, itens e alertas">
            <defs>
              <radialGradient id="mb-bg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#211b12" stopOpacity="0.95" />
                <stop offset="55%" stopColor="#130f0a" stopOpacity="0.55" />
                <stop offset="100%" stopColor={DS.surface0} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="mb-hubglow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </radialGradient>
              <linearGradient id="mb-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0.12" />
              </linearGradient>
              <filter id="mb-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {SECTORS.map((s) => {
                const p = polar(R_CORE, s.center)
                return (
                  <linearGradient key={s.key} id={`mb-spoke-${s.key}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={p.x} y2={p.y}>
                    <stop offset="0%" stopColor={ACCENT} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0.9" />
                  </linearGradient>
                )
              })}
            </defs>

            <StaticFrame />

            {/* varredura do radar */}
            <g pointerEvents="none" className="motion-reduce:hidden">
              <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="16s" repeatCount="indefinite" />
              <path d={sectorPath(28, R_BAND_OUT, -90 - 30, -90)} fill="url(#mb-sweep)" />
              <line x1="0" y1="-28" x2="0" y2={-R_BAND_OUT} stroke={ACCENT} strokeOpacity="0.35" strokeWidth="0.8" />
            </g>

            {/* destaque da fatia em foco */}
            {focusSector && (
              <g pointerEvents="none">
                <path d={sectorPath(R_BAND_IN, R_BAND_OUT, focusSector.start + 0.6, focusSector.end - 0.6)} fill={focusSector.color} fillOpacity="0.07" />
                <path d={arcPath(R_BAND_OUT + 4, focusSector.start + 1.5, focusSector.end - 1.5)} fill="none" stroke={focusSector.color} strokeOpacity="0.75" strokeWidth="1.4" />
                <path d={arcPath(R_BAND_IN - 3, focusSector.start + 3, focusSector.end - 3)} fill="none" stroke={focusSector.color} strokeOpacity="0.45" strokeWidth="1" />
              </g>
            )}
            {/* fatias clicáveis (área invisível) */}
            {model.sectors.map((s) => (
              <path key={`wedge-${s.key}`} d={sectorPath(R_BAND_IN - 4, R_MICRO - 14, s.start + 0.8, s.end - 0.8)} fill="#000" fillOpacity="0" className="cursor-pointer" onClick={() => focusOn(s.key)} />
            ))}

            {/* raios centro → núcleo */}
            {model.sectors.map((s) => {
              const p0 = polar(27, s.center)
              const p1 = polar(R_CORE - 16, s.center)
              return <line key={`spoke-${s.key}`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={`url(#mb-spoke-${s.key})`} strokeWidth="1.1" opacity={sectorDim(s) * (focus === s.key ? 1 : 0.6)} pointerEvents="none" />
            })}

            {/* colunas de itens */}
            {model.sectors.map((s) => (
              <g key={`data-${s.key}`}>
                {s.items.map((item) => {
                  const em = emphasis(item)
                  const big = item.id === selectedId || item.id === hoverId
                  const color = item.alert ? ALERT : s.color
                  const dots = []
                  item.angles.forEach((a, ci) => {
                    for (let r = 0; r < item.len; r++) {
                      const p = polar(R0 + r * ROW, a)
                      dots.push(<circle key={`${ci}-${r}`} cx={p.x} cy={p.y} r={big ? 2.2 : 1.75} fillOpacity={1 - (r / ROWS) * 0.55} />)
                    }
                  })
                  const tip = polar(R0 + (item.len - 1) * ROW, item.angle)
                  return (
                    <g key={item.id} pointerEvents="none" opacity={em}>
                      <g fill={color} filter={big ? 'url(#mb-glow)' : undefined}>{dots}</g>
                      {item.alert && em > 0.5 && (
                        <circle cx={tip.x} cy={tip.y} r="3" fill="none" stroke={ALERT} strokeWidth="1" className="motion-reduce:hidden">
                          <animate attributeName="r" values="2.5;9;2.5" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="stroke-opacity" values="0.9;0;0.9" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  )
                })}
              </g>
            ))}

            {/* colchete do item selecionado */}
            {selectedItem && (
              <g pointerEvents="none" stroke={selectedItem.alert ? ALERT : SECTOR_BY_KEY[selectedItem.sector].color} fill="none" strokeWidth="1.6">
                <path d={arcPath(R0 - 6, selectedItem.a0 - 0.6, selectedItem.a1 + 0.6)} />
                <path d={arcPath(R_BAND_OUT + 1, selectedItem.a0 - 0.6, selectedItem.a1 + 0.6)} />
              </g>
            )}

            {/* áreas de clique/hover dos itens */}
            {model.items.map((item) => (
              <path
                key={`hit-${item.id}`}
                d={sectorPath(R0 - 5, R_LABEL + 74, item.a0, item.a1)}
                fill="#000"
                fillOpacity="0"
                className="cursor-pointer"
                onClick={() => selectItem(item)}
                onMouseEnter={() => setHoverId(item.id)}
                onMouseLeave={() => setHoverId((h) => (h === item.id ? null : h))}
              />
            ))}

            {/* rótulos radiais dos itens */}
            {labeledItems.map((item) => (
              <text key={`label-${item.id}`} {...radialText(R_LABEL, item.angle)} dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill={item.alert ? MAPA_CORES.alertaSuave : MAPA_CORES.texto} pointerEvents="none">
                {truncate(item.name, 14)}
              </text>
            ))}

            {/* micro-conexões do item selecionado */}
            {selectedItem && (microNodes.length > 0 || micro.loading) && (() => {
              const trunk0 = polar(R_BAND_OUT + 2, selectedItem.angle)
              const trunk1 = polar(R_MICRO - 12, selectedItem.angle)
              return <line x1={trunk0.x} y1={trunk0.y} x2={trunk1.x} y2={trunk1.y} stroke={MICRO} strokeOpacity="0.6" strokeWidth="0.9" pointerEvents="none" />
            })()}
            {selectedItem && micro.loading && (() => {
              const p = polar(R_MICRO, selectedItem.angle)
              return (
                <circle cx={p.x} cy={p.y} r="7" fill="none" stroke={MICRO} strokeWidth="1.4" strokeDasharray="4 4" pointerEvents="none">
                  <animateTransform attributeName="transform" type="rotate" from={`0 ${p.x} ${p.y}`} to={`360 ${p.x} ${p.y}`} dur="1s" repeatCount="indefinite" />
                </circle>
              )
            })()}
            {selectedItem && microNodes.map((m) => {
              const from = polar(R_MICRO - 12, selectedItem.angle)
              const p = polar(R_MICRO, m.angle)
              const active = m.id === selectedMicroId || m.id === hoverMicroId
              const stroke = m.alert ? ALERT : MICRO
              return (
                <g key={m.id}>
                  <line x1={from.x} y1={from.y} x2={p.x} y2={p.y} stroke={stroke} strokeOpacity="0.45" strokeWidth="0.7" pointerEvents="none" />
                  <g
                    className="cursor-pointer"
                    onClick={() => setSelectedMicroId((prev) => (prev === m.id ? null : m.id))}
                    onMouseEnter={() => setHoverMicroId(m.id)}
                    onMouseLeave={() => setHoverMicroId((h) => (h === m.id ? null : h))}
                  >
                    <circle cx={p.x} cy={p.y} r="11" fill="#000" fillOpacity="0" />
                    <circle cx={p.x} cy={p.y} r={active ? 6.5 : 5.2} fill={m.id === selectedMicroId ? stroke : DS.surface0} stroke={stroke} strokeWidth="1.3" filter={active ? 'url(#mb-glow)' : undefined} />
                  </g>
                  <text {...radialText(R_MICRO + 10, m.angle)} dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize="7.5" fill={active ? MAPA_CORES.lancamentoSuave : DS.steel} pointerEvents="none">
                    {dataCurta(m.date)}
                  </text>
                </g>
              )
            })}

            {/* núcleos */}
            {model.sectors.map((s) => {
              const p = polar(R_CORE, s.center)
              const focused = focus === s.key
              const cos = Math.cos((s.center * Math.PI) / 180)
              const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
              const base = polar(R_CORE + 19, s.center)
              const lp = { x: base.x + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0), y: base.y + (anchor === 'middle' ? 4 : 0) }
              let subText = `${s.total} ${s.total === 1 ? 'ITEM' : 'ITENS'}`
              if (s.indisponivel) subText = 'INDISPONÍVEL'
              else if (s.alerts) subText = `${s.alerts} ALERTA${s.alerts > 1 ? 'S' : ''}`
              return (
                <g key={`core-${s.key}`} opacity={sectorDim(s)} className="cursor-pointer" onClick={() => focusOn(s.key, { toggle: true })}>
                  {s.alerts > 0 && (
                    <circle cx={p.x} cy={p.y} r="14" fill="none" stroke={ALERT} strokeWidth="1.2" pointerEvents="none" className="motion-reduce:hidden">
                      <animate attributeName="r" values="14;25;14" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r="14" fill={focused ? s.color : DS.surface0} fillOpacity={focused ? 0.22 : 1} stroke={s.alerts > 0 ? ALERT : s.color} strokeWidth={focused ? 1.8 : 1.1} filter="url(#mb-glow)" />
                  <IconeMapa name={s.icon} x={p.x - 8} y={p.y - 8} size={16} color={s.color} strokeWidth={1.9} pointerEvents="none" />
                  <text x={lp.x} y={lp.y} textAnchor={anchor} fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.3" fill={DS.warmWhite}>
                    <tspan x={lp.x} dy={anchor === 'middle' ? 3 : -3}>{s.label.toUpperCase()}</tspan>
                    <tspan x={lp.x} dy="11" fontSize="8" fill={s.alerts || s.indisponivel ? MAPA_CORES.alertaSuave : DS.steel}>{subText}</tspan>
                  </text>
                </g>
              )
            })}

            {/* centro: a barbearia */}
            <g className="cursor-pointer" onClick={reset}>
              <circle r="58" fill="url(#mb-hubglow)" />
              <circle r="46" fill="none" stroke={ACCENT} strokeOpacity="0.45" strokeDasharray="1.5 4">
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="60s" repeatCount="indefinite" />
              </circle>
              <rect x="-20" y="-20" width="40" height="40" rx="4" fill={DS.surface2} stroke={ACCENT} strokeWidth="1.4" filter="url(#mb-glow)" />
              <IconeMapa name="barbearia" x={-11} y={-11} size={22} color={ACCENT} pointerEvents="none" />
              <text y="35" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="3" fill={MAPA_CORES.texto}>BARBEARIA</text>
            </g>

            {/* anel de acessos: atalhos em hexágonos */}
            {[
              ...SECTORS.map((s) => ({ key: s.key, label: s.label, route: s.route, icon: s.icon, color: s.color, angle: s.center })),
              ...EXTRA_ACCESS.map((x) => ({ ...x, color: DS.steel })),
            ].map((x) => {
              const p = polar(R_HEX, x.angle)
              const onClick = x.route ? () => go(x.route) : () => focusOn(x.key)
              return (
                <g key={`hex-${x.key}`} transform={`translate(${p.x} ${p.y})`} className="group cursor-pointer" onClick={onClick}>
                  <title>{x.route ? `Abrir ${x.label}` : x.label}</title>
                  <polygon points={hexPoints(15)} fill={DS.surface0} stroke={x.color} strokeOpacity="0.75" strokeWidth="1.1" />
                  <polygon points={hexPoints(15)} fill={x.color} fillOpacity="0" className="transition-[fill-opacity] duration-100 group-hover:[fill-opacity:0.18]" />
                  <IconeMapa name={x.icon} x={-8} y={-8} size={16} color={x.color} strokeWidth={1.9} pointerEvents="none" />
                </g>
              )
            })}
          </svg>

          <div className="pointer-events-none absolute left-4 top-3 hidden font-mono text-[11px] leading-4 tracking-wider sm:block">
            <p className="text-steel">▮ COMPRIMENTO = VALOR</p>
            <p className="text-danger">● VERMELHO = PRECISA DE ATENÇÃO</p>
          </div>
          <p className="pointer-events-none absolute bottom-3 left-4 hidden font-mono text-[11px] tracking-wider text-steel sm:block">
            CLIQUE NUM NÚCLEO OU ITEM · ESC VOLTA UM NÍVEL
          </p>
        </div>

        {/* painel de informações */}
        <aside className="shrink-0 border-t border-line bg-mapa-painel lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
            <Stat label="Saldo em contas" value={formatarBRL(stats.liquido)} tone={stats.liquido < 0 ? 'text-danger' : 'text-warm-white'} />
            <Stat label="Em cofres" value={formatarBRL(stats.cofres)} />
            <Stat label="Receitas do mês" value={formatarBRL(stats.receitas)} tone="text-success" />
            <Stat label="Despesas do mês" value={formatarBRL(stats.despesas)} tone="text-danger" />
          </div>

          {hasQuery ? (
            <>
              <PanelTitle>Resultados · {matchIds.size}</PanelTitle>
              {matchIds.size === 0 && <p className="px-4 pb-4 text-body text-steel">Nada encontrado no mapa.</p>}
              {model.items.filter((i) => matchIds.has(i.id)).map((item) => (
                <ItemRow key={item.id} item={item} showSector active={item.id === selectedId} onClick={() => selectItem(item)} onHover={setHoverId} />
              ))}
            </>
          ) : selectedItem ? (
            <div className="pb-4">
              <div className="px-4 pt-4">
                <button type="button" onClick={() => setSelectedId(null)} className="text-label tracking-[0.2em] text-steel hover:text-copper">
                  ← {SECTOR_BY_KEY[selectedItem.sector].label}
                </button>
                <p className="mt-2 text-h3 text-warm-white">{selectedItem.name}</p>
                <p className="text-body text-steel">{selectedItem.sub}</p>
                {selectedItem.alert && (
                  <p className="mt-1 flex items-center gap-1.5 text-body text-danger">
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                    {selectedItem.alertLabel}
                  </p>
                )}
                {selectedItem.route && (
                  <button type="button" onClick={() => go(selectedItem.route)} className="mt-3 text-body-sm font-semibold text-copper hover:text-copper-light">
                    Abrir {SECTOR_BY_KEY[selectedItem.sector].label} →
                  </button>
                )}
              </div>
              {microTitle && (
                <>
                  <PanelTitle>{microTitle}</PanelTitle>
                  {micro.loading && <p className="animate-pulse px-4 font-mono text-xs text-warning">carregando…</p>}
                  {!micro.loading && microNodes.length === 0 && <p className="px-4 text-body text-steel">Nada por aqui ainda.</p>}
                  {microNodes.map((m) => {
                    const open = m.id === selectedMicroId
                    return (
                      <div key={m.id} className={open ? 'bg-warm-white/5' : ''}>
                        <button
                          type="button"
                          onClick={() => setSelectedMicroId(open ? null : m.id)}
                          onMouseEnter={() => setHoverMicroId(m.id)}
                          onMouseLeave={() => setHoverMicroId(null)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left ${open ? '' : 'hover:bg-warm-white/4'} ${m.id === hoverMicroId && !open ? 'bg-warm-white/4' : ''}`}
                        >
                          <span className="w-10 shrink-0 text-data text-steel">{dataCurta(m.date)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body text-warm-white">{m.name}</span>
                            {m.sub && <span className="block truncate text-body-sm text-steel">{m.sub}</span>}
                          </span>
                          {m.amount != null && <span className={`text-data ${m.amount < 0 ? 'text-danger' : 'text-success'}`}>{formatarBRL(m.amount)}</span>}
                        </button>
                        {open && (
                          <div className="flex items-center gap-3 px-4 pb-3 pl-[4.25rem]">
                            <span className="text-body-sm text-steel">{dataLonga(m.date)}{m.alert ? ' · precisa de atenção' : ''}</span>
                            {m.route && (
                              <button type="button" onClick={() => go(m.route)} className="ml-auto text-body-sm font-semibold text-warning hover:brightness-[1.12]">
                                {MICRO_ACTION[m.kind]} →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          ) : focusSector ? (
            <div className="pb-4">
              <div className="flex items-center gap-3 px-4 pt-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border" style={{ borderColor: `${focusSector.color}66`, color: focusSector.color }}>
                  <IconeMapa name={focusSector.icon} size={18} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-h3 text-warm-white">{focusSector.label}</p>
                  <p className="text-body-sm text-steel">
                    {focusSector.total} {focusSector.total === 1 ? 'item' : 'itens'}
                    {focusSector.alerts > 0 && <span className="text-danger"> · {focusSector.alerts} com alerta</span>}
                  </p>
                </div>
                {focusSector.route && (
                  <button type="button" onClick={() => go(focusSector.route)} className="ml-auto whitespace-nowrap text-body-sm font-semibold text-copper hover:text-copper-light">
                    Abrir →
                  </button>
                )}
              </div>
              {focusSector.alerts > 0 && (
                <div className="mx-4 mt-3 inline-flex rounded-sm border border-line p-0.5 font-mono text-[11px] uppercase tracking-wider">
                  <button type="button" onClick={() => setShowAll(false)} className={`rounded-sm px-2.5 py-1 ${!showAll ? 'bg-danger/15 text-mapa-alerta-suave' : 'text-steel'}`}>Só problemas</button>
                  <button type="button" onClick={() => setShowAll(true)} className={`rounded-sm px-2.5 py-1 ${showAll ? 'bg-warm-white/10 text-warm-white' : 'text-steel'}`}>Todos</button>
                </div>
              )}
              <PanelTitle>{problemsOnly ? 'Precisa de atenção' : 'Itens'}</PanelTitle>
              {focusSector.indisponivel && <p className="px-4 pb-2 text-body text-danger">Não foi possível carregar os dados deste núcleo.</p>}
              {!focusSector.indisponivel && sectorList.length === 0 && <p className="px-4 text-body text-steel">Nenhum item neste núcleo ainda.</p>}
              {sectorList.map((item) => (
                <ItemRow key={item.id} item={item} active={item.id === hoverId} onClick={() => selectItem(item)} onHover={setHoverId} />
              ))}
            </div>
          ) : (
            <div className="pb-4">
              <PanelTitle>Precisa de atenção · {model.alerts.length}</PanelTitle>
              {model.alerts.length === 0 && <p className="px-4 text-body text-success">Tudo em dia por aqui.</p>}
              {model.alerts.map((item) => (
                <ItemRow key={item.id} item={item} showSector active={item.id === hoverId} onClick={() => selectItem(item)} onHover={setHoverId} />
              ))}
              <PanelTitle>Núcleos</PanelTitle>
              {model.sectors.map((s) => (
                <button key={s.key} type="button" onClick={() => focusOn(s.key)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-warm-white/4">
                  <span style={{ color: s.color }}><IconeMapa name={s.icon} size={16} strokeWidth={1.75} /></span>
                  <span className="text-body text-warm-white">{s.label}</span>
                  <span className="ml-auto text-data text-steel">{s.indisponivel ? '—' : s.total}</span>
                  {s.alerts > 0 && (
                    <span className="inline-flex items-center gap-1 text-data text-danger">
                      <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                      {s.alerts}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
