import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mensagemErroAgenda } from '../src/lib/agenda/ui.js'

test('agenda comunica a margem operacional e traduz conflito de horário', async () => {
  const [modal, migration] = await Promise.all([
    readFile(new URL('../src/components/AddAppointmentModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260929113000_agenda_margem_operacional.sql', import.meta.url), 'utf8'),
  ])

  assert.match(modal, /duração do serviço mais 5 minutos/)
  assert.match(mensagemErroAgenda({ message: 'AGENDA_HORARIO_OCUPADO' }), /margem de 5 minutos/i)
  assert.match(migration, /margem_minutos_snapshot/)
  assert.match(migration, /ocupacao_fim/)
  assert.match(migration, /v_duracao\+v_margem/)
  assert.match(migration, /a\.data_hora<NEW\.ocupacao_fim AND a\.ocupacao_fim>NEW\.data_hora/)
})
