import { createClient } from '@supabase/supabase-js'

const portalSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)

async function rpc(name, payload = {}) {
  const { data, error } = await portalSupabase.rpc(name, payload)
  if (error) throw error
  return data
}

export function portalSessionKey(slug) {
  return `garagem-portal:${String(slug ?? '').toLowerCase()}`
}

export function carregarBarbeariaPortal(slug) {
  return rpc('portal_barbearia_publica', { p_slug: slug })
}

export function acessarPortal(slug, cpf) {
  return rpc('portal_acessar', { p_slug: slug, p_cpf: cpf })
}

export function cadastrarNoPortal({ slug, cpf, nome, telefone }) {
  return rpc('portal_cadastrar', {
    p_slug: slug,
    p_cpf: cpf,
    p_nome: String(nome ?? '').trim(),
    p_telefone: String(telefone ?? '').trim(),
  })
}

export function carregarDadosPortal(token) {
  return rpc('portal_dados', { p_token: token })
}

export function listarHorariosPortal({ token, servicoId, dataInicial, profissionalId = null, dias = 14 }) {
  return rpc('portal_horarios_livres', {
    p_token: token,
    p_servico_id: servicoId,
    p_data_inicial: dataInicial,
    p_profissional_id: profissionalId || null,
    p_dias: dias,
    p_limite: 100,
  })
}

export function criarAgendamentoPortal({ token, servicoId, profissionalId, inicio }) {
  return rpc('portal_agendamento_criar', {
    p_token: token,
    p_servico_id: servicoId,
    p_profissional_id: profissionalId,
    p_inicio: inicio,
  })
}

export function cancelarAgendamentoPortal(token, agendamentoId) {
  return rpc('portal_agendamento_cancelar', { p_token: token, p_agendamento_id: agendamentoId })
}

export function atualizarPerfilPortal({ token, nome, telefone, barbeiroFavoritoId, notasPreferencias }) {
  return rpc('portal_perfil_atualizar', {
    p_token: token,
    p_nome: String(nome ?? '').trim(),
    p_telefone: String(telefone ?? '').trim(),
    p_barbeiro_favorito_id: barbeiroFavoritoId || null,
    p_notas_preferencias: String(notasPreferencias ?? '').trim() || null,
  })
}

export function encerrarPortal(token) {
  return rpc('portal_encerrar', { p_token: token })
}

const MESSAGES = {
  PORTAL_BARBEARIA_NAO_ENCONTRADA: 'Este portal não está disponível.',
  CLIENTE_CPF_INVALIDO: 'Informe um CPF válido.',
  PORTAL_SESSAO_INVALIDA: 'Sua sessão expirou. Entre novamente com seu CPF.',
  PORTAL_CLIENTE_NAO_ENCONTRADO: 'Não encontramos seu cadastro.',
  PORTAL_NOME_INVALIDO: 'Informe seu nome completo.',
  PORTAL_TELEFONE_INVALIDO: 'Informe um telefone com DDD.',
  PORTAL_PREFERENCIAS_INVALIDAS: 'As preferências podem ter no máximo 1.000 caracteres.',
  PORTAL_PERIODO_INVALIDO: 'Escolha uma data nos próximos 60 dias.',
  PORTAL_SERVICO_INVALIDO: 'Este serviço não está mais disponível.',
  PORTAL_PROFISSIONAL_INVALIDO: 'Este profissional não está mais disponível.',
  PORTAL_HORARIO_INDISPONIVEL: 'Esse horário acabou de ficar indisponível. Escolha outro.',
  PORTAL_AGENDAMENTO_NAO_CANCELAVEL: 'Este agendamento não pode mais ser cancelado pelo portal.',
}

export function erroPortal(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(MESSAGES).find((key) => detail.includes(key))
  return {
    code,
    expired: code === 'PORTAL_SESSAO_INVALIDA',
    message: code ? MESSAGES[code] : error instanceof TypeError ? error.message : 'Não foi possível concluir. Tente novamente.',
  }
}
