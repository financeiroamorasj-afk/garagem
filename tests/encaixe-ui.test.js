import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('encaixe usa o motor de disponibilidade e está acessível ao dono e ao barbeiro', async () => {
  const [modal, api, adminAgenda, barberDashboard, migration, clientSearch] = await Promise.all([
    readFile(new URL('../src/components/WalkInModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/agenda/encaixe-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923200000_motor_encaixes.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ClientSearch.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(adminAgenda, /Encaixe/)
  assert.match(adminAgenda, /WalkInModal/)
  assert.match(barberDashboard, /Novo encaixe/)
  assert.match(barberDashboard, /WalkInModal/)
  assert.match(modal, /Próximos horários livres/)
  assert.match(modal, /Próximo horário da equipe/)
  assert.match(modal, /criarClienteRapido/)
  assert.match(api, /agenda_horarios_livres/)
  assert.match(api, /agenda_encaixe_criar/)
  assert.match(migration, /profissionais_bloqueios/)
  assert.match(migration, /agenda_horarios_extras/)
  assert.match(migration, /AGENDA_HORARIO_OCUPADO/)
  assert.match(clientSearch, /type="button"/)
})
