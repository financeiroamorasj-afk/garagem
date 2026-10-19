import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { tempoAtendimento } from '../src/lib/agenda/ui.js'

test('admin tem só cinco atalhos na base e menu completo permanece no topo', async () => {
  const layout = await readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8')
  const nav = layout.match(/function MobileBottomNavigation\(\)[\s\S]*?export default function AdminLayout/)?.[0] ?? ''
  assert.match(layout, /aria-label="Abrir menu"/)
  assert.match(nav, /grid-cols-5/)
  assert.doesNotMatch(nav, /<span>Menu<\/span>/)
  assert.doesNotMatch(nav, /className="fixed/)
})

test('cabeçalho e atalhos administrativos respeitam as áreas seguras do iPhone', async () => {
  const layout = await readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8')
  assert.match(layout, /env\(safe-area-inset-top\)/)
  assert.match(layout, /env\(safe-area-inset-bottom\)-1rem/)
  assert.match(layout, /min-h-14/)
})

test('shells móveis mantêm navegação dentro do aplicativo e evitam zoom automático em campos', async () => {
  const [css, portal, barber] = await Promise.all([
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(css, /font-size: 16px !important/)
  assert.match(portal, /flex h-\[100dvh\].*flex-col overflow-hidden/)
  assert.doesNotMatch(portal, /fixed inset-x-0 bottom-0/)
  assert.match(barber, /function MobileSectionNavigation/)
  assert.doesNotMatch(barber, /fixed inset-x-0 bottom-0/)
})

test('contas usam cartões no celular e tabela apenas a partir de sm', async () => {
  const page = await readFile(new URL('../src/pages/financeiro/FinanceTitles.jsx', import.meta.url), 'utf8')
  assert.match(page, /space-y-3 sm:hidden/)
  assert.match(page, /<DataTable className="hidden sm:block"/)
})

test('dias passados da semana podem ser recolhidos e reabertos', async () => {
  const agenda = await readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8')
  assert.match(agenda, /days\.filter\(\(day\) => day >= today\)/)
  assert.match(agenda, /Ver dias anteriores desta semana/)
  assert.match(agenda, /Ocultar dias anteriores/)
})

test('tempo de atendimento usa timestamp de início real', () => {
  assert.equal(tempoAtendimento('2026-10-08T12:00:00Z', new Date('2026-10-08T12:01:05Z')), '00:01:05')
})

test('modo claro possui tokens próprios e troca persistida', async () => {
  const [css, toggle, theme] = await Promise.all([
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/ThemeToggle.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/theme.js', import.meta.url), 'utf8'),
  ])
  assert.match(css, /html\[data-theme='light'\]/)
  assert.match(toggle, /Ativar modo claro/)
  assert.match(theme, /window\.localStorage\.setItem/)
})

test('componentes compartilhados não forçam largura de desktop no celular', async () => {
  const [table, chart, modal, cutModal, finance, map] = await Promise.all([
    readFile(new URL('../src/components/ui/DataTable.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/FinancialChart.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/Modal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CutCompletionModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/financeiro/FinanceOverview.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/MapaBarbearia.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(table, /sm:hidden/)
  assert.match(table, /hidden w-full min-w-max border-collapse sm:table/)
  assert.match(chart, /min-w-0 flex-1/)
  assert.doesNotMatch(finance, /min-w-\[720px\]/)
  assert.match(modal, /grid-cols-1.*min-\[440px\]:grid-cols-2/)
  assert.match(modal, /overscroll-contain touch-pan-y/)
  assert.match(cutModal, /fullScreenMobile/)
  assert.match(cutModal, /min-\[440px\]:col-span-2/)
  assert.doesNotMatch(map, /'-m-6 h-\[calc\(100vh-4rem\)\]'/)
})

test('mapa usa paleta SVG reativa e contraste próprio no tema claro', async () => {
  const [css, map, tokens] = await Promise.all([
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/MapaBarbearia.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/mapa/tokens.js', import.meta.url), 'utf8'),
  ])
  assert.match(css, /html\[data-theme='light'\][\s\S]*--color-mapa-painel:/)
  assert.match(css, /html\[data-theme='light'\][\s\S]*--color-mapa-bg-centro:/)
  assert.match(tokens, /export const MAPA_SVG/)
  assert.match(map, /stopColor="var\(--color-mapa-bg-centro\)"/)
})
