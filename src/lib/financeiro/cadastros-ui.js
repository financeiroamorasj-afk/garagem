const ERROR_MESSAGES = {
  FINANCEIRO_NOME_ATIVO_EM_USO: 'Já existe um cadastro ativo com esse nome.',
  FINANCEIRO_CONFLITO_VERSAO: 'Este cadastro foi alterado em outra sessão. Recarregue os dados antes de tentar novamente.',
  FINANCEIRO_CATEGORIA_COM_HISTORICO: 'Esta categoria possui histórico e não pode ter seu significado alterado. Desative-a e crie uma substituta.',
  FINANCEIRO_ULTIMA_CONTA_ATIVA: 'A última conta ativa não pode ser desativada.',
  FINANCEIRO_SUBSTITUTA_INVALIDA: 'Selecione outra conta ativa como principal substituta.',
  FINANCEIRO_CADASTRO_NAO_ENCONTRADO: 'O cadastro não foi encontrado ou não pertence à sua barbearia.',
}

export function mensagemErroCadastro(error) {
  const detail = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const known = Object.keys(ERROR_MESSAGES).find((code) => detail.includes(code))
  if (known) return { message: ERROR_MESSAGES[known], conflict: known === 'FINANCEIRO_CONFLITO_VERSAO' }
  if (/FINANCEIRO_SEM_PERMISSAO|permission|permissão|autoriz|admin|42501/i.test(detail)) return { message: 'Você não possui permissão administrativa para alterar cadastros financeiros.', conflict: false }
  return { message: 'Não foi possível concluir a operação. Tente novamente.', conflict: false }
}
