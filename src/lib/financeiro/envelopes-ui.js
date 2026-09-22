export function classificarEnvelope(envelope, account) {
  if (envelope.ativa === false) return { label: 'Inativo', variant: 'info' }
  if (Number(envelope.saldo_acumulado) <= 0) return { label: 'Sem saldo', variant: 'neutral' }
  if (Number(account?.saldo_disponivel) < 0 || (Number(account?.saldo_bancario) > 0 && Number(account?.saldo_reservado) / Number(account?.saldo_bancario) >= 0.75)) {
    return { label: 'Atenção', variant: 'warning' }
  }
  return { label: 'Disponível', variant: 'success' }
}

export function podeAdicionarReserva(envelope, account) {
  return Boolean(envelope?.ativa && account && Number(account.saldo_disponivel) > 0)
}

const ENVELOPE_ERRORS = {
  FINANCEIRO_NOME_ATIVO_EM_USO: 'Já existe um envelope ativo com esse nome.',
  FINANCEIRO_PERCENTUAL_TOTAL_EXCEDIDO: 'A soma dos percentuais dos envelopes ativos não pode ultrapassar 100%.',
  FINANCEIRO_DISPONIBILIDADE_CONTA_VINCULADA_INSUFICIENTE: 'A conta vinculada não possui saldo disponível suficiente. Registre uma transferência real em Contas antes de distribuir.',
  FINANCEIRO_SEM_LUCRO_DISTRIBUIVEL: 'Não há lucro distribuível para a data selecionada.',
  FINANCEIRO_DISTRIBUICAO_JA_REALIZADA: 'A distribuição desta data já foi realizada.',
  FINANCEIRO_CONFLITO_VERSAO: 'Este envelope foi alterado em outra sessão. Recarregue os dados antes de tentar novamente.',
  FINANCEIRO_ENVELOPE_COM_SALDO: 'Resgate todo o saldo antes de desativar este envelope.',
  FINANCEIRO_CONTA_ENVELOPE_COM_SALDO: 'Não é possível trocar a conta de um envelope que possui saldo.',
  FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE: 'A conta vinculada não possui saldo disponível suficiente para esta reserva.',
  FINANCEIRO_ENVELOPE_INATIVO: 'Este envelope está inativo e não pode receber reservas.',
  FINANCEIRO_ENVELOPE_NAO_ENCONTRADO: 'O envelope não foi encontrado. Recarregue os dados.',
  FINANCEIRO_VALOR_INVALIDO: 'Informe um valor maior que zero.',
  FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE: 'A tentativa anterior usou outros dados. Cancele e inicie uma nova operação.',
}

export function mensagemErroEnvelope(error) {
  const detail = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const known = Object.keys(ENVELOPE_ERRORS).find((code) => detail.includes(code))
  if (known) return { message: ENVELOPE_ERRORS[known], conflict: known === 'FINANCEIRO_CONFLITO_VERSAO' }
  if (/FINANCEIRO_SEM_PERMISSAO|permission|permissão|autoriz|admin|42501/i.test(detail)) return { message: 'Você não possui permissão administrativa para gerenciar envelopes.', conflict: false }
  return { message: 'Não foi possível concluir a operação. Tente novamente.', conflict: false }
}
