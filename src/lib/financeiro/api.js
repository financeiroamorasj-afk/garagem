import { supabase } from '../supabase'
import { arredondarCentavos } from './moeda'
import { exigirChaveIdempotencia, exigirUuid, exigirValorPositivo, exigirPeriodo, exigirPaginacao, exigirTexto, textoOpcional, exigirOpcao, exigirValorMonetario, exigirBooleano, exigirPercentualOpcional, exigirDataBrtNaoFutura, exigirVersao, exigirData, MOTIVOS_CREDITO, STATUS_PAGAR, STATUS_RECEBER, TIPOS_CONTA, TIPOS_CATEGORIA, GRUPOS_DRE, FINALIDADES_ENVELOPE } from './schemas'

async function executarRpc(nome, payload) {
  const { data, error } = await supabase.rpc(nome, payload)
  if (error) throw error
  return data
}

export function pagarConta({ contaPagarId, contaBancariaId, data, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_pagar_conta', {
    p_conta_pagar_id: exigirUuid(contaPagarId, 'Conta a pagar'), p_conta_bancaria_id: exigirUuid(contaBancariaId, 'Conta bancária'), p_data: data,
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: correlationId ?? null,
  })
}

export function receberConta({ contaReceberId, contaBancariaId, data, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_receber_conta', {
    p_conta_receber_id: exigirUuid(contaReceberId, 'Conta a receber'), p_conta_bancaria_id: exigirUuid(contaBancariaId, 'Conta bancária'), p_data: data,
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: correlationId ?? null,
  })
}

export function estornarCheckout({ fechamentoId, motivo }) {
  return executarRpc('admin_checkout_estornar', {
    p_fechamento_id: exigirUuid(fechamentoId, 'Fechamento'),
    p_motivo: exigirTexto(motivo, 'Motivo', 3, 500),
  })
}

export function transferir({ origemId, destinoId, valor, data, idempotencyKey, correlationId }) {
  const valorValidado = arredondarCentavos(exigirValorPositivo(valor, 'Valor da transferência'))
  exigirValorPositivo(valorValidado, 'Valor da transferência')
  return executarRpc('financeiro_transferir', {
    p_origem_id: exigirUuid(origemId, 'Conta de origem'), p_destino_id: exigirUuid(destinoId, 'Conta de destino'), p_valor: valorValidado, p_data: data,
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: correlationId ?? null,
  })
}

export function movimentarCredito({ clienteId, motivo, valor, origem, idempotencyKey, referenciaExterna, correlationId }) {
  if (!MOTIVOS_CREDITO.includes(motivo)) throw new TypeError('Motivo de crédito inválido')
  return executarRpc('financeiro_credito_movimentar', {
    p_cliente_id: exigirUuid(clienteId, 'Cliente'), p_motivo: motivo, p_valor: arredondarCentavos(exigirValorPositivo(valor, 'Valor do crédito')), p_origem: String(origem ?? '').trim(),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey),
    p_referencia_externa: referenciaExterna ?? null, p_correlation_id: correlationId ?? null,
  })
}

export function obterResumoPeriodo({ dataInicio, dataFim }) {
  const periodo = exigirPeriodo(dataInicio, dataFim)
  return executarRpc('financeiro_resumo_periodo', { p_data_inicio: periodo.inicio, p_data_fim: periodo.fim })
}

export function listarCategorias() {
  return executarRpc('financeiro_listar_categorias', {})
}

export function listarContasBancarias() {
  return executarRpc('financeiro_listar_contas_bancarias', {})
}

export function listarContasBancariasCadastro({ incluirInativas = false } = {}) {
  return executarRpc('financeiro_listar_contas_bancarias_cadastro', { p_incluir_inativas: exigirBooleano(incluirInativas, 'Filtro de contas inativas') })
}

export function listarCategoriasCadastro({ incluirInativas = false } = {}) {
  return executarRpc('financeiro_listar_categorias_cadastro', { p_incluir_inativas: exigirBooleano(incluirInativas, 'Filtro de categorias inativas') })
}

export function criarContaBancaria({ nome, instituicao, tipo, saldoInicial, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_criar_conta_bancaria', {
    p_nome: exigirTexto(nome, 'Nome'), p_instituicao: textoOpcional(instituicao, 'Instituição'),
    p_tipo: exigirOpcao(tipo, TIPOS_CONTA, 'Tipo da conta'), p_saldo_inicial: arredondarCentavos(exigirValorMonetario(saldoInicial, 'Saldo inicial')),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function editarContaBancaria({ contaId, nome, instituicao, tipo, expectedUpdatedAt, correlationId }) {
  return executarRpc('financeiro_editar_conta_bancaria', {
    p_conta_id: exigirUuid(contaId, 'Conta bancária'), p_nome: exigirTexto(nome, 'Nome'), p_instituicao: textoOpcional(instituicao, 'Instituição'),
    p_tipo: exigirOpcao(tipo, TIPOS_CONTA, 'Tipo da conta'), p_expected_updated_at: exigirTexto(expectedUpdatedAt, 'Versão', 1, 100),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function definirContaPrincipal({ contaId, correlationId }) {
  return executarRpc('financeiro_definir_conta_principal', { p_conta_id: exigirUuid(contaId, 'Conta bancária'), p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200) })
}

export function definirContaAtiva({ contaId, ativa, contaSubstitutaId = null, correlationId }) {
  if (typeof ativa !== 'boolean') throw new TypeError('Situação da conta inválida')
  return executarRpc('financeiro_definir_conta_ativa', {
    p_conta_id: exigirUuid(contaId, 'Conta bancária'), p_ativa: ativa,
    p_conta_substituta_id: contaSubstitutaId === null ? null : exigirUuid(contaSubstitutaId, 'Conta substituta'),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function criarCategoria({ nome, tipo, grupoDre, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_criar_categoria', {
    p_nome: exigirTexto(nome, 'Nome'), p_tipo: exigirOpcao(tipo, TIPOS_CATEGORIA, 'Tipo da categoria'),
    p_grupo_dre: exigirOpcao(grupoDre, GRUPOS_DRE, 'Grupo DRE'), p_idempotency_key: exigirChaveIdempotencia(idempotencyKey),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function editarCategoria({ categoriaId, nome, tipo, grupoDre, expectedUpdatedAt, correlationId }) {
  return executarRpc('financeiro_editar_categoria', {
    p_categoria_id: exigirUuid(categoriaId, 'Categoria'), p_nome: exigirTexto(nome, 'Nome'), p_tipo: exigirOpcao(tipo, TIPOS_CATEGORIA, 'Tipo da categoria'),
    p_grupo_dre: exigirOpcao(grupoDre, GRUPOS_DRE, 'Grupo DRE'), p_expected_updated_at: exigirTexto(expectedUpdatedAt, 'Versão', 1, 100),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function definirCategoriaAtiva({ categoriaId, ativa, correlationId }) {
  if (typeof ativa !== 'boolean') throw new TypeError('Situação da categoria inválida')
  return executarRpc('financeiro_definir_categoria_ativa', {
    p_categoria_id: exigirUuid(categoriaId, 'Categoria'), p_ativa: ativa, p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function listarTitulos({ tipo, dataInicio, dataFim, status = null, ordenarPor = 'data', direcao = 'asc', pagina = 1, porPagina = 25 }) {
  if (!['pagar', 'receber'].includes(tipo)) throw new TypeError('Tipo de título inválido')
  const statuses = tipo === 'pagar' ? STATUS_PAGAR : STATUS_RECEBER
  if (status !== null && !statuses.includes(status)) throw new TypeError('Status de título inválido')
  if (!['data', 'descricao', 'valor', 'status'].includes(ordenarPor) || !['asc', 'desc'].includes(direcao)) throw new TypeError('Ordenação inválida')
  const periodo = exigirPeriodo(dataInicio, dataFim)
  const paginacao = exigirPaginacao(pagina, porPagina)
  return executarRpc('financeiro_listar_titulos', {
    p_tipo: tipo, p_data_inicio: periodo.inicio, p_data_fim: periodo.fim, p_status: status,
    p_ordenar_por: ordenarPor, p_direcao: direcao, p_pagina: paginacao.pagina, p_por_pagina: paginacao.porPagina,
  })
}

function normalizarTituloManual({ tipo, descricao, valor, taxa = 0, dataEvento, dataCompetencia, metodoPagamento = null, categoriaId = null }) {
  const tipoValidado = exigirOpcao(tipo, ['pagar', 'receber'], 'Tipo do título')
  const valorValidado = arredondarCentavos(exigirValorPositivo(valor, 'Valor'))
  exigirValorPositivo(valorValidado, 'Valor')
  const taxaValidada = arredondarCentavos(exigirValorMonetario(taxa, 'Taxa'))
  if (taxaValidada < 0 || taxaValidada > valorValidado) throw new TypeError('Taxa inválida')
  if (tipoValidado === 'pagar' && taxaValidada !== 0) throw new TypeError('Conta a pagar não aceita taxa de recebimento')

  return {
    p_tipo: tipoValidado,
    p_descricao: exigirTexto(descricao, 'Descrição', 2, 200),
    p_valor: valorValidado,
    p_taxa: taxaValidada,
    p_data_evento: exigirData(dataEvento, tipoValidado === 'pagar' ? 'Data de vencimento' : 'Data de previsão'),
    p_data_competencia: exigirData(dataCompetencia, 'Data de competência'),
    p_metodo_pagamento: tipoValidado === 'receber' ? exigirTexto(metodoPagamento, 'Método de pagamento', 2, 50) : null,
    p_categoria_id: categoriaId ? exigirUuid(categoriaId, 'Categoria') : null,
  }
}

export function criarTituloManual({ idempotencyKey, correlationId, ...titulo }) {
  return executarRpc('financeiro_criar_titulo_manual', {
    ...normalizarTituloManual(titulo),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function editarTituloManual({ tituloId, expectedUpdatedAt, correlationId, ...titulo }) {
  return executarRpc('financeiro_editar_titulo_manual', {
    ...normalizarTituloManual(titulo),
    p_titulo_id: exigirUuid(tituloId, 'Título'),
    p_expected_updated_at: exigirVersao(expectedUpdatedAt),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function cancelarTituloManual({ tipo, tituloId, expectedUpdatedAt, motivo, correlationId }) {
  return executarRpc('financeiro_cancelar_titulo_manual', {
    p_tipo: exigirOpcao(tipo, ['pagar', 'receber'], 'Tipo do título'),
    p_titulo_id: exigirUuid(tituloId, 'Título'),
    p_expected_updated_at: exigirVersao(expectedUpdatedAt),
    p_motivo: exigirTexto(motivo, 'Motivo', 2, 200),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function listarEnvelopes({ incluirInativos = false } = {}) {
  return executarRpc('financeiro_listar_envelopes', {
    p_incluir_inativos: exigirBooleano(incluirInativos, 'Filtro de envelopes inativos'),
  })
}

export function listarSaldosDisponiveisContas() {
  return executarRpc('financeiro_saldos_disponiveis_contas', {})
}

export function normalizarValorAporte(valor) {
  try {
    const valorValidado = arredondarCentavos(exigirValorPositivo(valor, 'Valor da reserva'))
    return exigirValorPositivo(valorValidado, 'Valor da reserva')
  } catch {
    throw new TypeError('FINANCEIRO_VALOR_INVALIDO')
  }
}

export function aportarEnvelope({ envelopeId, valor, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_aportar_envelope', {
    p_envelope_id: exigirUuid(envelopeId, 'Envelope'),
    p_valor: normalizarValorAporte(valor),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function listarTransacoesEnvelope({ envelopeId, dataInicio, dataFim, pagina = 1, porPagina = 25 }) {
  const periodo = exigirPeriodo(dataInicio, dataFim)
  const paginacao = exigirPaginacao(pagina, porPagina)
  return executarRpc('financeiro_listar_transacoes_envelope', {
    p_envelope_id: exigirUuid(envelopeId, 'Envelope'),
    p_data_inicio: periodo.inicio,
    p_data_fim: periodo.fim,
    p_pagina: paginacao.pagina,
    p_por_pagina: paginacao.porPagina,
  })
}

export function criarEnvelope({ contaBancariaId, nome, finalidade, percentual, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_criar_envelope', {
    p_conta_bancaria_id: exigirUuid(contaBancariaId, 'Conta bancária'), p_nome: exigirTexto(nome, 'Nome'),
    p_finalidade: exigirOpcao(finalidade, FINALIDADES_ENVELOPE, 'Finalidade'), p_percentual: exigirPercentualOpcional(percentual),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function editarEnvelope({ envelopeId, contaBancariaId, nome, finalidade, percentual, expectedUpdatedAt, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_editar_envelope', {
    p_envelope_id: exigirUuid(envelopeId, 'Envelope'), p_conta_bancaria_id: exigirUuid(contaBancariaId, 'Conta bancária'),
    p_nome: exigirTexto(nome, 'Nome'), p_finalidade: exigirOpcao(finalidade, FINALIDADES_ENVELOPE, 'Finalidade'),
    p_percentual: exigirPercentualOpcional(percentual), p_expected_updated_at: exigirVersao(expectedUpdatedAt),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function definirEnvelopeAtivo({ envelopeId, ativo, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_definir_envelope_ativo', {
    p_envelope_id: exigirUuid(envelopeId, 'Envelope'), p_ativo: exigirBooleano(ativo, 'Situação do envelope'),
    p_idempotency_key: exigirChaveIdempotencia(idempotencyKey), p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}

export function simularDistribuicaoEnvelopes({ data, hojeBrt }) {
  return executarRpc('financeiro_simular_distribuicao_diaria', { p_data: exigirDataBrtNaoFutura(data, hojeBrt) })
}

export function distribuirEnvelopesDiario({ data, hojeBrt, idempotencyKey, correlationId }) {
  return executarRpc('financeiro_distribuir_envelopes_diario', {
    p_data: exigirDataBrtNaoFutura(data, hojeBrt), p_idempotency_key: exigirChaveIdempotencia(idempotencyKey),
    p_correlation_id: textoOpcional(correlationId, 'Correlation ID', 200),
  })
}
