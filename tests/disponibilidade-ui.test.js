import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('jornada da equipe está roteada e cobre expediente, intervalo, folga e bloqueio', async () => {
  const [app, layout, page, api, migration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAvailability.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/disponibilidade/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923193000_disponibilidade_profissionais.sql', import.meta.url), 'utf8'),
  ])

  assert.match(app, /path="disponibilidade" element={<AdminAvailability/)
  assert.match(layout, /Disponibilidade.*\/admin\/disponibilidade/s)
  assert.match(page, /Semana padrão/)
  assert.match(page, /Possui intervalo/)
  assert.match(page, /Folgas e bloqueios pontuais/)
  assert.match(api, /admin_jornadas_salvar/)
  assert.match(api, /admin_bloqueio_criar/)
  assert.doesNotMatch(api, /\.from\(/)
  assert.match(migration, /profissionais_jornadas_expediente_check/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
})
