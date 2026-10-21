import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('cadastro e app do barbeiro expõem a gestão de disponibilidade por vínculo', async () => {
  const [barbers, dashboard, availability, api, routes] = await Promise.all([
    readFile(new URL('../src/pages/AdminBarbers.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberAvailability.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/disponibilidade/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(barbers, /tipo_vinculo/)
  assert.match(barbers, /responsavel_disponibilidade/)
  assert.match(barbers, /CLT começa sob controle da gestão/)
  assert.match(dashboard, /Minha disponibilidade/)
  assert.match(routes, /barber\/disponibilidade/)
  assert.match(availability, /Administrada pela barbearia/)
  assert.match(availability, /visibilitychange/)
  assert.match(availability, /pageshow/)
  assert.match(availability, /Atualizar permissão de disponibilidade/)
  assert.match(availability, /Nada será cancelado/)
  assert.match(api, /barbeiro_jornadas_salvar/)
  assert.match(api, /barbeiro_bloqueio_criar/)
})
