import { supabase } from '../supabase'

const TIPOS_MATERIAL = ['insumo', 'ferramenta']

function texto(value, label, min, max) {
  const normalized = String(value ?? '').trim()
  if (normalized.length < min || normalized.length > max) throw new TypeError(`${label} inválido`)
  return normalized
}

function numero(value, label, min, max) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) throw new TypeError(`${label} inválido`)
  return normalized
}

function materialPayload(input) {
  if (!TIPOS_MATERIAL.includes(input.tipo)) throw new TypeError('Tipo de material inválido')
  return {
    nome: texto(input.nome, 'Nome', 2, 100),
    tipo: input.tipo,
    unidade: texto(input.unidade, 'Unidade', 1, 30),
  }
}

function servicoPayload(input) {
  const commission = input.comissao_percentual === '' || input.comissao_percentual == null
    ? null
    : numero(input.comissao_percentual, 'Comissão', 0, 100)
  const materials = (input.materiais ?? []).map((item) => ({
    material_id: texto(item.material_id, 'Material', 1, 50),
    quantidade: numero(item.quantidade, 'Quantidade', 0.001, 999999),
    observacao: String(item.observacao ?? '').trim() || null,
  }))
  if (new Set(materials.map((item) => item.material_id)).size !== materials.length) throw new TypeError('Materiais repetidos')
  return {
    nome: texto(input.nome, 'Nome', 2, 120),
    preco: Math.round(numero(input.preco, 'Preço', 0, 99999999) * 100) / 100,
    duracao_minutos: Math.round(numero(input.duracao_minutos, 'Duração', 5, 480)),
    descricao: String(input.descricao ?? '').trim().slice(0, 1000) || null,
    comissao_percentual: commission,
    materiais: materials,
  }
}

async function rpc(name, payload) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

export async function listarServicosCatalogo({ incluirInativos = false } = {}) {
  return (await rpc('servicos_catalogo_listar', { p_incluir_inativos: Boolean(incluirInativos) })) ?? []
}

export async function listarMateriaisCatalogo({ incluirInativos = false } = {}) {
  return (await rpc('materiais_catalogo_listar', { p_incluir_inativos: Boolean(incluirInativos) })) ?? []
}

export function criarMaterial(input) {
  const item = materialPayload(input)
  return rpc('material_catalogo_criar', { p_nome: item.nome, p_tipo: item.tipo, p_unidade: item.unidade })
}

export function atualizarMaterial(input) {
  const item = materialPayload(input)
  if (!input.id || !input.expectedUpdatedAt) throw new TypeError('Material inválido')
  return rpc('material_catalogo_atualizar', {
    p_id: input.id,
    p_nome: item.nome,
    p_tipo: item.tipo,
    p_unidade: item.unidade,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
}

export function definirMaterialAtivo({ id, ativo }) {
  if (!id || typeof ativo !== 'boolean') throw new TypeError('Material inválido')
  return rpc('material_catalogo_definir_ativo', { p_id: id, p_ativo: ativo })
}

export function criarServico(input) {
  const item = servicoPayload(input)
  return rpc('servico_catalogo_criar', {
    p_nome: item.nome,
    p_preco: item.preco,
    p_duracao_minutos: item.duracao_minutos,
    p_descricao: item.descricao,
    p_comissao_percentual: item.comissao_percentual,
    p_materiais: item.materiais,
  })
}

export function atualizarServico(input) {
  const item = servicoPayload(input)
  if (!input.id || !input.expectedUpdatedAt) throw new TypeError('Serviço inválido')
  return rpc('servico_catalogo_atualizar', {
    p_id: input.id,
    p_nome: item.nome,
    p_preco: item.preco,
    p_duracao_minutos: item.duracao_minutos,
    p_descricao: item.descricao,
    p_comissao_percentual: item.comissao_percentual,
    p_materiais: item.materiais,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
}

export function definirServicoAtivo({ id, ativo }) {
  if (!id || typeof ativo !== 'boolean') throw new TypeError('Serviço inválido')
  return rpc('servico_catalogo_definir_ativo', { p_id: id, p_ativo: ativo })
}

const ERRORS = {
  CATALOGO_NAO_AUTORIZADO: 'Seu usuário não pode administrar este catálogo.',
  CATALOGO_NOME_INVALIDO: 'Revise o nome informado.',
  CATALOGO_TIPO_INVALIDO: 'Selecione um tipo de material válido.',
  CATALOGO_UNIDADE_INVALIDA: 'Revise a unidade de uso.',
  CATALOGO_NOME_DUPLICADO: 'Já existe um cadastro com este nome.',
  CATALOGO_PRECO_INVALIDO: 'Informe um preço válido.',
  CATALOGO_DURACAO_INVALIDA: 'A duração deve ficar entre 5 e 480 minutos.',
  CATALOGO_COMISSAO_INVALIDA: 'A comissão deve ficar entre 0 e 100%.',
  CATALOGO_MATERIAIS_INVALIDOS: 'Revise os materiais e suas quantidades.',
  CATALOGO_MATERIAL_EM_USO: 'Remova este material dos serviços ativos antes de desativá-lo.',
  CATALOGO_CONFLITO_VERSAO: 'Este cadastro foi alterado em outra sessão. Recarregue antes de salvar.',
  CATALOGO_NAO_ENCONTRADO: 'O cadastro não foi encontrado ou já foi removido.',
}

export function mensagemErroCatalogo(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return { message: code ? ERRORS[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir a operação.', conflict: code === 'CATALOGO_CONFLITO_VERSAO' }
}

export { TIPOS_MATERIAL }
