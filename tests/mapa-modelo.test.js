import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COLS, SECTORS, layoutSector, placeSectors } from '../src/lib/mapa/geometria.js'
import { microDoModelo, montarModelo, movimentoEnvelopeMicro } from '../src/lib/mapa/modelo.js'
import { MAPA_CORES, nomeTokenCss } from '../src/lib/mapa/tokens.js'

// 23/09/2026 12:00 em Brasília
const AGORA = new Date('2026-09-23T15:00:00Z')

function fixture() {
  return {
    resumo: {
      totais: { entradas: 1000, saidas: 400, resultado: 600 },
      contas: [
        { id: 'c1', nome: 'Sicredi', saldo_atual: 5000 },
        { id: 'c2', nome: 'Caixa', saldo_atual: -50 },
      ],
    },
    saldos: [{ conta_bancaria_id: 'c1', saldo_disponivel: -120 }],
    envelopes: [
      { id: 'e1', nome: 'Reserva', saldo_acumulado: 300, percentual_distribuicao: 10, ativa: true },
      { id: 'e2', nome: 'Antigo', saldo_acumulado: 90, percentual_distribuicao: null, ativa: false },
    ],
    titulosPagar: [
      { id: 't1', tipo: 'pagar', descricao: 'Aluguel', valor: 3000, status: 'pendente', data_evento: '2026-09-10', categoria: 'Aluguel', conta_bancaria: null },
      { id: 't2', tipo: 'pagar', descricao: 'Pomadas', valor: 200, status: 'pago', data_evento: '2026-09-05', data_liquidacao: '2026-09-05', categoria: 'Produtos', conta_bancaria: 'Sicredi' },
      { id: 't3', tipo: 'pagar', descricao: 'Avulso', valor: 50, status: 'pago', data_evento: '2026-09-06', data_liquidacao: '2026-09-06', categoria: null, conta_bancaria: 'Sicredi' },
      { id: 't4', tipo: 'pagar', descricao: 'Cancelado', valor: 999, status: 'cancelado', data_evento: '2026-09-06', categoria: 'Produtos' },
    ],
    titulosReceber: [],
    profissionais: [
      { id: 'p1', nome: 'João', ativo: true, comissao_percentual: 40 },
      { id: 'p2', nome: 'Pedro', ativo: true, comissao_percentual: null },
      { id: 'p3', nome: 'Inativo', ativo: false, comissao_percentual: 50 },
    ],
    agendamentos: [
      // concluídos no mês
      { id: 'a1', data_hora: '2026-09-15T13:00:00Z', status: 'concluido', valor_final: 100, profissional_id: 'p1', cliente_id: 'k1', clientes: { nome: 'Rafael' }, servicos: { nome: 'Corte', comissao_percentual: null } },
      { id: 'a2', data_hora: '2026-09-16T13:00:00Z', status: 'concluido', valor_final: 50, profissional_id: 'p1', cliente_id: 'k1', clientes: { nome: 'Rafael' }, servicos: { nome: 'Barba', comissao_percentual: 50 } },
      { id: 'a3', data_hora: '2026-09-17T13:00:00Z', status: 'concluido', valor_final: 80, profissional_id: 'p2', cliente_id: 'k2', clientes: { nome: 'André' }, servicos: { nome: 'Corte', comissao_percentual: null } },
      // cliente sumido: último corte há mais de 35 dias e nada marcado
      { id: 'a4', data_hora: '2026-07-20T13:00:00Z', status: 'concluido', valor_final: 60, profissional_id: 'p1', cliente_id: 'k3', clientes: { nome: 'Felipe' }, servicos: { nome: 'Corte' } },
      // cliente antigo, mas com horário marcado — não é sumido
      { id: 'a5', data_hora: '2026-07-10T13:00:00Z', status: 'concluido', valor_final: 60, profissional_id: 'p1', cliente_id: 'k4', clientes: { nome: 'Caio' }, servicos: { nome: 'Corte' } },
      { id: 'a6', data_hora: '2026-09-25T13:00:00Z', status: 'confirmado', valor_final: 60, profissional_id: 'p1', cliente_id: 'k4', clientes: { nome: 'Caio' }, servicos: { nome: 'Corte' } },
      // agenda: amanhã sem confirmação, passado sem fechar, cancelado ignorado
      { id: 'a7', data_hora: '2026-09-24T17:00:00Z', status: 'pendente', valor_final: 60, profissional_id: 'p2', cliente_id: null, cliente_nome_manual: 'Diego', servicos: { nome: 'Barba' } },
      { id: 'a8', data_hora: '2026-09-22T17:00:00Z', status: 'confirmado', valor_final: 60, profissional_id: 'p2', cliente_id: 'k2', clientes: { nome: 'André' }, servicos: { nome: 'Corte' } },
      { id: 'a9', data_hora: '2026-09-26T17:00:00Z', status: 'cancelado', valor_final: 60, profissional_id: 'p2', cliente_id: 'k2', clientes: { nome: 'André' }, servicos: { nome: 'Corte' } },
    ],
    erros: {},
  }
}

function porNome(modelo, setor, nome) {
  return modelo.sectors.find((s) => s.key === setor).items.find((i) => i.name === nome)
}

test('geometria: 7 núcleos com 18 colunas cada, igual ao Mapa da casa', () => {
  assert.equal(SECTORS.length, 7)
  assert.equal(COLS, 18)
  assert.deepEqual(layoutSector([]), [])
  const muitos = Array.from({ length: 30 }, (_, i) => ({ id: i, value: i, alert: i === 0 }))
  const [setor] = placeSectors({ contas: muitos })
  assert.equal(setor.items.length, COLS)
  assert.equal(setor.total, 30)
  assert.ok(setor.items.some((i) => i.id === 0), 'item com alerta nunca é cortado da fatia')
})

test('contas: saldo negativo e reservas acima do saldo viram alerta', () => {
  const m = montarModelo(fixture(), { agora: AGORA })
  assert.match(porNome(m, 'contas', 'Caixa').alertLabel, /Saldo negativo/)
  assert.match(porNome(m, 'contas', 'Sicredi').alertLabel, /Reservas dos envelopes/)
  assert.equal(m.stats.liquido, 4950)
  assert.equal(m.stats.cofres, 300, 'envelope inativo não entra no total')
})

test('categorias: soma despesas do mês, ignora cancelados e aponta vencidos e sem categoria', () => {
  const m = montarModelo(fixture(), { agora: AGORA })
  assert.equal(porNome(m, 'categorias', 'Produtos').value, 200)
  assert.match(porNome(m, 'categorias', 'Aluguel').alertLabel, /1 título vencido/)
  assert.match(porNome(m, 'categorias', 'Sem categoria').alertLabel, /fora da DRE/)
})

test('comissões: usa o percentual do serviço, cai no do profissional e avisa quando falta', () => {
  const m = montarModelo(fixture(), { agora: AGORA })
  // João: 100 × 40% (herda) + 50 × 50% (serviço) = 65
  assert.equal(porNome(m, 'comissoes', 'João').value, 65)
  assert.equal(porNome(m, 'comissoes', 'João').alert, false)
  assert.match(porNome(m, 'comissoes', 'Pedro').alertLabel, /1 atendimento sem percentual/)
  assert.equal(porNome(m, 'comissoes', 'Inativo'), undefined)
  assert.match(porNome(m, 'equipe', 'Pedro').alertLabel, /não configurado/)
})

test('clientes: sumido só quando passou do prazo e não tem horário marcado', () => {
  const m = montarModelo(fixture(), { agora: AGORA })
  assert.match(porNome(m, 'clientes', 'Felipe').alertLabel, /Sumido há 65 dias/)
  assert.equal(porNome(m, 'clientes', 'Caio').alert, false)
  assert.equal(porNome(m, 'clientes', 'Rafael').value, 150)
})

test('agenda: não confirmado amanhã, atendimento passado sem fechar e cancelado fora', () => {
  const m = montarModelo(fixture(), { agora: AGORA })
  const agenda = m.sectors.find((s) => s.key === 'agenda').items
  assert.ok(agenda.some((i) => i.name === 'Amanhã 14:00 · Diego' && i.alertLabel === 'Não confirmou presença'))
  assert.ok(agenda.some((i) => i.name === 'Ontem 14:00 · André' && i.alertLabel === 'Atendimento não fechado'))
  assert.equal(agenda.filter((i) => i.name.includes('André') && !i.alert).length, 0, 'cancelado não aparece')
})

test('fonte com erro marca só o núcleo dela como indisponível', () => {
  const f = fixture()
  f.agendamentos = []
  f.erros = { agenda: 'permissão negada' }
  const m = montarModelo(f, { agora: AGORA })
  const indisponiveis = m.sectors.filter((s) => s.indisponivel).map((s) => s.key)
  assert.deepEqual(indisponiveis.sort(), ['agenda', 'clientes', 'comissoes'])
})

test('micro-conexões: títulos liquidados da conta, atendimentos e movimentos de envelope', () => {
  const m = montarModelo(fixture(), { agora: AGORA })
  const conta = microDoModelo(porNome(m, 'contas', 'Sicredi'), m.ctx)
  assert.deepEqual(conta.map((x) => x.amount), [-50, -200])
  const comissao = microDoModelo(porNome(m, 'comissoes', 'João'), m.ctx)
  assert.deepEqual(comissao.map((x) => x.amount), [25, 40])
  const mov = movimentoEnvelopeMicro({ id: 'x', tipo: 'resgate', direcao: 'debito', valor: 30, saldo_depois: 70, data_brt: '2026-09-20' })
  assert.equal(mov.amount, -30)
  assert.equal(mov.name, 'Resgate')
})

test('tokens do mapa em JS batem com o @theme do index.css', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  for (const [chave, valor] of Object.entries(MAPA_CORES)) {
    const re = new RegExp(`${nomeTokenCss(chave)}:\\s*${valor}\\s*;`, 'i')
    assert.match(css, re, `${nomeTokenCss(chave)} deveria ser ${valor}`)
  }
})
