import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  acaoPrincipalAgenda,
  dataLocalKey,
  deslocarDataKey,
  deslocarVisualizacao,
  intervaloAgenda,
  mensagemErroAgenda,
  resumoAgenda,
  statusAgenda,
} from '../src/lib/agenda/ui.js'

test('agenda formata datas sem depender de UTC e atravessa meses', () => {
  assert.equal(dataLocalKey(new Date(2026, 8, 23, 23, 50)), '2026-09-23')
  assert.equal(deslocarDataKey('2026-09-30', 1), '2026-10-01')
  assert.equal(deslocarDataKey('2026-03-01', -1), '2026-02-28')
})

test('calendário calcula intervalos de dia, semana e mês', () => {
  assert.deepEqual(intervaloAgenda('2026-09-23', 'dia').days, ['2026-09-23'])
  assert.deepEqual(intervaloAgenda('2026-09-23', 'semana').days, [
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
  ])
  const month = intervaloAgenda('2026-09-23', 'mes')
  assert.equal(month.start, '2026-08-31')
  assert.equal(month.end, '2026-10-04')
  assert.equal(month.days.length, 35)
  assert.equal(deslocarVisualizacao('2026-09-23', 'mes', 1), '2026-10-01')
})

test('agenda oferece somente as ações válidas em cada estado', () => {
  assert.deepEqual(acaoPrincipalAgenda('pendente'), { label: 'Iniciar atendimento', nextStatus: 'em_atendimento' })
  assert.deepEqual(acaoPrincipalAgenda('em_atendimento'), { label: 'Concluir atendimento', nextStatus: 'concluido' })
  assert.equal(acaoPrincipalAgenda('concluido'), null)
  assert.equal(statusAgenda('cancelado').variant, 'danger')
})

test('resumo desconsidera cancelados e conta o andamento do dia', () => {
  const result = resumoAgenda([
    { status: 'pendente' },
    { status: 'em_atendimento' },
    { status: 'concluido' },
    { status: 'cancelado' },
  ])
  assert.deepEqual(result, { total: 3, restantes: 2, concluidos: 1 })
})

test('erros internos da agenda não vazam detalhes para a tela', () => {
  assert.match(mensagemErroAgenda({ message: 'AGENDA_STATUS_ALTERADO' }), /outro dispositivo/i)
  assert.doesNotMatch(mensagemErroAgenda({ message: 'SQL segredo interno' }), /segredo interno/i)
})

test('dashboard não mantém agenda fictícia e usa o contrato protegido', async () => {
  const dashboard = await readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/lib/agenda/api.js', import.meta.url), 'utf8')
  assert.doesNotMatch(dashboard, /MOCK_APPOINTMENTS/)
  assert.match(api, /barbeiro_agenda_listar/)
  assert.match(api, /barbeiro_agendamento_mudar_status/)
  assert.match(dashboard, /overflow-x-hidden/)
})
