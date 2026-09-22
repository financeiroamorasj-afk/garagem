const ERROR_MESSAGES = {
  FINANCEIRO_CONFLITO_VERSAO: 'Este título foi alterado em outra sessão. Recarregue os dados antes de tentar novamente.',
  FINANCEIRO_TITULO_NAO_ENCONTRADO: 'O título não foi encontrado ou não pertence à sua barbearia.',
  FINANCEIRO_TITULO_NAO_MANUAL: 'Somente lançamentos manuais podem ser editados ou cancelados nesta tela.',
  FINANCEIRO_TITULO_NAO_EDITAVEL: 'Este título já foi liquidado ou cancelado e não pode mais ser editado.',
  FINANCEIRO_TITULO_NAO_CANCELAVEL: 'Este título já foi liquidado ou cancelado e não pode mais ser cancelado.',
  FINANCEIRO_TITULO_COM_RESERVA: 'Estorne o resgate do envelope antes de alterar este título.',
  FINANCEIRO_CATEGORIA_INVALIDA: 'Selecione uma categoria ativa compatível com o tipo do lançamento.',
  FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE: 'A tentativa anterior usou outros dados. Feche o formulário e crie uma nova intenção.',
}

export function mensagemErroTitulo(error) {
  const detail = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const known = Object.keys(ERROR_MESSAGES).find((code) => detail.includes(code))
  if (known) return { message: ERROR_MESSAGES[known], conflict: known === 'FINANCEIRO_CONFLITO_VERSAO' }
  if (/FINANCEIRO_SEM_PERMISSAO|permission|permissão|autoriz|admin|42501/i.test(detail)) {
    return { message: 'Você não possui permissão administrativa para alterar títulos financeiros.', conflict: false }
  }
  return { message: 'Não foi possível concluir a operação. Tente novamente.', conflict: false }
}
