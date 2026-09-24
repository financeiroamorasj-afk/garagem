// Modelo do Mapa da barbearia: transforma os dados já expostos pelo app
// (RPCs do financeiro + tabelas de agenda/equipe via RLS) em núcleos, itens e
// alertas. Função pura — sem rede, sem React — para ser testável em Node.

import { formatarBRL } from '../financeiro/moeda.js'
import { placeSectors } from './geometria.js'

const TIME_ZONE = 'America/Sao_Paulo'
const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false })
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export const DIAS_CLIENTE_SUMIDO = 35
const STATUS_ABERTOS = ['pendente', 'confirmado', 'encaixe']

export function dataBrt(data) {
  return fmtData.format(data)
}
export function horaBrt(data) {
  return fmtHora.format(data)
}
export function diasEntre(deISO, ateISO) {
  return Math.round((Date.parse(`${ateISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / 86400000)
}
export function dataCurta(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''
}
export function dataLonga(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''
}
function rotuloDia(iso, hojeISO) {
  const d = diasEntre(hojeISO, iso)
  if (d === 0) return 'Hoje'
  if (d === 1) return 'Amanhã'
  if (d === -1) return 'Ontem'
  if (d > 1 && d < 7) return DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()]
  return dataCurta(iso)
}
function brl(valor) {
  return formatarBRL(Number(valor) || 0)
}
function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`
}
function push(map, key, value) {
  if (key == null) return
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

// ---- financeiro -------------------------------------------------------------

function grupoContas(resumo, saldos) {
  const disponivel = new Map((saldos || []).map((s) => [s.conta_bancaria_id, Number(s.saldo_disponivel)]))
  return (resumo?.contas || []).map((c) => {
    const saldo = Number(c.saldo_atual) || 0
    const disp = disponivel.get(c.id)
    let alertLabel = ''
    if (saldo < 0) alertLabel = `Saldo negativo de ${brl(saldo)}`
    else if (disp != null && disp < 0) alertLabel = `Reservas dos envelopes passam o saldo em ${brl(-disp)}`
    return {
      id: `contas-${c.id}`, rawId: c.id, name: c.nome, value: Math.abs(saldo),
      sub: `Saldo ${brl(saldo)}`, alert: !!alertLabel, alertLabel,
    }
  })
}

const SEM_CATEGORIA = 'Sem categoria'

function grupoCategorias(titulosPagar, hoje) {
  const porCategoria = new Map()
  for (const t of titulosPagar) {
    if (t.status === 'cancelado') continue
    push(porCategoria, t.categoria || SEM_CATEGORIA, t)
  }
  return [...porCategoria.entries()].map(([nome, titulos]) => {
    const total = titulos.reduce((s, t) => s + Number(t.valor || 0), 0)
    const vencidos = titulos.filter((t) => t.status === 'pendente' && t.data_evento < hoje)
    let alertLabel = ''
    if (vencidos.length) alertLabel = `${plural(vencidos.length, 'título vencido', 'títulos vencidos')} · ${brl(vencidos.reduce((s, t) => s + Number(t.valor || 0), 0))}`
    else if (nome === SEM_CATEGORIA) alertLabel = 'Despesas sem categoria ficam fora da DRE'
    return {
      id: `categorias-${nome}`, rawId: nome, name: nome, value: total,
      sub: `${brl(total)} em despesas no mês`, alert: !!alertLabel, alertLabel,
    }
  })
}

function grupoCofres(envelopes) {
  return (envelopes || []).filter((e) => e.ativa !== false).map((e) => {
    const saldo = Number(e.saldo_acumulado) || 0
    const pct = e.percentual_distribuicao == null ? null : Number(e.percentual_distribuicao)
    return {
      id: `cofres-${e.id}`, rawId: e.id, name: e.nome, value: saldo,
      sub: `${brl(saldo)} · ${pct ? `${pct}% do lucro diário` : 'sem distribuição automática'}`,
      alert: false, alertLabel: '',
    }
  })
}

// ---- operação (agenda, equipe, clientes) -----------------------------------

function normalizarAgendamentos(agendamentos, profissionais) {
  const profPorId = new Map((profissionais || []).map((p) => [p.id, p]))
  return (agendamentos || []).map((a) => {
    const quando = new Date(a.data_hora)
    const prof = profPorId.get(a.profissional_id)
    return {
      id: a.id,
      quando,
      dia: dataBrt(quando),
      hora: horaBrt(quando),
      status: a.status || 'pendente',
      valor: Number(a.valor_final) || 0,
      profissionalId: a.profissional_id,
      profissional: prof?.nome || 'Sem barbeiro',
      clienteChave: a.cliente_id || (a.cliente_nome_manual ? `manual:${a.cliente_nome_manual}` : null),
      cliente: a.clientes?.nome || a.cliente_nome_manual || 'Cliente avulso',
      servico: a.servicos?.nome || 'Serviço',
      pctComissao: a.servicos?.comissao_percentual ?? prof?.comissao_percentual ?? null,
    }
  })
}

function grupoEquipeEComissoes(ags, profissionais, mes) {
  const concluidosMes = new Map()
  for (const a of ags) if (a.status === 'concluido' && a.dia.startsWith(mes)) push(concluidosMes, a.profissionalId, a)
  const ativos = (profissionais || []).filter((p) => p.ativo !== false)

  const equipe = ativos.map((p) => {
    const lista = concluidosMes.get(p.id) || []
    const soma = lista.reduce((s, a) => s + a.valor, 0)
    const alertLabel = p.comissao_percentual == null ? 'Percentual de comissão não configurado' : ''
    return {
      id: `equipe-${p.id}`, rawId: p.id, name: p.nome, value: lista.length,
      sub: lista.length ? `${plural(lista.length, 'atendimento', 'atendimentos')} no mês · ticket ${brl(soma / lista.length)}` : 'Nenhum atendimento concluído no mês',
      alert: !!alertLabel, alertLabel,
    }
  })

  const comissoes = ativos.map((p) => {
    const lista = concluidosMes.get(p.id) || []
    let total = 0
    let semPct = 0
    for (const a of lista) {
      if (a.pctComissao == null) semPct++
      else total += (a.valor * Number(a.pctComissao)) / 100
    }
    const alertLabel = semPct ? `${plural(semPct, 'atendimento', 'atendimentos')} sem percentual de comissão` : ''
    return {
      id: `comissoes-${p.id}`, rawId: p.id, name: p.nome, value: total,
      sub: lista.length ? `${brl(total)} estimados no mês` : 'Sem comissão no mês',
      alert: !!alertLabel, alertLabel,
    }
  })

  return { equipe, comissoes }
}

function grupoClientes(ags, hoje, agora) {
  const porCliente = new Map()
  for (const a of ags) push(porCliente, a.clienteChave, a)
  const mes = hoje.slice(0, 7)
  const itens = []
  for (const [chave, lista] of porCliente.entries()) {
    const concluidos = lista.filter((a) => a.status === 'concluido')
    if (!concluidos.length) continue
    const ultimo = concluidos.reduce((m, a) => (a.dia > m ? a.dia : m), concluidos[0].dia)
    const doMes = concluidos.filter((a) => a.dia.startsWith(mes))
    const gasto = doMes.reduce((s, a) => s + a.valor, 0)
    const temFuturo = lista.some((a) => a.quando >= agora && STATUS_ABERTOS.includes(a.status))
    const dias = diasEntre(ultimo, hoje)
    const alertLabel = dias > DIAS_CLIENTE_SUMIDO && !temFuturo ? `Sumido há ${dias} dias` : ''
    itens.push({
      id: `clientes-${chave}`, rawId: chave, name: lista[0].cliente, value: gasto,
      sub: gasto > 0 ? `Gastou ${brl(gasto)} no mês · ${plural(doMes.length, 'visita', 'visitas')}` : `Último corte em ${dataCurta(ultimo)}`,
      alert: !!alertLabel, alertLabel,
    })
  }
  return itens
}

function grupoAgenda(ags, hoje, agora) {
  const itens = []
  for (const a of ags) {
    if (!STATUS_ABERTOS.includes(a.status)) continue
    const dias = diasEntre(hoje, a.dia)
    let alertLabel = ''
    let value
    if (a.quando < agora) {
      if (dias < -21) continue
      alertLabel = 'Atendimento não fechado'
      value = 1
    } else {
      if (dias > 14) continue
      if (a.status === 'pendente' && dias <= 1) alertLabel = 'Não confirmou presença'
      value = Math.max(0.15, 1 - dias / 15)
    }
    itens.push({
      id: `agenda-${a.id}`, rawId: a.id, name: `${rotuloDia(a.dia, hoje)} ${a.hora} · ${a.cliente}`, value,
      sub: `${a.servico} · ${a.profissional}`, alert: !!alertLabel, alertLabel,
    })
  }
  return itens
}

// ---- montagem ------------------------------------------------------------------

export function montarModelo(fontes, { agora = new Date() } = {}) {
  const hoje = dataBrt(agora)
  const mes = hoje.slice(0, 7)
  const erros = fontes.erros || {}
  const titulosPagar = fontes.titulosPagar || []
  const titulosReceber = fontes.titulosReceber || []
  const ags = normalizarAgendamentos(fontes.agendamentos, fontes.profissionais)
  const { equipe, comissoes } = grupoEquipeEComissoes(ags, fontes.profissionais, mes)

  const groups = {
    contas: grupoContas(fontes.resumo, fontes.saldos),
    categorias: grupoCategorias(titulosPagar, hoje),
    cofres: grupoCofres(fontes.envelopes),
    comissoes,
    equipe,
    clientes: grupoClientes(ags, hoje, agora),
    agenda: grupoAgenda(ags, hoje, agora),
  }

  const indisponivel = {
    contas: !!erros.resumo,
    categorias: !!erros.titulos,
    cofres: !!erros.envelopes,
    comissoes: !!erros.agenda || !!erros.profissionais,
    equipe: !!erros.profissionais,
    clientes: !!erros.agenda,
    agenda: !!erros.agenda,
  }

  const sectors = placeSectors(groups).map((s) => ({ ...s, indisponivel: indisponivel[s.key] }))
  const items = sectors.flatMap((s) => s.items)

  const contas = fontes.resumo?.contas || []
  const stats = {
    liquido: contas.reduce((s, c) => s + (Number(c.saldo_atual) || 0), 0),
    cofres: (fontes.envelopes || []).filter((e) => e.ativa !== false).reduce((s, e) => s + (Number(e.saldo_acumulado) || 0), 0),
    receitas: Number(fontes.resumo?.totais?.entradas) || 0,
    despesas: Number(fontes.resumo?.totais?.saidas) || 0,
  }

  const atendimentosPorProf = new Map()
  const visitasPorCliente = new Map()
  for (const a of [...ags].sort((x, y) => y.quando - x.quando)) {
    if (a.status !== 'concluido') continue
    push(atendimentosPorProf, a.profissionalId, a)
    push(visitasPorCliente, a.clienteChave, a)
  }

  return {
    hoje,
    sectors,
    items,
    alerts: items.filter((i) => i.alert),
    stats,
    ctx: { titulos: [...titulosPagar, ...titulosReceber], atendimentosPorProf, visitasPorCliente, hoje, mes },
  }
}

// ---- micro-conexões (3º nível) ----------------------------------------------

function tituloMicro(t, hoje) {
  const saida = t.tipo === 'pagar'
  const data = t.data_liquidacao || t.data_evento
  const vencido = (t.status === 'pendente' || t.status === 'previsto') && t.data_evento < hoje
  return {
    id: `titulo-${t.tipo}-${t.id}`, kind: 'titulo', name: t.descricao, date: data,
    amount: saida ? -Number(t.valor || 0) : Number(t.valor || 0),
    sub: [t.categoria, t.contraparte, t.status].filter(Boolean).join(' · '),
    alert: vencido, route: '/admin/financeiro/titulos',
  }
}

function atendimentoMicro(a, { comissao = false } = {}) {
  const pct = a.pctComissao == null ? null : Number(a.pctComissao)
  return {
    id: `atendimento-${a.id}-${comissao ? 'c' : 'a'}`, kind: 'atendimento', name: `${a.servico} · ${a.cliente}`,
    date: a.dia,
    amount: comissao ? (pct == null ? null : (a.valor * pct) / 100) : a.valor,
    sub: comissao ? (pct == null ? 'Sem percentual definido' : `Comissão de ${pct}%`) : `com ${a.profissional}`,
    alert: comissao && pct == null, route: '/reception/board',
  }
}

export const MICRO_TITLE = {
  contas: () => 'Títulos liquidados nesta conta',
  categorias: (item) => (item.alert ? 'Títulos da categoria' : 'Lançamentos do mês'),
  cofres: () => 'Últimos aportes e retiradas',
  comissoes: () => 'Atendimentos que geraram comissão',
  equipe: () => 'Últimos atendimentos',
  clientes: () => 'Histórico de cortes',
  agenda: () => null,
}

export const MICRO_ACTION = {
  titulo: 'Abrir títulos',
  movimento: 'Ver envelope',
  atendimento: 'Abrir agenda',
}

// Micro-conexões que saem do próprio modelo. Cofres busca na API (ver página).
export function microDoModelo(item, ctx) {
  switch (item.sector) {
    case 'contas':
      return ctx.titulos
        .filter((t) => t.conta_bancaria === item.name && t.data_liquidacao)
        .sort((a, b) => (a.data_liquidacao < b.data_liquidacao ? 1 : -1))
        .map((t) => tituloMicro(t, ctx.hoje))
    case 'categorias':
      return ctx.titulos
        .filter((t) => t.tipo === 'pagar' && t.status !== 'cancelado' && (t.categoria || SEM_CATEGORIA) === item.name)
        .sort((a, b) => (a.data_evento < b.data_evento ? 1 : -1))
        .map((t) => tituloMicro(t, ctx.hoje))
    case 'comissoes':
      return (ctx.atendimentosPorProf.get(item.rawId) || []).filter((a) => a.dia.startsWith(ctx.mes)).map((a) => atendimentoMicro(a, { comissao: true }))
    case 'equipe':
      return (ctx.atendimentosPorProf.get(item.rawId) || []).map((a) => atendimentoMicro(a))
    case 'clientes':
      return (ctx.visitasPorCliente.get(item.rawId) || []).map((a) => atendimentoMicro(a))
    default:
      return []
  }
}

export function movimentoEnvelopeMicro(tx) {
  const entrada = tx.direcao === 'credito'
  const valor = Number(tx.valor) || 0
  const nomes = { aporte_avulso: 'Aporte avulso', distribuicao: 'Distribuição diária', resgate: 'Resgate', estorno: 'Estorno' }
  return {
    id: `movimento-${tx.id}`, kind: 'movimento', name: nomes[tx.tipo] || tx.tipo || (entrada ? 'Aporte' : 'Retirada'),
    date: tx.data_brt, amount: entrada ? valor : -valor, sub: `Saldo ${brl(tx.saldo_depois)}`, alert: false,
    route: '/admin/financeiro/envelopes',
  }
}
