import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('catálogo operacional está roteado e usa somente os contratos protegidos', async () => {
  const [app, layout, page, api, migration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminCatalog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/catalogo/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923190000_catalogo_servicos_materiais.sql', import.meta.url), 'utf8'),
  ])

  assert.match(app, /path="catalogo" element={<AdminCatalog/)
  assert.match(layout, /Serviços e materiais.*\/admin\/catalogo/s)
  assert.match(page, /Duração \(minutos\)/)
  assert.match(page, /Materiais utilizados/)
  assert.match(page, /Insumo consumível/)
  assert.match(api, /servicos_catalogo_listar/)
  assert.match(api, /servico_catalogo_criar/)
  assert.doesNotMatch(api, /\.from\(/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /CATALOGO_CONFLITO_VERSAO/)
})
