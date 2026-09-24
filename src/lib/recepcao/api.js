import { supabase } from '../supabase'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

async function rpc(name, payload) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

async function functionErrorCode(error) {
  try { return (await error?.context?.json?.())?.code || error?.message }
  catch { return error?.message }
}

export async function listarUsuariosRecepcao({ incluirInativos = true } = {}) {
  return (await rpc('recepcao_usuarios_listar', { p_incluir_inativos: Boolean(incluirInativos) })) ?? []
}

export async function criarUsuarioRecepcao(input) {
  const nome = String(input.nome ?? '').trim()
  const email = String(input.email ?? '').trim().toLowerCase()
  const telefone = String(input.telefone ?? '').trim() || null
  if (nome.length < 2 || nome.length > 120) throw new TypeError('Nome inválido')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new TypeError('E-mail inválido')
  if (telefone && (telefone.length < 8 || telefone.length > 30)) throw new TypeError('Telefone inválido')
  const { data, error } = await supabase.functions.invoke('create-receptionist', { body: { nome, email, telefone } })
  if (error) throw new Error((await functionErrorCode(error)) || 'RECEPCAO_CONVITE_FALHOU')
  return data
}

export function atualizarUsuarioRecepcao(input) {
  if (!input.id || !input.expectedUpdatedAt || typeof input.ativo !== 'boolean') throw new TypeError('Usuário inválido')
  return rpc('recepcao_usuario_atualizar', {
    p_usuario_id: input.id,
    p_nome: String(input.nome ?? '').trim(),
    p_telefone: String(input.telefone ?? '').trim() || null,
    p_ativo: input.ativo,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
}

export async function listarAgendaRecepcao(dataInicial, dataFinal) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) throw new TypeError('Período inválido')
  return (await rpc('recepcao_agenda_listar_periodo', { p_data_inicial: dataInicial, p_data_final: dataFinal })) ?? []
}

export async function buscarClientesRecepcao(busca) {
  const query = String(busca ?? '').trim()
  if (query.length < 2) throw new TypeError('Digite pelo menos dois caracteres.')
  return (await rpc('recepcao_clientes_buscar', { p_busca: query, p_limite: 20 })) ?? []
}

export async function listarFilaRecepcao() {
  return (await rpc('recepcao_fila_listar')) ?? []
}

const ERRORS = {
  RECEPCAO_ADMIN_NAO_AUTORIZADO: 'Seu usuário não pode administrar a recepção.',
  RECEPCAO_NAO_AUTORIZADA: 'Este acesso não pertence à equipe de recepção.',
  RECEPCAO_MODULO_INATIVO: 'O módulo Recepção não está ativo nesta unidade.',
  RECEPCAO_EMAIL_EM_USO: 'Este e-mail já pertence a outro usuário.',
  RECEPCAO_CONVITE_FALHOU: 'Não foi possível enviar o convite. Tente novamente.',
  RECEPCAO_CADASTRO_FALHOU: 'Não foi possível concluir o cadastro da recepção.',
  RECEPCAO_CONFLITO_VERSAO: 'Este usuário foi alterado em outra sessão. Atualize e tente novamente.',
  RECEPCAO_USUARIO_NAO_ENCONTRADO: 'O usuário da recepção não foi encontrado.',
  RECEPCAO_BUSCA_INVALIDA: 'Digite pelo menos dois caracteres para buscar.',
}

export function mensagemErroRecepcao(error) {
  if (error instanceof TypeError) return error.message
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return code ? ERRORS[code] : 'Não foi possível concluir a operação da recepção.'
}
