import { supabase } from '../supabase'
import { normalizarBeneficiarioPix, normalizarChavePix, normalizarCidadePix } from './brcode'

export async function carregarConfiguracaoPix() {
  const { data, error } = await supabase.rpc('configuracoes_pix_obter')
  if (error) throw error
  return data
}

export async function salvarConfiguracaoPix({ chave, beneficiario, cidade }) {
  const { data, error } = await supabase.rpc('configuracoes_pix_salvar', {
    p_chave: normalizarChavePix(chave),
    p_beneficiario: normalizarBeneficiarioPix(beneficiario),
    p_cidade: normalizarCidadePix(cidade),
  })
  if (error) throw error
  return data
}

export async function removerConfiguracaoPix() {
  const { data, error } = await supabase.rpc('configuracoes_pix_salvar', { p_chave: null, p_beneficiario: null, p_cidade: null })
  if (error) throw error
  return data
}

export function mensagemErroPix(error) {
  if (error instanceof TypeError) return error.message
  const message = [error?.message, error?.details].filter(Boolean).join(' ')
  if (/PIX_ACESSO_NEGADO/i.test(message)) return 'Você não tem permissão para acessar a configuração PIX.'
  if (/PIX_CHAVE_INVALIDA/i.test(message)) return 'Informe uma chave PIX válida.'
  if (/PIX_BENEFICIARIO_INVALIDO/i.test(message)) return 'Informe o nome do beneficiário com até 25 caracteres.'
  if (/PIX_CIDADE_INVALIDA/i.test(message)) return 'Informe a cidade com até 15 caracteres.'
  return 'Não foi possível carregar a configuração PIX da barbearia.'
}

