import { supabase } from '../supabase'

function throwIfError(error) {
  if (error) throw error
}

export async function listarModulos() {
  const { data, error } = await supabase.rpc('configuracoes_modulos_listar')
  throwIfError(error)
  return Array.isArray(data) ? data : []
}

export async function definirModuloAtivo({ modulo, ativo, expectedUpdatedAt }) {
  const { data, error } = await supabase.rpc('configuracoes_modulo_definir_ativo', {
    p_modulo: modulo,
    p_ativo: ativo,
    p_expected_updated_at: expectedUpdatedAt || null,
  })
  throwIfError(error)
  return data
}

export async function verificarAcessoModulo(modulo) {
  const { data, error } = await supabase.rpc('modulo_acesso_verificar', { p_modulo: modulo })
  throwIfError(error)
  return data === true
}

export function mensagemErroModulo(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`
  if (message.includes('MODULO_NAO_CONTRATADO')) return 'Este módulo não está contratado ou sua vigência terminou.'
  if (message.includes('MODULO_CONFLITO_VERSAO')) return 'A configuração mudou em outra sessão. Atualize a página e tente novamente.'
  if (message.includes('MODULO_SEM_PERMISSAO')) return 'Seu perfil não possui permissão para alterar módulos.'
  if (message.includes('MODULO_INVALIDO')) return 'A configuração informada não é válida.'
  return 'Não foi possível carregar ou alterar os módulos. Tente novamente.'
}
