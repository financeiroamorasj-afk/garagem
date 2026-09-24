import { supabase } from '../supabase'

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
  return rows ?? []
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
  return rows ?? []
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
