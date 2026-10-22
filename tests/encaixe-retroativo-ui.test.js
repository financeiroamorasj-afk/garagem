import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('encaixe retroativo é separado, limitado ao dia e auditável', async () => {
  const [modal, dashboard, api, migration] = await Promise.all([
    readFile(new URL('../src/components/RetroactiveWalkInModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/agenda/encaixe-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261022100000_encaixe_retroativo_auditavel.sql', import.meta.url), 'utf8'),
  ])
  assert.match(dashboard, /Registrar já iniciado/)
  assert.match(dashboard, /Retroativo/)
  assert.match(modal, /Continuar para o fechamento/)
  assert.match(api, /barbeiro_encaixe_retroativo_criar/)
  assert.match(migration, /registro_retroativo boolean NOT NULL DEFAULT false/)
  assert.match(migration, /retroativo_registrado_por/)
  assert.match(migration, /AT TIME ZONE v_fuso\)::date<>v_hoje/)
  assert.match(migration, /auth\.uid\(\)/)
})
