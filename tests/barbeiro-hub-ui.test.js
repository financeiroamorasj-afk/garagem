import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('perfil do barbeiro oferece hoje, semana, venda e resumo sem tabela larga', async () => {
  const source = await readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8')
  assert.match(source, /label: 'Hoje'/)
  assert.match(source, /label: 'Semana'/)
  assert.match(source, /label: 'Vender'/)
  assert.match(source, /label: 'Resumo'/)
  assert.match(source, /grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7/)
  assert.doesNotMatch(source, /<table/)
  assert.match(source, /Venda sem vínculo/)
})

test('admin possui cadastro separado para produtos e estoque', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const layout = await readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8')
  assert.match(app, /path="produtos"/)
  assert.match(layout, /Produtos e estoque/)
})
