import { supabase } from '../supabase'

async function rpc(name, payload = {}) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

export async function listarClientes(busca = '') {
  return (await rpc('clientes_listar', { p_busca: String(busca ?? '').trim() || null, p_limite: 200 })) ?? []
}

export function carregarFichaCliente(clienteId) {
  if (!clienteId) throw new TypeError('Cliente inválido')
  return rpc('cliente_ficha_detalhe', { p_cliente_id: clienteId })
}

function cleanOptional(value, max, label) {
  const clean = String(value ?? '').trim()
  if (clean.length > max) throw new TypeError(`${label} ultrapassou o limite.`)
  return clean || null
}

export function salvarCliente(input) {
  const name = String(input.nome ?? '').trim()
  const phone = String(input.telefone ?? '').trim()
  const cpf = String(input.cpf ?? '').trim()
  if (name.length < 2 || name.length > 120) throw new TypeError('Informe o nome do cliente.')
  if (phone && (phone.length < 8 || phone.length > 30)) throw new TypeError('Informe um telefone válido.')
  if (cpf && cpf.replace(/\D/g, '').length !== 11) throw new TypeError('Informe os 11 números do CPF.')
  if (input.id && !input.updated_at) throw new TypeError('Atualize a ficha antes de editar.')
  return rpc('cliente_salvar', {
    p_cliente_id: input.id || null,
    p_nome: name,
    p_telefone: phone || null,
    p_cpf: cpf || null,
    p_remover_cpf: Boolean(input.removerCpf),
    p_barbeiro_favorito_id: input.barbeiro_favorito_id || null,
    p_notas_preferencias: cleanOptional(input.notas_preferencias, 1000, 'Preferências'),
    p_expected_updated_at: input.id ? input.updated_at : null,
  })
}

const ERRORS = {
  CLIENTES_NAO_AUTORIZADO: 'Seu usuário não pode acessar a central de clientes.',
  CLIENTES_LIMITE_INVALIDO: 'A busca solicitada é muito ampla.',
  CLIENTE_NAO_ENCONTRADO: 'Esta ficha não foi encontrada.',
  CLIENTE_NOME_INVALIDO: 'Informe o nome do cliente.',
  CLIENTE_TELEFONE_INVALIDO: 'Informe um telefone válido.',
  CLIENTE_PREFERENCIAS_INVALIDAS: 'As preferências podem ter no máximo 1.000 caracteres.',
  CLIENTE_BARBEIRO_INVALIDO: 'Selecione um barbeiro ativo da equipe.',
  CLIENTE_CPF_INVALIDO: 'O CPF informado não é válido.',
  CLIENTE_CPF_DUPLICADO: 'Este CPF já está vinculado a outro cliente desta barbearia.',
  CLIENTE_CONFLITO_VERSAO: 'A ficha foi alterada em outro dispositivo. Recarregue antes de salvar.',
}

export function mensagemErroCliente(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return { message: code ? ERRORS[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir a operação.', conflict: code === 'CLIENTE_CONFLITO_VERSAO' }
}
