import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('app do barbeiro separa novo corte de encaixe e usa criação protegida', async () => {
  const dashboard = await readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8')
  const modal = await readFile(new URL('../src/components/AddAppointmentModal.jsx', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/lib/agenda/encaixe-api.js', import.meta.url), 'utf8')

  assert.match(dashboard, /> Novo corte</)
  assert.match(dashboard, /> Encaixe de hoje</)
  assert.match(dashboard, /mode="barber"/)
  assert.match(dashboard, /professionalId=\{context\?\.id\}/)
  assert.match(modal, /criarAgendamentoBarbeiro/)
  assert.match(modal, /O corte será confirmado na hora/)
  assert.match(api, /barbeiro_agendamento_criar/)
})
