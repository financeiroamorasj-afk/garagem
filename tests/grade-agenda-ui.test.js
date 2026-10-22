import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('gestor configura a grade da agenda em 15 ou 30 minutos', async () => {
  const [availability, api, migration] = await Promise.all([
    readFile(new URL('../src/pages/AdminAvailability.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/disponibilidade/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261021130000_grade_agenda_configuravel.sql', import.meta.url), 'utf8'),
  ])

  assert.match(availability, /Grade da agenda/)
  assert.match(availability, /De 30 em 30 minutos/)
  assert.match(availability, /De 15 em 15 minutos/)
  assert.match(api, /admin_grade_agenda_obter/)
  assert.match(api, /admin_grade_agenda_salvar/)
  assert.match(migration, /grade_agenda_minutos integer/)
  assert.match(migration, /SET DEFAULT 30/)
  assert.match(migration, /CHECK \(grade_agenda_minutos IN \(15,30\)\)/)
  assert.equal((migration.match(/make_interval\(mins=>v_grade\)/g) ?? []).length, 2)
})
