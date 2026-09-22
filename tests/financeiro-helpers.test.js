import test from 'node:test'
import assert from 'node:assert/strict'
import { arredondarCentavos, formatarEntradaCentavos, interpretarEntradaCentavos, normalizarMoeda } from '../src/lib/financeiro/moeda.js'
import { periodoMensalBrt } from '../src/lib/financeiro/periodo.js'
import { exigirChaveIdempotencia, exigirValorPositivo, exigirPeriodo, exigirPaginacao, exigirTexto, textoOpcional, exigirOpcao, exigirValorMonetario, exigirBooleano, TIPOS_CONTA, GRUPOS_DRE } from '../src/lib/financeiro/schemas.js'

test('normaliza e arredonda moeda sem acumular ponto flutuante', () => {
  assert.equal(normalizarMoeda('1.234,567'), 1234.57)
  assert.equal(arredondarCentavos(0.1 + 0.2), 0.3)
})

test('interpreta digitação monetária exclusivamente como centavos', () => {
  assert.equal(interpretarEntradaCentavos('500'), 5)
  assert.equal(interpretarEntradaCentavos('50000'), 500)
  assert.equal(interpretarEntradaCentavos('R$ 1.234,56'), 1234.56)
  assert.equal(interpretarEntradaCentavos('50'), 0.5)
  assert.equal(interpretarEntradaCentavos(''), null)
  assert.equal(interpretarEntradaCentavos('0'), 0)
})

test('controla sinal, formatação e limites seguros da entrada monetária', () => {
  assert.equal(interpretarEntradaCentavos('-500'), 5)
  assert.equal(interpretarEntradaCentavos('-500', { allowNegative: true }), -5)
  assert.equal(formatarEntradaCentavos(1234.56), '1.234,56')
  assert.equal(formatarEntradaCentavos(null), '')
  assert.throws(() => interpretarEntradaCentavos('9007199254740992'), /limite seguro/)
  assert.throws(() => formatarEntradaCentavos(Infinity), /inválido/)
})

test('não mantém implementação monetária legada', async () => {
  const { access, readFile } = await import('node:fs/promises')
  const { constants } = await import('node:fs')
  await assert.rejects(access(new URL('../src/components/CurrencyInput.jsx', import.meta.url), constants.F_OK))
  const consumers = [
    '../src/components/AddAppointmentModal.jsx',
    '../src/components/AdminAppointmentModal.jsx',
    '../src/components/QuickActionModal.jsx',
    '../src/components/ServiceProductModal.jsx',
    '../src/pages/financeiro/FinanceRegistrations.jsx',
  ]
  for (const consumer of consumers) {
    const source = await readFile(new URL(consumer, import.meta.url), 'utf8')
    assert.match(source, /ui\/CurrencyInput/)
  }
})

test('gera período mensal válido', () => {
  assert.deepEqual(periodoMensalBrt(2028, 2), { inicio: '2028-02-01', fim: '2028-02-29', timeZone: 'America/Sao_Paulo' })
})

test('exige chave de idempotência para movimentação de crédito', () => {
  assert.equal(exigirChaveIdempotencia('credito:123'), 'credito:123')
  assert.throws(() => exigirChaveIdempotencia(''), /idempotência inválida/)
})

test('rejeita valor de crédito zero ou negativo', () => {
  assert.equal(exigirValorPositivo('10.5', 'Valor do crédito'), 10.5)
  assert.throws(() => exigirValorPositivo(0, 'Valor do crédito'), /maior que zero/)
  assert.throws(() => exigirValorPositivo(-1, 'Valor do crédito'), /maior que zero/)
})

test('valida intervalo máximo de 366 dias inclusivos', () => {
  assert.deepEqual(exigirPeriodo('2028-01-01', '2028-12-31'), { inicio: '2028-01-01', fim: '2028-12-31' })
  assert.throws(() => exigirPeriodo('2028-01-02', '2028-01-01'), /Período inválido/)
  assert.throws(() => exigirPeriodo('2028-01-01', '2029-01-01'), /Período inválido/)
})

test('valida limites de paginação', () => {
  assert.deepEqual(exigirPaginacao(1, 100), { pagina: 1, porPagina: 100 })
  assert.throws(() => exigirPaginacao(0, 25), /Paginação inválida/)
  assert.throws(() => exigirPaginacao(1, 101), /Paginação inválida/)
})

test('transferência rejeita valor que arredonda para zero antes da RPC', () => {
  const valorValidado = arredondarCentavos(exigirValorPositivo(0.004, 'Valor da transferência'))
  assert.equal(valorValidado, 0)
  assert.throws(() => exigirValorPositivo(valorValidado, 'Valor da transferência'), /maior que zero/)
})

test('valida e normaliza campos dos cadastros financeiros', () => {
  assert.equal(exigirTexto('  Conta principal  ', 'Nome'), 'Conta principal')
  assert.equal(textoOpcional('   ', 'Instituição'), null)
  assert.equal(exigirOpcao('corrente', TIPOS_CONTA, 'Tipo'), 'corrente')
  assert.equal(exigirOpcao('despesa_fixa', GRUPOS_DRE, 'Grupo DRE'), 'despesa_fixa')
  assert.equal(exigirValorMonetario(-10.25, 'Saldo inicial'), -10.25)
  assert.throws(() => exigirTexto('x', 'Nome'), /Nome inválido/)
  assert.throws(() => exigirOpcao('inventado', TIPOS_CONTA, 'Tipo'), /Tipo inválido/)
  assert.throws(() => exigirValorMonetario(Number.POSITIVE_INFINITY, 'Saldo inicial'), /Saldo inicial inválido/)
  assert.equal(exigirBooleano(true, 'Incluir inativas'), true)
  assert.throws(() => exigirBooleano('true', 'Incluir inativas'), /Incluir inativas inválido/)
})
