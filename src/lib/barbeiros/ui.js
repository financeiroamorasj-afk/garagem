const messages = {
  BARBEIROS_NAO_AUTORIZADO: 'Seu usuário não possui permissão para gerenciar barbeiros.',
  BARBEIROS_DADOS_INVALIDOS: 'Revise os dados informados.',
  BARBEIROS_NOME_INVALIDO: 'Informe um nome válido.',
  BARBEIROS_EMAIL_INVALIDO: 'Informe um e-mail válido.',
  BARBEIROS_APELIDO_INVALIDO: 'Informe um apelido válido.',
  BARBEIROS_TELEFONE_INVALIDO: 'Informe um telefone válido.',
  BARBEIROS_ESPECIALIDADE_INVALIDA: 'Informe uma especialidade válida.',
  BARBEIROS_COMISSAO_INVALIDA: 'A comissão deve ficar entre 0% e 100%.',
  BARBEIROS_COMISSAO_PRODUTOS_INVALIDA: 'A comissão de produtos deve ficar entre 0% e 100%.',
  BARBEIROS_EMAIL_EM_USO: 'Este e-mail já está vinculado a outro usuário.',
  BARBEIROS_ACESSO_JA_CRIADO: 'Este barbeiro já possui um usuário de acesso.',
  BARBEIROS_CONVITE_FALHOU: 'Não foi possível enviar o convite de acesso. Tente novamente.',
  BARBEIROS_CADASTRO_FALHOU: 'Não foi possível concluir o cadastro do barbeiro.',
  BARBEIROS_NAO_ENCONTRADO: 'O cadastro não foi encontrado ou foi removido.',
  BARBEIROS_CONFLITO_VERSAO: 'Este cadastro foi alterado em outra sessão. Recarregue antes de tentar novamente.',
}

export function mensagemErroBarbeiro(error) {
  const raw = String(error?.message ?? error ?? '')
  const code = Object.keys(messages).find((item) => raw.includes(item))
  if (code) return { code, message: messages[code], conflict: code === 'BARBEIROS_CONFLITO_VERSAO' }
  if (error instanceof TypeError) return { code: 'VALIDACAO', message: error.message, conflict: false }
  return { code: 'DESCONHECIDO', message: 'Ocorreu um erro ao processar o cadastro. Tente novamente.', conflict: false }
}
