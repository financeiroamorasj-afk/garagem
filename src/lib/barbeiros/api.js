import { supabase } from '../supabase'

export const BARBER_PHOTOS_BUCKET = 'barbeiros-fotos'

function text(value, label, min, max) {
  const normalized = String(value ?? '').trim()
  if (normalized.length < min || normalized.length > max) throw new TypeError(`${label} inválido`)
  return normalized
}

function optionalText(value, label, max) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (normalized.length > max) throw new TypeError(`${label} inválido`)
  return normalized
}

function commission(value) {
  if (value === '' || value === null || value === undefined) return null
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) throw new TypeError('Comissão inválida')
  return Math.round(normalized * 100) / 100
}

function barberPayload(input) {
  const apelido = optionalText(input.apelido, 'Apelido', 60)
  const telefone = optionalText(input.telefone, 'Telefone', 30)
  if (apelido && apelido.length < 2) throw new TypeError('Apelido inválido')
  if (telefone && telefone.length < 8) throw new TypeError('Telefone inválido')
  return {
    nome: text(input.nome, 'Nome', 2, 120),
    apelido,
    telefone,
    especialidade: optionalText(input.especialidade, 'Especialidade', 100),
    comissao_percentual: commission(input.comissao_percentual),
    comissao_produtos_percentual: commission(input.comissao_produtos_percentual),
  }
}

async function functionErrorCode(error) {
  try {
    const payload = await error?.context?.json?.()
    return payload?.code || error?.message
  } catch {
    return error?.message
  }
}

export async function listarBarbeiros({ incluirInativos = false } = {}) {
  const { data, error } = await supabase.rpc('barbeiros_listar', {
    p_incluir_inativos: Boolean(incluirInativos),
  })
  if (error) throw error
  return data ?? []
}

export async function criarBarbeiroComAcesso(input) {
  const payload = barberPayload(input)
  const email = String(input.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new TypeError('E-mail inválido')

  const { data, error } = await supabase.functions.invoke('create-barber', {
    body: { ...payload, email, profissional_id: input.id || null },
  })
  if (error) throw new Error((await functionErrorCode(error)) || 'BARBEIROS_CONVITE_FALHOU')
  return data
}

export async function reenviarConviteBarbeiro(profissionalId) {
  if (!profissionalId) throw new TypeError('Cadastro de barbeiro inválido')
  const { data, error } = await supabase.functions.invoke('resend-barber-invite', {
    body: { profissional_id: profissionalId },
  })
  if (error) throw new Error((await functionErrorCode(error)) || 'BARBEIROS_CONVITE_FALHOU')
  return data
}

export async function atualizarBarbeiro(input) {
  const payload = barberPayload(input)
  if (!input.id || !input.expectedUpdatedAt || typeof input.ativo !== 'boolean') throw new TypeError('Cadastro de barbeiro inválido')

  const { data, error } = await supabase.rpc('barbeiros_atualizar', {
    p_profissional_id: input.id,
    p_nome: payload.nome,
    p_apelido: payload.apelido,
    p_telefone: payload.telefone,
    p_especialidade: payload.especialidade,
    p_comissao_percentual: payload.comissao_percentual,
    p_comissao_produtos_percentual: payload.comissao_produtos_percentual,
    p_ativo: input.ativo,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
  if (error) throw error
  return data
}

async function carregarBarbeariaAtual() {
  const { data, error } = await supabase.from('barbearias').select('id').single()
  if (error) throw error
  return data
}

export async function salvarFotoBarbeiro(profissionalId, imagem) {
  if (!profissionalId || !imagem?.blob || !imagem?.mime) throw new TypeError('Foto do barbeiro inválida')
  const barbearia = await carregarBarbeariaAtual()
  const path = `${barbearia.id}/${profissionalId}/perfil`
  const { error: uploadError } = await supabase.storage.from(BARBER_PHOTOS_BUCKET).upload(path, imagem.blob, {
    contentType: imagem.mime,
    cacheControl: '3600',
    upsert: true,
  })
  if (uploadError) throw uploadError

  const { data: publicData } = supabase.storage.from(BARBER_PHOTOS_BUCKET).getPublicUrl(path)
  const fotoUrl = `${publicData.publicUrl}?v=${Date.now()}`
  const { data, error } = await supabase
    .from('profissionais')
    .update({ foto_url: fotoUrl })
    .eq('id', profissionalId)
    .eq('barbearia_id', barbearia.id)
    .select('id,foto_url,updated_at')
    .single()
  if (error) throw error
  return data
}

export async function removerFotoBarbeiro(profissionalId) {
  if (!profissionalId) throw new TypeError('Cadastro de barbeiro inválido')
  const barbearia = await carregarBarbeariaAtual()
  const path = `${barbearia.id}/${profissionalId}/perfil`
  const { data, error } = await supabase
    .from('profissionais')
    .update({ foto_url: null })
    .eq('id', profissionalId)
    .eq('barbearia_id', barbearia.id)
    .select('id,foto_url,updated_at')
    .single()
  if (error) throw error
  const { error: storageError } = await supabase.storage.from(BARBER_PHOTOS_BUCKET).remove([path])
  if (storageError && !/not found/i.test(storageError.message ?? '')) throw storageError
  return data
}

export const validarBarbeiro = barberPayload
