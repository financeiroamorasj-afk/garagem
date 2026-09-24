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

export async function concluirAtendimentoComCorte({ appointmentId, estilo, pentes, acabamento, barba, observacoes, preferencias, foto }) {
  if (!appointmentId || String(estilo ?? '').trim().length < 2) throw new TypeError('Informe como o corte foi realizado.')
  let uploadedPath = null
  try {
    if (foto) uploadedPath = await enviarFotoCorte({ clienteId: foto.clienteId, imagem: foto.imagem })
    return await rpc('barbeiro_atendimento_concluir', {
      p_agendamento_id: appointmentId,
      p_estilo: String(estilo).trim(),
      p_pentes: String(pentes ?? '').trim() || null,
      p_acabamento: String(acabamento ?? '').trim() || null,
      p_barba: String(barba ?? '').trim() || null,
      p_observacoes: String(observacoes ?? '').trim() || null,
      p_preferencias_cliente: String(preferencias ?? '').trim() || null,
      p_foto_path: uploadedPath,
      p_foto_mime: foto?.imagem.mime ?? null,
      p_foto_bytes: foto?.imagem.bytes ?? null,
      p_foto_largura: foto?.imagem.width ?? null,
      p_foto_altura: foto?.imagem.height ?? null,
    })
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
}

export function mensagemErroCorte(error) {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  const code = Object.keys(ERRORS).find((key) => detail.includes(key))
  if (code) return ERRORS[code]
  if (error instanceof TypeError) return error.message
  if (/storage|bucket|mime|payload|file size/i.test(detail)) return 'Não foi possível enviar a foto compactada. Tente novamente.'
  return 'Não foi possível concluir e registrar o corte.'
}
