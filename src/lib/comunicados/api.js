import { supabase } from '../supabase'

const CONTEXTOS = ['gestao', 'barbeiro']

function validarContexto(contexto) {
  if (!CONTEXTOS.includes(contexto)) throw new TypeError('Contexto de avisos inválido.')
  return contexto
}

async function rpc(name, payload) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

export function listarComunicados(contexto, limite = 20) {
  const value = Number(limite)
  if (!Number.isInteger(value) || value < 1 || value > 50) throw new TypeError('Limite de avisos inválido.')
  return rpc('app_comunicados_listar', { p_contexto: validarContexto(contexto), p_limite: value })
}

export function marcarComunicadoLido(comunicadoId, contexto) {
  if (!comunicadoId) throw new TypeError('Aviso inválido.')
  return rpc('app_comunicado_marcar_lido', {
    p_comunicado_id: comunicadoId,
    p_contexto: validarContexto(contexto),
  })
}

export function marcarTodosComunicadosLidos(contexto) {
  return rpc('app_comunicados_marcar_todos_lidos', { p_contexto: validarContexto(contexto) })
}

export function mensagemErroComunicados(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  if (detail.includes('APP_COMUNICADOS_NAO_AUTORIZADO')) return 'Seu acesso não pode consultar estes avisos.'
  if (detail.includes('APP_COMUNICADO_NAO_ENCONTRADO')) return 'Este aviso não está mais disponível.'
  return error instanceof TypeError ? error.message : 'Não foi possível carregar as atualizações.'
}
