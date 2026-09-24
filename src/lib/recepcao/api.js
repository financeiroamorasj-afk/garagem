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

export async function listarProdutosRecepcao() {
  return (await rpc('recepcao_produtos_listar')) ?? []
}

export async function listarProfissionaisRecepcao() {
  return (await rpc('recepcao_profissionais_listar')) ?? []
}

export async function listarVendasBalcaoRecepcao(dataInicial, dataFinal, limite = 50) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) throw new TypeError('Período inválido')
  return (await rpc('recepcao_vendas_balcao_listar', {
    p_data_inicial: dataInicial,
    p_data_final: dataFinal,
    p_limite: Number(limite),
  })) ?? []
}

export function salvarCarrinhoRecepcao({ pendenciaId, valorServico, produtos, expectedUpdatedAt }) {
  if (!pendenciaId || !expectedUpdatedAt) throw new TypeError('Atualize a fila antes de alterar o carrinho.')
  const serviceValue = Number(valorServico)
  if (!Number.isFinite(serviceValue) || serviceValue < 0) throw new TypeError('Revise o valor do serviço.')
  return rpc('recepcao_carrinho_salvar', {
    p_pendencia_id: pendenciaId,
    p_valor_servico: serviceValue,
    p_produtos: produtos.map(({ produtoId, quantidade }) => ({ produto_id: produtoId, quantidade: Number(quantidade) })),
    p_expected_updated_at: expectedUpdatedAt,
  })
}

export function concluirCobrancaRecepcao({ pendenciaId, desconto, formaPagamento, taxa, dataRecebimento, chaveIdempotencia, expectedUpdatedAt }) {
  if (!pendenciaId || !expectedUpdatedAt || !chaveIdempotencia) throw new TypeError('Atualize a fila antes de cobrar.')
  if (!['dinheiro', 'pix', 'debito', 'credito', 'outro'].includes(formaPagamento)) throw new TypeError('Selecione a forma de pagamento.')
  return rpc('recepcao_cobranca_concluir', {
    p_pendencia_id: pendenciaId,
    p_desconto: Number(desconto),
    p_forma_pagamento: formaPagamento,
    p_taxa: Number(taxa),
    p_data_recebimento: dataRecebimento,
    p_chave_idempotencia: chaveIdempotencia,
    p_expected_updated_at: expectedUpdatedAt,
  })
}

export function devolverAtendimentoRecepcao({ pendenciaId, motivo, expectedUpdatedAt }) {
  const reason = String(motivo ?? '').trim()
  if (!pendenciaId || !expectedUpdatedAt) throw new TypeError('Atualize a fila antes de devolver o atendimento.')
  if (reason.length < 3 || reason.length > 500) throw new TypeError('Informe o motivo da devolução.')
  return rpc('recepcao_fila_devolver', {
    p_pendencia_id: pendenciaId,
    p_motivo: reason,
    p_expected_updated_at: expectedUpdatedAt,
  })
}

export function venderProdutosRecepcao({ produtos, profissionalId = null, clienteId = null, desconto, formaPagamento, taxa, dataRecebimento, chaveIdempotencia }) {
  if (!Array.isArray(produtos) || produtos.length === 0) throw new TypeError('Adicione pelo menos um produto.')
  if (!chaveIdempotencia) throw new TypeError('Reabra a venda e tente novamente.')
  if (!['dinheiro', 'pix', 'debito', 'credito', 'outro'].includes(formaPagamento)) throw new TypeError('Selecione a forma de pagamento.')
  return rpc('recepcao_venda_avulsa_concluir_cliente', {
    p_produtos: produtos.map(({ produtoId, quantidade }) => ({ produto_id: produtoId, quantidade: Number(quantidade) })),
    p_profissional_id: profissionalId || null,
    p_cliente_id: clienteId || null,
    p_desconto: Number(desconto),
    p_forma_pagamento: formaPagamento,
    p_taxa: Number(taxa),
    p_data_recebimento: dataRecebimento,
    p_chave_idempotencia: chaveIdempotencia,
  })
}

export function obterResumoRecepcaoAdmin(dataInicial, dataFinal) {
  if (!DATE_KEY.test(String(dataInicial ?? '')) || !DATE_KEY.test(String(dataFinal ?? ''))) throw new TypeError('Período inválido')
  return rpc('admin_recepcao_resumo', { p_data_inicial: dataInicial, p_data_final: dataFinal })
}

export function estornarVendaBalcaoRecepcao({ vendaId, motivo, chaveIdempotencia }) {
  const reason = String(motivo ?? '').trim()
  if (!vendaId || !chaveIdempotencia) throw new TypeError('Atualize as vendas e tente novamente.')
  if (reason.length < 3 || reason.length > 500) throw new TypeError('Informe o motivo do estorno.')
  return rpc('recepcao_venda_avulsa_estornar', {
    p_venda_id: vendaId,
    p_motivo: reason,
    p_chave_idempotencia: chaveIdempotencia,
  })
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
  RECEPCAO_CARRINHO_VALOR_INVALIDO: 'Revise o valor do serviço.',
  RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS: 'Revise os produtos e as quantidades.',
  RECEPCAO_CARRINHO_PRODUTOS_DUPLICADOS: 'O mesmo produto não pode aparecer duas vezes.',
  RECEPCAO_CARRINHO_PRODUTO_NAO_ENCONTRADO: 'Um produto não está mais disponível.',
  RECEPCAO_CARRINHO_ESTOQUE_INSUFICIENTE: 'Um produto não possui estoque suficiente.',
  RECEPCAO_CARRINHO_NAO_ENCONTRADO: 'Este atendimento não está mais na fila.',
  RECEPCAO_CARRINHO_STATUS_INVALIDO: 'Este atendimento já foi cobrado ou retirado da fila.',
  RECEPCAO_CARRINHO_CONFLITO_VERSAO: 'O carrinho mudou em outro dispositivo. Atualize a fila.',
  RECEPCAO_COBRANCA_NAO_ENCONTRADA: 'Esta cobrança não foi encontrada.',
  RECEPCAO_COBRANCA_STATUS_INVALIDO: 'Este atendimento já foi processado em outro dispositivo.',
  RECEPCAO_COBRANCA_CONFLITO_VERSAO: 'O carrinho mudou em outro dispositivo. Atualize antes de cobrar.',
  RECEPCAO_COBRANCA_DESCONTO_INVALIDO: 'O desconto não pode ultrapassar o total.',
  RECEPCAO_COBRANCA_TAXA_INVALIDA: 'A taxa não pode ultrapassar o valor cobrado.',
  RECEPCAO_COBRANCA_PAGAMENTO_INVALIDO: 'Selecione a forma de pagamento.',
  RECEPCAO_COBRANCA_DATA_INVALIDA: 'A data prevista para receber não pode estar no passado.',
  RECEPCAO_COBRANCA_PRODUTO_NAO_ENCONTRADO: 'Um produto do carrinho não está mais disponível.',
  RECEPCAO_COBRANCA_ESTOQUE_INSUFICIENTE: 'Um produto do carrinho não possui estoque suficiente.',
  RECEPCAO_COBRANCA_CONTA_NAO_CONFIGURADA: 'A barbearia precisa configurar uma conta financeira antes da cobrança.',
  RECEPCAO_DEVOLUCAO_MOTIVO_INVALIDO: 'Informe por que o atendimento precisa voltar ao barbeiro.',
  RECEPCAO_DEVOLUCAO_NAO_ENCONTRADA: 'Este atendimento não está mais na fila.',
  RECEPCAO_DEVOLUCAO_STATUS_INVALIDO: 'Este atendimento já foi processado em outro dispositivo.',
  RECEPCAO_DEVOLUCAO_CONFLITO_VERSAO: 'O atendimento mudou em outro dispositivo. Atualize a fila.',
  RECEPCAO_VENDA_PRODUTOS_INVALIDOS: 'Revise os produtos e as quantidades.',
  RECEPCAO_VENDA_PRODUTOS_DUPLICADOS: 'O mesmo produto não pode aparecer duas vezes.',
  RECEPCAO_VENDA_PRODUTO_NAO_ENCONTRADO: 'Um produto não está mais disponível.',
  RECEPCAO_VENDA_ESTOQUE_INSUFICIENTE: 'Um produto não possui estoque suficiente.',
  RECEPCAO_VENDA_PROFISSIONAL_INVALIDO: 'O profissional responsável não está disponível.',
  RECEPCAO_VENDA_DESCONTO_INVALIDO: 'O desconto não pode ultrapassar o total.',
  RECEPCAO_VENDA_TAXA_INVALIDA: 'A taxa não pode ultrapassar o valor cobrado.',
  RECEPCAO_VENDA_PAGAMENTO_INVALIDO: 'Selecione a forma de pagamento.',
  RECEPCAO_VENDA_DATA_INVALIDA: 'A data prevista para receber não pode estar no passado.',
  RECEPCAO_VENDA_CONTA_NAO_CONFIGURADA: 'A barbearia precisa configurar uma conta antes da venda.',
  RECEPCAO_VENDA_CLIENTE_INVALIDO: 'O cliente selecionado não está disponível nesta barbearia.',
  RECEPCAO_VENDA_CHAVE_EM_USO: 'Esta tentativa de venda já foi concluída com outros dados.',
  RECEPCAO_VENDAS_PERIODO_INVALIDO: 'Escolha um período de até 31 dias.',
  RECEPCAO_VENDAS_LIMITE_INVALIDO: 'Não foi possível carregar o histórico de vendas.',
  RECEPCAO_ESTORNO_MOTIVO_INVALIDO: 'Informe por que a venda está sendo estornada.',
  RECEPCAO_ESTORNO_VENDA_NAO_ENCONTRADA: 'Esta venda não foi encontrada.',
  RECEPCAO_ESTORNO_JA_REALIZADO: 'Esta venda já foi estornada em outro dispositivo.',
  RECEPCAO_ESTORNO_PRODUTO_NAO_ENCONTRADO: 'Um produto desta venda não está mais disponível para ajuste.',
  RECEPCAO_RELATORIO_PERIODO_INVALIDO: 'Escolha um período de até 93 dias.',
}

export function mensagemErroRecepcao(error) {
  if (error instanceof TypeError) return error.message
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return code ? ERRORS[code] : 'Não foi possível concluir a operação da recepção.'
}
