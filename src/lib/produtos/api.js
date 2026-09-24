import { supabase } from '../supabase'

const PAGAMENTOS = ['dinheiro', 'pix', 'debito', 'credito', 'outro']

function texto(value, label, min, max, optional = false) {
  const normalized = String(value ?? '').trim()
  if (optional && !normalized) return null
  if (normalized.length < min || normalized.length > max) throw new TypeError(`${label} inválido`)
  return normalized
}

function numero(value, label, min, max, integer = false) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < min || normalized > max || (integer && !Number.isInteger(normalized))) {
    throw new TypeError(`${label} inválido`)
  }
  return normalized
}

function produtoPayload(input) {
  return {
    nome: texto(input.nome, 'Nome', 2, 120),
    sku: texto(input.sku, 'Código', 1, 60, true),
    categoria: texto(input.categoria, 'Categoria', 1, 80, true),
    descricao: texto(input.descricao, 'Descrição', 1, 1000, true),
    preco_venda: Math.round(numero(input.preco_venda, 'Preço de venda', 0, 99999999) * 100) / 100,
    preco_custo: Math.round(numero(input.preco_custo, 'Preço de custo', 0, 99999999) * 100) / 100,
    estoque_quantidade: numero(input.estoque_quantidade, 'Estoque', 0, 999999, true),
    estoque_minimo: numero(input.estoque_minimo, 'Estoque mínimo', 0, 999999, true),
    comissao_percentual: input.comissao_percentual === '' || input.comissao_percentual == null
      ? null
      : numero(input.comissao_percentual, 'Comissão', 0, 100),
  }
}

async function rpc(name, payload) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

export async function listarProdutosAdmin({ incluirInativos = false } = {}) {
  return (await rpc('produtos_catalogo_listar', { p_incluir_inativos: Boolean(incluirInativos) })) ?? []
}

export function criarProduto(input) {
  const item = produtoPayload(input)
  return rpc('produto_catalogo_criar', {
    p_nome: item.nome,
    p_sku: item.sku,
    p_categoria: item.categoria,
    p_descricao: item.descricao,
    p_preco_venda: item.preco_venda,
    p_preco_custo: item.preco_custo,
    p_estoque_quantidade: item.estoque_quantidade,
    p_estoque_minimo: item.estoque_minimo,
    p_comissao_percentual: item.comissao_percentual,
  })
}

export function atualizarProduto(input) {
  if (!input.id || !input.expectedUpdatedAt) throw new TypeError('Produto inválido')
  const item = produtoPayload(input)
  return rpc('produto_catalogo_atualizar', {
    p_id: input.id,
    p_nome: item.nome,
    p_sku: item.sku,
    p_categoria: item.categoria,
    p_descricao: item.descricao,
    p_preco_venda: item.preco_venda,
    p_preco_custo: item.preco_custo,
    p_estoque_quantidade: item.estoque_quantidade,
    p_estoque_minimo: item.estoque_minimo,
    p_comissao_percentual: item.comissao_percentual,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
}

export function definirProdutoAtivo({ id, ativo }) {
  if (!id || typeof ativo !== 'boolean') throw new TypeError('Produto inválido')
  return rpc('produto_catalogo_definir_ativo', { p_id: id, p_ativo: ativo })
}

export async function listarProdutosBarbeiro() {
  return (await rpc('barbeiro_produtos_listar')) ?? []
}

export function venderProduto({ produtoId, quantidade, agendamentoId = null, formaPagamento, chaveIdempotencia }) {
  if (!produtoId) throw new TypeError('Selecione um produto')
  const quantity = numero(quantidade, 'Quantidade', 1, 100, true)
  if (!PAGAMENTOS.includes(formaPagamento)) throw new TypeError('Forma de pagamento inválida')
  if (!chaveIdempotencia) throw new TypeError('Venda inválida')
  return rpc('barbeiro_produto_vender', {
    p_produto_id: produtoId,
    p_quantidade: quantity,
    p_agendamento_id: agendamentoId || null,
    p_forma_pagamento: formaPagamento,
    p_chave_idempotencia: chaveIdempotencia,
  })
}

const ERRORS = {
  PRODUTO_NAO_AUTORIZADO: 'Seu usuário não pode administrar produtos.',
  PRODUTO_NOME_INVALIDO: 'Revise o nome do produto.',
  PRODUTO_PRECO_INVALIDO: 'Revise os preços de venda e custo.',
  PRODUTO_ESTOQUE_INVALIDO: 'Revise as quantidades de estoque.',
  PRODUTO_COMISSAO_INVALIDA: 'A comissão deve ficar entre 0 e 100%.',
  PRODUTO_NOME_DUPLICADO: 'Já existe um produto com este nome.',
  PRODUTO_SKU_DUPLICADO: 'Já existe um produto com este código.',
  PRODUTO_CONFLITO_VERSAO: 'Este produto foi alterado em outra sessão. Recarregue antes de salvar.',
  PRODUTO_NAO_ENCONTRADO: 'O produto não foi encontrado.',
  VENDA_PRODUTO_NAO_AUTORIZADA: 'Seu usuário não pode registrar esta venda.',
  VENDA_PRODUTO_QUANTIDADE_INVALIDA: 'Informe uma quantidade válida.',
  VENDA_PRODUTO_PAGAMENTO_INVALIDO: 'Selecione a forma de pagamento.',
  VENDA_PRODUTO_NAO_ENCONTRADO: 'Este produto não está disponível para venda.',
  VENDA_PRODUTO_ESTOQUE_INSUFICIENTE: 'Não há estoque suficiente para esta venda.',
  VENDA_PRODUTO_ATENDIMENTO_INVALIDO: 'O atendimento selecionado não pertence à sua agenda.',
}

export function mensagemErroProduto(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return code ? ERRORS[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir a operação.'
}

export { PAGAMENTOS }
