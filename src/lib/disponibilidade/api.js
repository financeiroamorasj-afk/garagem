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

export function obterIntervaloAtendimentos() {
  return rpc('admin_intervalo_atendimentos_obter')
}

export function salvarIntervaloAtendimentos(intervaloMinutos) {
  const value = Number(intervaloMinutos)
  if (!Number.isInteger(value) || value < 0 || value > 60) {
    throw new TypeError('Informe um intervalo entre 0 e 60 minutos.')
  }
  return rpc('admin_intervalo_atendimentos_salvar', { p_intervalo_minutos: value })
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

function normalizarDias(dias) {
  if (!Array.isArray(dias) || dias.length !== 7) throw new TypeError('Jornada inválida')
  return dias.map((day) => ({
    dia_semana: Number(day.dia_semana),
    ativo: Boolean(day.ativo),
    hora_inicio: day.ativo ? day.hora_inicio : null,
    hora_fim: day.ativo ? day.hora_fim : null,
    intervalo_inicio: day.ativo && day.intervalo_inicio ? day.intervalo_inicio : null,
    intervalo_fim: day.ativo && day.intervalo_fim ? day.intervalo_fim : null,
  }))
}

async function contextoMinhaDisponibilidadeAlternativo() {
  const [agenda, userResult] = await Promise.all([
    rpc('barbeiro_agenda_contexto'),
    supabase.auth.getUser(),
  ])
  const { data: profissional, error } = await supabase
    .from('profissionais')
    .select('id,nome,apelido,tipo_vinculo,responsavel_disponibilidade')
    .eq('id', agenda.id)
    .eq('ativo', true)
    .single()
  if (error) throw error
  let role = null
  const userId = userResult.data?.user?.id
  if (userId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    role = profile?.role ?? null
  }
  return {
    profissional_id: profissional.id,
    nome: profissional.nome,
    apelido: profissional.apelido,
    tipo_vinculo: profissional.tipo_vinculo,
    responsavel_disponibilidade: profissional.responsavel_disponibilidade,
    pode_editar: ['admin', 'master'].includes(role) || profissional.responsavel_disponibilidade === 'profissional',
  }
}

export async function obterContextoMinhaDisponibilidade() {
  try {
    return await rpc('barbeiro_disponibilidade_contexto')
  } catch {
    return contextoMinhaDisponibilidadeAlternativo()
  }
}

export async function listarMinhasJornadas(profissionalId) {
  try {
    return await rpc('barbeiro_jornadas_listar')
  } catch (rpcError) {
    if (!profissionalId) throw rpcError
    const { data, error } = await supabase
      .from('profissionais_jornadas')
      .select('dia_semana,ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim,updated_at')
      .eq('profissional_id', profissionalId)
      .order('dia_semana')
    if (error) throw rpcError
    return data ?? []
  }
}

export function analisarMinhaJornada(dias) {
  return rpc('barbeiro_jornada_analisar', { p_dias: normalizarDias(dias) })
}

export function salvarMinhasJornadas({ dias, confirmarConflitos = false }) {
  return rpc('barbeiro_jornadas_salvar', {
    p_dias: normalizarDias(dias),
    p_confirmar_conflitos: Boolean(confirmarConflitos),
  })
}

export async function listarMeusBloqueios({ dataInicial = dataLocalKey(), dataFinal = dateAfterDays(366), profissionalId } = {}) {
  try {
    return await rpc('barbeiro_bloqueios_listar', { p_data_inicial: dataInicial, p_data_final: dataFinal })
  } catch (rpcError) {
    if (!profissionalId) throw rpcError
    const start = new Date(`${dataInicial}T00:00:00`)
    const end = new Date(`${dataFinal}T00:00:00`)
    end.setDate(end.getDate() + 1)
    const { data, error } = await supabase
      .from('profissionais_bloqueios')
      .select('id,inicio,fim,motivo,created_at')
      .eq('profissional_id', profissionalId)
      .lt('inicio', end.toISOString())
      .gt('fim', start.toISOString())
      .order('inicio')
    if (error) throw rpcError
    return data ?? []
  }
}

function normalizarPeriodoBloqueio({ inicio, fim }) {
  const start = new Date(inicio)
  const end = new Date(fim)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new TypeError('O término precisa ser posterior ao início.')
  return { inicio: start.toISOString(), fim: end.toISOString() }
}

export function analisarMeuBloqueio(input) {
  const period = normalizarPeriodoBloqueio(input)
  return rpc('barbeiro_bloqueio_analisar', { p_inicio: period.inicio, p_fim: period.fim })
}

export function criarMeuBloqueio({ inicio, fim, motivo, confirmarConflitos = false }) {
  const period = normalizarPeriodoBloqueio({ inicio, fim })
  return rpc('barbeiro_bloqueio_criar', {
    p_inicio: period.inicio,
    p_fim: period.fim,
    p_motivo: String(motivo ?? '').trim() || null,
    p_confirmar_conflitos: Boolean(confirmarConflitos),
  })
}

export function excluirMeuBloqueio(id) {
  if (!id) throw new TypeError('Bloqueio inválido')
  return rpc('barbeiro_bloqueio_excluir', { p_id: id })
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
  DISPONIBILIDADE_INTERVALO_INVALIDO: 'Informe um intervalo entre 0 e 60 minutos.',
  DISPONIBILIDADE_AUTOSSERVICO_NAO_AUTORIZADO: 'Seu acesso não está vinculado a um profissional ativo.',
  DISPONIBILIDADE_GESTAO_RESPONSAVEL: 'Sua disponibilidade é administrada pela gestão da barbearia.',
  DISPONIBILIDADE_CONFLITOS_CONFIRMAR: 'Esta alteração afeta clientes já agendados. Revise e confirme antes de salvar.',
  AGENDA_BARBEIRO_NAO_AUTORIZADO: 'Este acesso não pertence ao aplicativo do barbeiro.',
  AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO: 'Seu acesso não está vinculado a um barbeiro ativo. Fale com a gestão.',
}

export function mensagemErroDisponibilidade(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return code ? ERRORS[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir a operação.'
}
