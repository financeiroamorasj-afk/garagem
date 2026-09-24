import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classificarEnvelope, mensagemErroEnvelope, podeAdicionarReserva } from '../src/lib/financeiro/envelopes-ui.js'
import { envelopeIntentKeyFor } from '../src/lib/financeiro/envelopeIntent.js'
import { exigirDataBrtNaoFutura, exigirPercentualOpcional } from '../src/lib/financeiro/schemas.js'
import { arredondarCentavos, interpretarEntradaCentavos } from '../src/lib/financeiro/moeda.js'

test('classifica estados dos envelopes sem inferir o saldo disponível', () => {
  assert.deepEqual(classificarEnvelope({ ativa: false, saldo_acumulado: 10 }, {}), { label: 'Inativo', variant: 'info' })
  assert.deepEqual(classificarEnvelope({ ativa: true, saldo_acumulado: 0 }, {}), { label: 'Sem saldo', variant: 'neutral' })
  assert.deepEqual(classificarEnvelope({ ativa: true, saldo_acumulado: 10 }, { saldo_bancario: 100, saldo_reservado: 80, saldo_disponivel: 20 }), { label: 'Atenção', variant: 'warning' })
  assert.deepEqual(classificarEnvelope({ ativa: true, saldo_acumulado: 10 }, { saldo_bancario: 100, saldo_reservado: 20, saldo_disponivel: 80 }), { label: 'Disponível', variant: 'success' })
})

test('tela usa apenas os wrappers de leitura e gestão autorizados', async () => {
  const api = await readFile(new URL('../src/lib/financeiro/api.js', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/financeiro/FinanceEnvelopes.jsx', import.meta.url), 'utf8')
  for (const rpc of ['financeiro_listar_envelopes', 'financeiro_saldos_disponiveis_contas', 'financeiro_listar_transacoes_envelope', 'financeiro_criar_envelope', 'financeiro_editar_envelope', 'financeiro_definir_envelope_ativo', 'financeiro_simular_distribuicao_diaria', 'financeiro_distribuir_envelopes_diario', 'financeiro_aportar_envelope']) assert.match(api, new RegExp(rpc))
  assert.doesNotMatch(page, /resgatarEnvelope|estornarResgate|\.from\s*\(/)
  assert.doesNotMatch(api, /financeiro_resgatar_envelope|financeiro_estornar_resgate/)
  assert.match(page, /Disponível após a implantação de lançamentos manuais a pagar\./)
})

test('aporte usa somente a RPC auditada com os quatro parâmetros exatos', async () => {
  const api = await readFile(new URL('../src/lib/financeiro/api.js', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/financeiro/FinanceEnvelopes.jsx', import.meta.url), 'utf8')
  const wrapper = api.match(/export function aportarEnvelope[\s\S]*?\r?\n}\r?\n/)?.[0] ?? ''
  assert.match(wrapper, /financeiro_aportar_envelope/)
  for (const parameter of ['p_envelope_id', 'p_valor', 'p_idempotency_key', 'p_correlation_id']) assert.match(wrapper, new RegExp(parameter))
  assert.doesNotMatch(wrapper, /barbearia|tenant|\.from\s*\(/i)
  assert.doesNotMatch(`${api}\n${page}`, /service_role|\.from\s*\(\s*['"]financeiro_/i)
})

test('botão de aporte só habilita para envelope ativo, conta carregada e saldo positivo', () => {
  assert.equal(podeAdicionarReserva({ ativa: true }, { saldo_disponivel: 10 }), true)
  assert.equal(podeAdicionarReserva({ ativa: false }, { saldo_disponivel: 10 }), false)
  assert.equal(podeAdicionarReserva({ ativa: true }, null), false)
  assert.equal(podeAdicionarReserva({ ativa: true }, { saldo_disponivel: 0 }), false)
  assert.equal(podeAdicionarReserva({ ativa: true }, { saldo_disponivel: -1 }), false)
})

test('retry preserva a intenção de aporte e fechar ou trocar de envelope a renova', async () => {
  let sequence = 0
  const uuid = () => `uuid-${++sequence}`
  const first = envelopeIntentKeyFor(null, 'aportar', 'env-1', uuid)
  assert.equal(envelopeIntentKeyFor(first, 'aportar', 'env-1', uuid), first)
  assert.notEqual(envelopeIntentKeyFor(null, 'aportar', 'env-1', uuid).key, first.key)
  assert.notEqual(envelopeIntentKeyFor(null, 'aportar', 'env-2', uuid).key, first.key)
  const page = await readFile(new URL('../src/pages/financeiro/FinanceEnvelopes.jsx', import.meta.url), 'utf8')
  assert.match(page, /function closeReserveModal\(\) \{\s*reserveIntentRef\.current = null/s)
  assert.match(page, /await aportarEnvelope\([\s\S]*?idempotencyKey: intent\.key[\s\S]*?correlationId: intent\.key/)
})

test('sucesso recarrega RPCs e extrato sem atualização aritmética local', async () => {
  const page = await readFile(new URL('../src/pages/financeiro/FinanceEnvelopes.jsx', import.meta.url), 'utf8')
  const currencyInput = await readFile(new URL('../src/components/ui/CurrencyInput.jsx', import.meta.url), 'utf8')
  const flow = page.match(/async function confirmReserve[\s\S]*?\r?\n {2}}\r?\n/)?.[0] ?? ''
  assert.match(flow, /await loadData\(\)/)
  assert.match(flow, /await loadStatement\(envelope, 1\)/)
  assert.doesNotMatch(flow, /setEnvelopes\(|setAccounts\(|saldo_acumulado\s*[+-]/)
  assert.match(page, /aporte_avulso' \? 'Reserva adicionada'/)
  assert.match(currencyInput, /500 = R\$ 5,00/)
  assert.equal(interpretarEntradaCentavos('500'), 5)
})

test('valor do aporte é arredondado e validado novamente depois dos centavos', async () => {
  const api = await readFile(new URL('../src/lib/financeiro/api.js', import.meta.url), 'utf8')
  const normalizer = api.match(/export function normalizarValorAporte[\s\S]*?\r?\n}\r?\n/)?.[0] ?? ''
  assert.match(normalizer, /arredondarCentavos\(exigirValorPositivo/)
  assert.match(normalizer, /return exigirValorPositivo\(valorValidado/)
  assert.equal(arredondarCentavos(1.005), 1.01)
  assert.equal(arredondarCentavos(0.004), 0)
})

test('intenção idempotente é reutilizada somente na mesma operação e alvo', () => {
  let sequence = 0
  const uuid = () => `uuid-${++sequence}`
  const first = envelopeIntentKeyFor(null, 'editar', 'env-1', uuid)
  assert.equal(envelopeIntentKeyFor(first, 'editar', 'env-1', uuid), first)
  assert.notEqual(envelopeIntentKeyFor(first, 'editar', 'env-2', uuid).key, first.key)
  assert.notEqual(envelopeIntentKeyFor(first, 'desativar', 'env-1', uuid).key, first.key)
})

test('cancelamento, mudança de data e nova simulação descartam a intenção de distribuição', async () => {
  const page = await readFile(new URL('../src/pages/financeiro/FinanceEnvelopes.jsx', import.meta.url), 'utf8')
  assert.match(page, /function closeDistribution\(\) \{\s*distributionIntentRef\.current = null/s)
  assert.match(page, /async function simulateDistribution\(\) \{[\s\S]*?distributionIntentRef\.current = null/)
  assert.match(page, /onChange=\{\(event\) => \{ distributionIntentRef\.current = null; setDistribution/)
  assert.match(page, /distributionIntentRef\.current = envelopeIntentKeyFor\(null, 'distribuir', distribution\.data\)/)
})

test('valida percentual opcional e impede data BRT futura', () => {
  assert.equal(exigirPercentualOpcional('12.345'), 12.35)
  assert.equal(exigirPercentualOpcional(''), null)
  assert.throws(() => exigirPercentualOpcional('101'))
  assert.equal(exigirDataBrtNaoFutura('2026-08-26', '2026-08-26'), '2026-08-26')
  assert.throws(() => exigirDataBrtNaoFutura('2026-08-27', '2026-08-26'))
})

test('mapeia conflito e indisponibilidade para orientações operacionais', () => {
  assert.equal(mensagemErroEnvelope({ message: 'FINANCEIRO_CONFLITO_VERSAO' }).conflict, true)
  assert.match(mensagemErroEnvelope({ message: 'FINANCEIRO_DISPONIBILIDADE_CONTA_VINCULADA_INSUFICIENTE' }).message, /Contas/)
})

test('mapeia os erros operacionais da gestão sem expor SQL', () => {
  const codes = [
    'FINANCEIRO_NOME_ATIVO_EM_USO',
    'FINANCEIRO_PERCENTUAL_TOTAL_EXCEDIDO',
    'FINANCEIRO_SEM_LUCRO_DISTRIBUIVEL',
    'FINANCEIRO_DISTRIBUICAO_JA_REALIZADA',
    'FINANCEIRO_ENVELOPE_COM_SALDO',
    'FINANCEIRO_CONTA_ENVELOPE_COM_SALDO',
    'FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE',
    'FINANCEIRO_ENVELOPE_INATIVO',
    'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO',
    'FINANCEIRO_VALOR_INVALIDO',
    'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE',
  ]
  for (const code of codes) {
    const mapped = mensagemErroEnvelope({ message: `SQLSTATE P0001: ${code}` })
    assert.notEqual(mapped.message, 'Não foi possível concluir a operação. Tente novamente.')
    assert.doesNotMatch(mapped.message, /SQLSTATE|P0001|FINANCEIRO_/)
  }
  assert.match(mensagemErroEnvelope({ code: '42501', message: 'permission denied' }).message, /permissão administrativa/)
})

test('rota e menu permanecem dentro da área administrativa', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const layout = await readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8')
  assert.match(app, /<Route path="financeiro\/envelopes" element={<FinanceEnvelopes \/>}/)
  assert.match(layout, /href: '\/admin\/financeiro\/envelopes'/)
})
