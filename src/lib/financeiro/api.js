import { supabase } from '../supabase'
import { arredondarCentavos } from './moeda'
import { exigirChaveIdempotencia, exigirUuid, exigirValorPositivo, exigirPeriodo, exigirPaginacao, MOTIVOS_CREDITO, STATUS_PAGAR, STATUS_RECEBER } from './schemas'

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
