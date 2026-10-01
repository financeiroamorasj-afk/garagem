import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('catálogo operacional está roteado e usa somente os contratos protegidos', async () => {
  const [app, layout, page, api, migration, defaultsMigration, presets] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminCatalog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/catalogo/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923190000_catalogo_servicos_materiais.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261001120000_fotos_portal_e_materiais_padrao.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/catalogo/presets.js', import.meta.url), 'utf8'),
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
  assert.match(defaultsMigration, /barbearia_materiais_padrao_apos_criar/)
  assert.match(defaultsMigration, /Lâmina descartável/)
  assert.match(defaultsMigration, /Máquina de corte/)
  assert.match(defaultsMigration, /ON CONFLICT DO NOTHING/)
  assert.match(page, /MODELOS DE USO/)
  assert.match(page, /MATERIAL_USAGE_PRESETS/)
  assert.match(presets, /Corte \+ barba/)
  assert.match(presets, /Lavagem e finalização/)
})
