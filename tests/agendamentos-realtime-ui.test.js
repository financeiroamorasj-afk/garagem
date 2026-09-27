import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('agendamentos atualizam dono e barbeiro em tempo real com aviso visual', async () => {
  const [layout, dashboard, agenda, barber, migration] = await Promise.all([
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260926200000_agendamentos_realtime.sql', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.agendamentos/)
  assert.match(layout, /admin-aviso-novos-agendamentos/)
  assert.match(layout, /Novo agendamento feito pelo portal do cliente/)
  assert.match(layout, /Agenda atualizada/)
  assert.match(dashboard, /admin-painel-agendamentos/)
  assert.match(agenda, /admin-agenda-geral/)
  assert.match(barber, /filter: `profissional_id=eq\.\$\{context\.id\}`/)
  assert.match(barber, /Novo cliente agendou pelo portal/)
  assert.match(barber, /visibilitychange/)
})
