import { supabase } from '../supabase'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

async function rpc(name, payload = {}) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

export async function carregarCatalogoEncaixe() {
  const data = await rpc('agenda_encaixe_catalogo')
  return {
    servicos: data?.servicos ?? [],
    clientes: data?.clientes ?? [],
    profissionais: data?.profissionais ?? [],
  }
}

export async function listarHorariosLivres({ servicoId, dataInicial, profissionalId = null, dias = 14, limite = 18 }) {
  if (!servicoId || !DATE_KEY.test(String(dataInicial ?? ''))) throw new TypeError('Selecione o serviço e a data inicial.')
  const rows = await rpc('agenda_horarios_livres', {
    p_servico_id: servicoId,
    p_data_inicial: dataInicial,
    p_profissional_id: profissionalId || null,
    p_dias: dias,
    p_limite: limite,
  })
  return rows ?? []
}

export function criarClienteRapido({ nome, telefone = null }) {
  const cleanName = String(nome ?? '').trim()
  const cleanPhone = String(telefone ?? '').trim()
  if (cleanName.length < 2 || cleanName.length > 120) throw new TypeError('Informe o nome do cliente.')
  if (cleanPhone && (cleanPhone.length < 8 || cleanPhone.length > 30)) throw new TypeError('Informe um telefone válido.')
  return rpc('agenda_cliente_criar_rapido', { p_nome: cleanName, p_telefone: cleanPhone || null })
}

export function criarEncaixe({ clienteId, servicoId, profissionalId, inicio, valorFinal }) {
  if (!clienteId || !servicoId || !profissionalId || !inicio) throw new TypeError('Complete os dados do encaixe.')
  return rpc('agenda_encaixe_criar', {
    p_cliente_id: clienteId,
    p_servico_id: servicoId,
    p_profissional_id: profissionalId,
    p_inicio: inicio,
    p_valor_final: valorFinal == null ? null : Number(valorFinal),
  })
}

const ERRORS = {
  AGENDA_ENCAIXE_NAO_AUTORIZADO: 'Seu usuário não pode criar encaixes.',
  AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO: 'O acesso deste barbeiro está inativo ou sem vínculo.',
  AGENDA_ENCAIXE_FILTRO_INVALIDO: 'Revise o serviço e o período da busca.',
  AGENDA_SERVICO_INVALIDO: 'Selecione um serviço ativo.',
  AGENDA_PROFISSIONAL_INVALIDO: 'Selecione um barbeiro ativo.',
  AGENDA_CLIENTE_INVALIDO: 'Selecione ou cadastre o cliente.',
  AGENDA_TELEFONE_INVALIDO: 'Informe um telefone válido.',
  AGENDA_VALOR_INVALIDO: 'Informe um valor válido.',
  AGENDA_HORARIO_INDISPONIVEL: 'Este horário acabou de ser ocupado. Escolha uma das opções atualizadas.',
  AGENDA_HORARIO_OCUPADO: 'Este horário acabou de ser ocupado. Escolha outra opção.',
}

export function mensagemErroEncaixe(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  return { message: code ? ERRORS[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir o encaixe.', occupied: code === 'AGENDA_HORARIO_INDISPONIVEL' || code === 'AGENDA_HORARIO_OCUPADO' }
}
