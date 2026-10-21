import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('gestor vinculado alterna entre gestão e a mesma interface operacional do barbeiro', async () => {
  const [layout, dashboard, barbers, migration] = await Promise.all([
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminBarbers.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261021100000_gestor_profissional_painel_barbeiro.sql', import.meta.url), 'utf8'),
  ])

  assert.match(layout, /Meu atendimento/)
  assert.match(layout, /professionalOnly: true/)
  assert.match(layout, /get_my_profissional_id/)
  assert.match(barbers, /garagem:professional-access-changed/)
  assert.match(dashboard, />Gestão</)
  assert.match(dashboard, /navigate\('\/admin\/dashboard'\)/)
  assert.match(dashboard, /filter\(\(row\) => row\.profissional_id === nextContext\.id\)/)

  assert.match(migration, /barbeiro_agenda_contexto\(\)/)
  assert.match(migration, /barbeiro_agenda_listar_memoria\(date\)/)
  assert.match(migration, /barbeiro_agendamento_mudar_status\(uuid,text,text\)/)
  assert.match(migration, /barbeiro_checkout_concluir\(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid\)/)
  assert.match(migration, /NOT IN \(''admin'',''master'',''barbeiro''\)/)
})
