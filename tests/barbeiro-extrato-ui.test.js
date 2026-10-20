import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { periodoExtrato, statusTempo, validarPeriodoExtrato } from '../src/lib/barbeiros/extrato.js'

test('calcula períodos móveis do extrato sem depender do fuso UTC', () => {
  assert.deepEqual(periodoExtrato(7, '2026-10-19'), { inicio: '2026-10-13', fim: '2026-10-19' })
  assert.deepEqual(periodoExtrato(30, '2026-03-01'), { inicio: '2026-01-31', fim: '2026-03-01' })
  assert.equal(validarPeriodoExtrato('2026-01-01', '2026-12-31'), true)
  assert.equal(validarPeriodoExtrato('2026-12-31', '2026-01-01'), false)
})

test('traduz alertas de tempo em estados gerenciais claros', () => {
  assert.equal(statusTempo('acima').variant, 'warning')
  assert.match(statusTempo('abaixo').label, /Abaixo/)
  assert.equal(statusTempo('no_padrao').variant, 'success')
  assert.match(statusTempo('desconhecido').label, /amostra/i)
})

test('menu de barbeiros abre extrato, ajusta duração e permite que o dono também atenda', async () => {
  const [page, modal, api, migration] = await Promise.all([
    readFile(new URL('../src/pages/AdminBarbers.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/BarberStatementModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/barbeiros/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261019130000_extrato_desempenho_barbeiro.sql', import.meta.url), 'utf8'),
  ])

  assert.match(page, /Ver extrato/)
  assert.match(page, /Eu também atendo/)
  assert.match(page, /setStatementBarber\(barber\)/)
  assert.match(modal, /TEMPO POR SERVIÇO/)
  assert.match(modal, /Ajustar duração/)
  assert.match(modal, /EXTRATO DO PERÍODO/)
  assert.match(api, /admin_barbeiro_extrato/)
  assert.match(api, /admin_servico_duracao_atualizar/)
  assert.match(api, /admin_vincular_como_profissional/)
  assert.match(migration, /a\.concluido_em-a\.iniciado_em/)
  assert.match(migration, /amostras_tempo<3/)
  assert.match(migration, /greatest\(5,round\(max\(a\.duracao_catalogo_atual\)\*0\.10\)\)/)
})
