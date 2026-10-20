import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mensagemErroAgenda } from '../src/lib/agenda/ui.js'

test('agenda usa o intervalo configurado e oferece somente horários da disponibilidade', async () => {
  const [modal, availability, api, migration, availabilityMigration, configurableMigration] = await Promise.all([
    readFile(new URL('../src/components/AddAppointmentModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAvailability.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/disponibilidade/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260929113000_agenda_margem_operacional.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261019160000_disponibilidade_agendamentos_consistente.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261020120000_intervalo_configuravel_atendimentos.sql', import.meta.url), 'utf8'),
  ])

  assert.match(modal, /intervalo definido pela gestão/)
  assert.match(modal, /listarHorariosLivres/)
  assert.match(modal, /Jornada, intervalo, bloqueios e atendimentos existentes foram considerados/)
  assert.doesNotMatch(modal, /type="time"/)
  assert.match(availability, /Intervalo entre atendimentos/)
  assert.match(availability, /min="0" max="60" step="1"/)
  assert.match(api, /admin_intervalo_atendimentos_salvar/)
  assert.match(mensagemErroAgenda({ message: 'AGENDA_HORARIO_OCUPADO' }), /intervalo configurado/i)
  assert.match(mensagemErroAgenda({ message: 'AGENDA_FORA_DISPONIBILIDADE' }), /fora da jornada/i)
  assert.match(migration, /margem_minutos_snapshot/)
  assert.match(migration, /ocupacao_fim/)
  assert.match(migration, /v_duracao\+v_margem/)
  assert.match(migration, /a\.data_hora<NEW\.ocupacao_fim AND a\.ocupacao_fim>NEW\.data_hora/)
  assert.match(availabilityMigration, /agenda_horario_respeita_disponibilidade/)
  assert.match(availabilityMigration, /intervalo_inicio/)
  assert.match(availabilityMigration, /profissionais_bloqueios/)
  assert.match(configurableMigration, /intervalo_atendimentos_minutos/)
  assert.match(configurableMigration, /INTO v_fuso,v_margem/)
})
