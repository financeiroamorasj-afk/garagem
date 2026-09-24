import { supabase } from '../supabase'

export const CUT_PHOTOS_BUCKET = 'cortes-clientes'

async function rpc(name, payload = {}) {
  const { data, error } = await supabase.rpc(name, payload)
  if (error) throw error
  return data
}

async function myTenantId() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session) throw new Error('CORTE_NAO_AUTORIZADO')
  const { data, error } = await supabase.from('profiles').select('barbearia_id').eq('id', session.user.id).single()
  if (error || !data?.barbearia_id) throw error ?? new Error('CORTE_NAO_AUTORIZADO')
  return data.barbearia_id
}

export async function enviarFotoCorte({ clienteId, imagem }) {
  if (!clienteId || !imagem?.blob || !imagem?.mime) throw new TypeError('Foto inválida.')
  const tenantId = await myTenantId()
  const extension = imagem.mime === 'image/webp' ? 'webp' : 'jpg'
  const path = `${tenantId}/${clienteId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(CUT_PHOTOS_BUCKET).upload(path, imagem.blob, {
    contentType: imagem.mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removerFotoCorte(path) {
  if (!path) return
  const { error } = await supabase.storage.from(CUT_PHOTOS_BUCKET).remove([path])
  if (error) throw error
}

export async function obterUrlFotoCorte(path, expiresIn = 900) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(CUT_PHOTOS_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data?.signedUrl ?? null
}

function montarMemoria({ estilo, pentes, acabamento, barba, observacoes, preferencias, foto, uploadedPath }) {
  const memoria = {
    estilo: String(estilo).trim(),
    pentes: String(pentes ?? '').trim() || null,
    acabamento: String(acabamento ?? '').trim() || null,
    barba: String(barba ?? '').trim() || null,
    observacoes: String(observacoes ?? '').trim() || null,
    preferencias_cliente: String(preferencias ?? '').trim() || null,
  }
  if (uploadedPath) Object.assign(memoria, {
    foto_path: uploadedPath,
    foto_mime: foto.imagem.mime,
    foto_bytes: foto.imagem.bytes,
    foto_largura: foto.imagem.width,
    foto_altura: foto.imagem.height,
  })
  return memoria
}

export async function concluirCheckoutAtendimento({
  appointmentId,
  estilo,
  pentes,
  acabamento,
  barba,
  observacoes,
  preferencias,
  foto,
  produtos = [],
  valorServico,
  desconto = 0,
  formaPagamento,
  taxa = 0,
  dataRecebimento,
  chaveIdempotencia,
}) {
  if (!appointmentId || String(estilo ?? '').trim().length < 2) throw new TypeError('Informe como o corte foi realizado.')
  if (!['dinheiro', 'pix', 'debito', 'credito', 'outro'].includes(formaPagamento)) throw new TypeError('Selecione a forma de pagamento.')
  if (!dataRecebimento || !chaveIdempotencia) throw new TypeError('Revise os dados do recebimento.')
  let uploadedPath = null
  try {
    if (foto) uploadedPath = await enviarFotoCorte({ clienteId: foto.clienteId, imagem: foto.imagem })
    const memoria = montarMemoria({ estilo, pentes, acabamento, barba, observacoes, preferencias, foto, uploadedPath })
    return await rpc('barbeiro_checkout_concluir', {
      p_agendamento_id: appointmentId,
      p_memoria: memoria,
      p_produtos: produtos.map(({ produtoId, quantidade }) => ({ produto_id: produtoId, quantidade: Number(quantidade) })),
      p_valor_servico: Number(valorServico),
      p_desconto: Number(desconto),
      p_forma_pagamento: formaPagamento,
      p_taxa: Number(taxa),
      p_data_recebimento: dataRecebimento,
      p_chave_idempotencia: chaveIdempotencia,
    })
  } catch (error) {
    if (uploadedPath) await removerFotoCorte(uploadedPath).catch(() => {})
    throw error
  }
}

export async function enviarAtendimentoRecepcao({
  appointmentId, estilo, pentes, acabamento, barba, observacoes, preferencias,
  foto, produtos = [], valorServico, chaveIdempotencia,
}) {
  if (!appointmentId || String(estilo ?? '').trim().length < 2) throw new TypeError('Informe como o corte foi realizado.')
  if (!chaveIdempotencia) throw new TypeError('Revise os dados do atendimento.')
  let uploadedPath = null
  try {
    if (foto) uploadedPath = await enviarFotoCorte({ clienteId: foto.clienteId, imagem: foto.imagem })
    const memoria = montarMemoria({ estilo, pentes, acabamento, barba, observacoes, preferencias, foto, uploadedPath })
    const result = await rpc('barbeiro_atendimento_enviar_recepcao', {
      p_agendamento_id: appointmentId,
      p_memoria: memoria,
      p_produtos: produtos.map(({ produtoId, quantidade }) => ({ produto_id: produtoId, quantidade: Number(quantidade) })),
      p_valor_servico: Number(valorServico),
      p_chave_idempotencia: chaveIdempotencia,
    })
    if (uploadedPath && result?.idempotente) await removerFotoCorte(uploadedPath).catch(() => {})
    return result
  } catch (error) {
    if (uploadedPath) await removerFotoCorte(uploadedPath).catch(() => {})
    throw error
  }
}

const ERRORS = {
  CORTE_NAO_AUTORIZADO: 'Seu usuário não pode registrar este corte.',
  CORTE_CLIENTE_NAO_AUTORIZADO: 'Este cliente não pertence à sua agenda.',
  CORTE_ESTILO_INVALIDO: 'Informe como o corte foi realizado.',
  CORTE_TEXTO_INVALIDO: 'Uma das anotações ultrapassou o limite permitido.',
  CORTE_AGENDAMENTO_NAO_ENCONTRADO: 'Este atendimento não foi encontrado na sua agenda.',
  CORTE_STATUS_INVALIDO: 'O atendimento foi alterado em outro dispositivo. Atualize a agenda.',
  CORTE_CLIENTE_OBRIGATORIO: 'Vincule um cliente antes de concluir este atendimento.',
  CORTE_FOTO_INVALIDA: 'A foto não passou pela validação de tamanho e formato.',
  CHECKOUT_NAO_AUTORIZADO: 'Seu usuário não pode fechar este atendimento.',
  CHECKOUT_STATUS_INVALIDO: 'O atendimento foi alterado em outro dispositivo. Atualize a agenda.',
  CHECKOUT_CLIENTE_OBRIGATORIO: 'Vincule um cliente antes de concluir este atendimento.',
  CHECKOUT_MEMORIA_INVALIDA: 'Revise os dados da memória do corte.',
  CHECKOUT_FOTO_INVALIDA: 'A foto não passou pela validação de tamanho e formato.',
  CHECKOUT_VALOR_INVALIDO: 'Revise o valor do serviço.',
  CHECKOUT_DESCONTO_INVALIDO: 'O desconto não pode ultrapassar o total da venda.',
  CHECKOUT_TAXA_INVALIDA: 'A taxa não pode ultrapassar o valor final.',
  CHECKOUT_PAGAMENTO_INVALIDO: 'Selecione a forma de pagamento.',
  CHECKOUT_DATA_RECEBIMENTO_INVALIDA: 'A data de recebimento não pode estar no passado.',
  CHECKOUT_ESTOQUE_INSUFICIENTE: 'Um dos produtos não possui estoque suficiente.',
  CHECKOUT_PRODUTO_NAO_ENCONTRADO: 'Um dos produtos não está mais disponível.',
  CHECKOUT_CONTA_NAO_CONFIGURADA: 'A barbearia precisa configurar uma conta financeira antes do fechamento.',
  CHECKOUT_USAR_RECEPCAO: 'A recepção está ativa. Envie o atendimento para a fila de cobrança.',
  FILA_RECEPCAO_NAO_AUTORIZADO: 'Seu usuário não pode enviar este atendimento à recepção.',
  FILA_RECEPCAO_MODULO_INATIVO: 'A recepção não está ativa nesta unidade. Atualize a tela e conclua o pagamento normalmente.',
  FILA_RECEPCAO_STATUS_INVALIDO: 'O atendimento foi alterado em outro dispositivo. Atualize a agenda.',
  FILA_RECEPCAO_CLIENTE_OBRIGATORIO: 'Vincule um cliente antes de enviar para cobrança.',
  FILA_RECEPCAO_MEMORIA_INVALIDA: 'Revise os dados da memória do corte.',
  FILA_RECEPCAO_FOTO_INVALIDA: 'A foto não passou pela validação de tamanho e formato.',
  FILA_RECEPCAO_VALOR_INVALIDO: 'Revise o valor do serviço.',
  FILA_RECEPCAO_ESTOQUE_INSUFICIENTE: 'Um dos produtos não possui estoque suficiente.',
  FILA_RECEPCAO_PRODUTO_NAO_ENCONTRADO: 'Um dos produtos não está mais disponível.',
}

export function mensagemErroCorte(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  if (code) return ERRORS[code]
  if (error instanceof TypeError) return error.message
  if (/storage|bucket|mime|payload|file size/i.test(detail)) return 'Não foi possível enviar a foto compactada. Tente novamente.'
  return 'Não foi possível concluir o checkout. Nenhuma baixa foi realizada.'
}
