import { supabase } from '../supabase'

export async function criarHorarioExtra({ data, horaInicio, horaFim, profissionalId = null, motivo = null }) {
  const { data: result, error } = await supabase.rpc('admin_horario_extra_criar', {
    p_data: data,
    p_hora_inicio: horaInicio,
    p_hora_fim: horaFim,
    p_profissional_id: profissionalId || null,
    p_motivo: motivo?.trim() || null,
  })
  if (error) throw error
  return result
}

export async function listarHorariosExtras({ dataInicial, dataFinal }) {
  const { data, error } = await supabase.rpc('admin_horarios_extras_listar', {
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
  })
  if (error) throw error
  return data ?? []
}

export function mensagemErroHorarioExtra(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  if (/HORARIO_EXTRA_INTERVALO_INVALIDO/.test(detail)) return 'O horário final precisa ser posterior ao horário inicial.'
  if (/HORARIO_EXTRA_PROFISSIONAL_INVALIDO/.test(detail)) return 'Selecione um barbeiro ativo.'
  if (/HORARIO_EXTRA_MOTIVO_INVALIDO/.test(detail)) return 'O motivo pode ter no máximo 200 caracteres.'
  if (/HORARIO_EXTRA_PERIODO_INVALIDO/.test(detail)) return 'O período informado para os horários extras é inválido.'
  if (/HORARIO_EXTRA_NAO_AUTORIZADO/.test(detail)) return 'Seu usuário não pode liberar horários extras.'
  return 'Não foi possível salvar o horário extra. Tente novamente.'
}
