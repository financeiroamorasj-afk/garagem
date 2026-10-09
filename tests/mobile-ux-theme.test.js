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
