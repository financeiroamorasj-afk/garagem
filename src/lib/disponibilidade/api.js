import { supabase } from '../supabase'
import { dataLocalKey } from '../agenda/ui'

async function rpc(name, payload) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export function listarDisponibilidadeOperacional({ dataInicial, dataFinal }) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) {
    throw new TypeError('Período de disponibilidade inválido')
  }
  return rpc('agenda_disponibilidade_calendario', {
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
  })
}

export function listarJornadas(profissionalId) {
  if (!profissionalId) throw new TypeError('Profissional inválido')
  return rpc('admin_jornadas_listar', { p_profissional_id: profissionalId })
}

export function salvarJornadas({ profissionalId, dias }) {
  if (!profissionalId || !Array.isArray(dias) || dias.length !== 7) throw new TypeError('Jornada inválida')
  return rpc('admin_jornadas_salvar', {
    p_profissional_id: profissionalId,
    p_dias: dias.map((day) => ({
      dia_semana: Number(day.dia_semana),
      ativo: Boolean(day.ativo),
      hora_inicio: day.ativo ? day.hora_inicio : null,
      hora_fim: day.ativo ? day.hora_fim : null,
      intervalo_inicio: day.ativo && day.intervalo_inicio ? day.intervalo_inicio : null,
      intervalo_fim: day.ativo && day.intervalo_fim ? day.intervalo_fim : null,
    })),
  })
}

function dateAfterDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return dataLocalKey(date)
}

export function listarBloqueios(profissionalId, { dataInicial = dataLocalKey(), dataFinal = dateAfterDays(366) } = {}) {
  if (!profissionalId) throw new TypeError('Profissional inválido')
  return rpc('admin_bloqueios_listar', {
    p_profissional_id: profissionalId,
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
  })
}

export function criarBloqueio({ profissionalId, inicio, fim, motivo }) {
  if (!profissionalId || !inicio || !fim) throw new TypeError('Bloqueio inválido')
  const start = new Date(inicio)
  const end = new Date(fim)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new TypeError('O término precisa ser posterior ao início.')
  return rpc('admin_bloqueio_criar', {
    p_profissional_id: profissionalId,
    p_inicio: start.toISOString(),
    p_fim: end.toISOString(),
    p_motivo: String(motivo ?? '').trim() || null,
  })
}

export function excluirBloqueio(id) {
  if (!id) throw new TypeError('Bloqueio inválido')
  return rpc('admin_bloqueio_excluir', { p_id: id })
}

const ERRORS = {
  DISPONIBILIDADE_NAO_AUTORIZADO: 'Seu usuário não pode administrar a disponibilidade da equipe.',
  DISPONIBILIDADE_PROFISSIONAL_INVALIDO: 'Selecione um barbeiro ativo.',
  DISPONIBILIDADE_JORNADA_INVALIDA: 'Revise os horários. O intervalo precisa ficar dentro do expediente.',
  DISPONIBILIDADE_PERIODO_INVALIDO: 'O período consultado é inválido.',
  DISPONIBILIDADE_BLOQUEIO_INVALIDO: 'Revise o início e o término do bloqueio.',
  DISPONIBILIDADE_MOTIVO_INVALIDO: 'O motivo pode ter no máximo 200 caracteres.',
  DISPONIBILIDADE_BLOQUEIO_NAO_ENCONTRADO: 'Este bloqueio já foi removido.',
  DISPONIBILIDADE_VISUALIZACAO_NAO_AUTORIZADA: 'Seu usuário não pode consultar esta disponibilidade.',
}

export function mensagemErroDisponibilidade(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return code ? ERRORS[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir a operação.'
}
