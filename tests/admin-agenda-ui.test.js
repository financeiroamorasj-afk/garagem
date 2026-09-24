import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('agenda geral está conectada ao menu, à rota e aos contratos administrativos', async () => {
  const [app, layout, page, api, extraApi, migration, extraMigration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/agenda/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/agenda/extra-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923173000_agenda_geral_admin.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923183000_horarios_extras.sql', import.meta.url), 'utf8'),
  ])

  assert.match(app, /path="agenda" element={<AdminAgenda/)
  assert.match(layout, /Agenda.*\/admin\/agenda/s)
  assert.match(page, /Toda a equipe/)
  assert.match(page, /Todos os status/)
  assert.match(api, /admin_agenda_listar_periodo/)
  assert.match(page, /Buscar cliente/)
  assert.match(page, /Dia.*Semana.*Mês/s)
  assert.match(page, /Horário extra/)
  assert.match(page, /Novo corte/)
  assert.match(page, /Encaixe/)
  assert.match(page, /WalkInModal/)
  assert.match(page, /AddAppointmentModal/)
  assert.match(extraApi, /admin_horario_extra_criar/)
  assert.match(extraApi, /admin_horarios_extras_listar/)
  assert.match(migration, /get_my_role\(\).*NOT IN \('admin', 'master'\)/s)
  assert.match(migration, /GRANT EXECUTE.*authenticated/)
  assert.match(extraMigration, /CREATE TABLE IF NOT EXISTS public\.agenda_horarios_extras/)
  assert.match(extraMigration, /GRANT EXECUTE.*admin_horario_extra_criar/s)
})
