import { supabase } from '../supabase'
import { dataHoraLocalKey } from './ui'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export async function carregarContextoBarbeiro() {
  const { data, error } = await supabase.rpc('barbeiro_agenda_contexto')
  if (error) throw error
  return data
}

export async function listarAgendaBarbeiro(data) {
  if (!DATE_KEY.test(String(data ?? ''))) throw new TypeError('Data da agenda inválida')
  const { data: rows, error } = await supabase.rpc('barbeiro_agenda_listar_memoria', { p_data: data })
  if (error) throw error
  return incluirInicioAtendimento(rows ?? [])
}

export async function carregarAtendimentoAtivo() {
  const { data, error } = await supabase.rpc('barbeiro_atendimento_ativo')
  if (error) throw error
  if (!data) return null
  const completo = await mesclarMemoriaAtendimentoAtivo(data)
  const [hidratado] = await incluirInicioAtendimento([completo])
  return hidratado ?? completo
}

async function mesclarMemoriaAtendimentoAtivo(ativo) {
  const dataKey = dataHoraLocalKey(ativo.data_hora)
  if (!DATE_KEY.test(dataKey)) return ativo
  const { data: rows, error } = await supabase.rpc('barbeiro_agenda_listar_memoria', { p_data: dataKey })
  if (error) return ativo
  const encontrado = (rows ?? []).find((item) => item.id === ativo.id)
  return encontrado ? { ...encontrado, ...ativo } : ativo
}

export async function listarAgendaBarbeiroPeriodo(dataInicial, dataFinal) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) {
    throw new TypeError('Período da agenda inválido')
  }
  const { data: rows, error } = await supabase.rpc('barbeiro_agenda_listar_periodo', {
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
  })
  if (error) throw error
  return incluirInicioAtendimento(rows ?? [])
}

async function incluirInicioAtendimento(rows) {
  const comAgendamento = await hidratarCamposAgendamento(rows)
  return preencherPrecoCatalogoServico(comAgendamento)
}

async function hidratarCamposAgendamento(rows) {
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return rows
  const { data: extras, error } = await supabase.from('agendamentos').select('id,iniciado_em,valor_final,servico_id,cliente_id,duracao_minutos_snapshot,registro_retroativo,retroativo_registrado_em').in('id', ids)
  if (error) return rows
  const porId = new Map((extras ?? []).map((item) => [item.id, item]))
  return rows.map((row) => mesclarLinhaAgendamento(row, porId.get(row.id)))
}

function mesclarLinhaAgendamento(row, extra) {
  if (!extra) return row
  return {
    ...row,
    iniciado_em: extra.iniciado_em ?? row.iniciado_em ?? null,
    servico_id: row.servico_id ?? extra.servico_id ?? null,
    cliente_id: row.cliente_id ?? extra.cliente_id ?? null,
    duracao_minutos: row.duracao_minutos ?? extra.duracao_minutos_snapshot ?? 30,
    valor_final: Number(row.valor_final) > 0 ? row.valor_final : extra.valor_final,
    registro_retroativo: Boolean(extra.registro_retroativo),
    retroativo_registrado_em: extra.retroativo_registrado_em ?? null,
  }
}

async function preencherPrecoCatalogoServico(rows) {
  const servicoIds = [...new Set(rows.filter((r) => !(Number(r.valor_final) > 0) && r.servico_id).map((r) => r.servico_id))]
  if (servicoIds.length === 0) return rows
  const { data: servicos, error } = await supabase.from('servicos').select('id,preco,duracao_minutos').in('id', servicoIds)
  if (error) return rows
  const servicoPorId = new Map((servicos ?? []).map((item) => [item.id, item]))
  return rows.map((row) => aplicarFallbackServico(row, servicoPorId.get(row.servico_id)))
}

function aplicarFallbackServico(row, servico) {
  if (!servico) return row
  return {
    ...row,
    duracao_minutos: row.duracao_minutos ?? servico.duracao_minutos ?? 30,
    valor_final: Number(row.valor_final) > 0 ? row.valor_final : servico.preco,
  }
}

export async function obterValorServicoAtendimento(appointmentId) {
  if (!appointmentId) return null
  const [hidratado] = await incluirInicioAtendimento([{ id: appointmentId, status: 'em_atendimento' }])
  return Number(hidratado?.valor_final) > 0 ? Number(hidratado.valor_final) : null
}

export async function carregarResumoBarbeiro(dataInicial, dataFinal) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) {
    throw new TypeError('Período do painel inválido')
  }
  const { data, error } = await supabase.rpc('barbeiro_painel_resumo', {
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
  })
  if (error) throw error
  return data
}

export async function listarAgendaAdmin(data) {
  if (!DATE_KEY.test(String(data ?? ''))) throw new TypeError('Data da agenda inválida')
  const { data: rows, error } = await supabase.rpc('admin_agenda_listar', { p_data: data })
  if (error) throw error
  return rows ?? []
}

export async function listarAgendaAdminPeriodo(dataInicial, dataFinal) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) {
    throw new TypeError('Período da agenda inválido')
  }
  const { data: rows, error } = await supabase.rpc('admin_agenda_listar_periodo', {
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
  })
  if (error) throw error
  return rows ?? []
}

export async function mudarStatusAgendamento({ id, statusEsperado, novoStatus }) {
  if (!id || !statusEsperado || !novoStatus) throw new TypeError('Alteração de atendimento inválida')
  const { data, error } = await supabase.rpc('barbeiro_agendamento_mudar_status', {
    p_agendamento_id: id,
    p_status_esperado: statusEsperado,
    p_novo_status: novoStatus,
  })
  if (error) throw error
  return data
}
