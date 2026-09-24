// Carrega os dados do Mapa da barbearia. Só leitura: usa as RPCs do
// financeiro que já existem e as tabelas de agenda/equipe liberadas pela RLS
// para o administrador. Cada fonte falha sozinha — um núcleo indisponível não
// derruba o mapa inteiro.

import { supabase } from '../supabase'
import { listarEnvelopes, listarSaldosDisponiveisContas, listarTitulos, listarTransacoesEnvelope, obterResumoPeriodo } from '../financeiro/api'
import { dataCompetenciaBrt, periodoMensalBrt } from '../financeiro/periodo'

const JANELA_AGENDA_PASSADO = 120
const JANELA_AGENDA_FUTURO = 15

export function deslocarData(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function consultar(query) {
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function listarTodosTitulos(tipo, periodo) {
  const todos = []
  let pagina = 1
  for (;;) {
    const resultado = await listarTitulos({ tipo, dataInicio: periodo.inicio, dataFim: periodo.fim, pagina, porPagina: 100 })
    todos.push(...(resultado?.items || []))
    if (!resultado || pagina >= (resultado.total_paginas || 0)) break
    pagina++
  }
  return todos
}

export async function carregarFontes() {
  const hoje = dataCompetenciaBrt()
  const [ano, mes] = hoje.split('-').map(Number)
  const periodo = periodoMensalBrt(ano, mes)
  const inicioAgenda = `${deslocarData(hoje, -JANELA_AGENDA_PASSADO)}T00:00:00-03:00`
  const fimAgenda = `${deslocarData(hoje, JANELA_AGENDA_FUTURO)}T23:59:59-03:00`

  const tarefas = {
    resumo: obterResumoPeriodo({ dataInicio: periodo.inicio, dataFim: periodo.fim }),
    saldos: listarSaldosDisponiveisContas(),
    envelopes: listarEnvelopes(),
    titulos: Promise.all([listarTodosTitulos('pagar', periodo), listarTodosTitulos('receber', periodo)]),
    profissionais: consultar(supabase.from('profissionais').select('id, nome, ativo, comissao_percentual').order('nome')),
    agenda: consultar(
      supabase
        .from('agendamentos')
        .select('id, data_hora, status, valor_final, profissional_id, cliente_id, cliente_nome_manual, clientes(nome), servicos(nome, comissao_percentual)')
        .gte('data_hora', inicioAgenda)
        .lte('data_hora', fimAgenda)
        .order('data_hora', { ascending: true })
        .limit(2000),
    ),
  }

  const chaves = Object.keys(tarefas)
  const resultados = await Promise.allSettled(Object.values(tarefas))
  const valores = {}
  const erros = {}
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') valores[chaves[i]] = r.value
    else erros[chaves[i]] = r.reason?.message || 'Falha ao carregar'
  })

  return {
    resumo: valores.resumo ?? null,
    saldos: valores.saldos ?? [],
    envelopes: valores.envelopes ?? [],
    titulosPagar: valores.titulos?.[0] ?? [],
    titulosReceber: valores.titulos?.[1] ?? [],
    profissionais: valores.profissionais ?? [],
    agendamentos: valores.agenda ?? [],
    erros,
  }
}

export async function carregarMovimentosEnvelope(envelopeId) {
  const hoje = dataCompetenciaBrt()
  const resultado = await listarTransacoesEnvelope({ envelopeId, dataInicio: deslocarData(hoje, -90), dataFim: hoje, pagina: 1, porPagina: 8 })
  return resultado?.items || []
}
