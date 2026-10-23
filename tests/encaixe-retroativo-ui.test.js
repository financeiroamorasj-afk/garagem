import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('encaixe retroativo é separado, limitado a dois dias anteriores e gravado como concluído com início e fim', async () => {
  const [modal, dashboard, api, baseMigration, windowMigration] = await Promise.all([
    readFile(new URL('../src/components/RetroactiveWalkInModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/agenda/encaixe-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261022100000_encaixe_retroativo_auditavel.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261023150000_encaixe_retroativo_dois_dias.sql', import.meta.url), 'utf8'),
  ])
  assert.match(dashboard, /Registrar já iniciado/)
  assert.match(dashboard, /Atendimento retroativo registrado com sucesso/)
  assert.match(modal, /Registrar atendimento/)
  assert.match(modal, /Data em que começou/)
  assert.match(modal, /Horário em que começou/)
  assert.match(modal, /Horário de término/)
  assert.match(modal, /min=\{dateDaysAgo\(2\)\}/)
  assert.match(modal, /hoje ou nos dois dias anteriores/)
  assert.match(api, /barbeiro_encaixe_retroativo_criar/)
  assert.match(api, /AGENDA_RETROATIVO_FORA_JANELA/)
  assert.match(api, /AGENDA_RETROATIVO_TERMINO_INVALIDO/)
  assert.match(baseMigration, /registro_retroativo boolean NOT NULL DEFAULT false/)
  assert.match(baseMigration, /retroativo_registrado_por/)
  assert.match(windowMigration, /v_data_inicio < v_hoje - 2/)
  assert.match(windowMigration, /v_data_inicio > v_hoje/)
  assert.match(windowMigration, /v_inicio > clock_timestamp\(\)/)
  assert.match(windowMigration, /v_fim <= v_inicio/)
  assert.match(windowMigration, /'status','concluido'/)
  assert.match(windowMigration, /auth\.uid\(\)/)
})
