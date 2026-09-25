import { supabase } from '../supabase'

export const BARBERSHOP_LOGOS_BUCKET = 'barbearias-logos'

export async function carregarIdentidadeBarbearia() {
  const { data, error } = await supabase
    .from('barbearias')
    .select('id,nome,slug,logo_url')
    .single()
  if (error) throw error
  return data
}

export async function salvarLogoBarbearia(imagem) {
  if (!imagem?.blob || !imagem?.mime) throw new TypeError('Logo inválido.')
  const barbearia = await carregarIdentidadeBarbearia()
  const path = `${barbearia.id}/logo`
  const { error: uploadError } = await supabase.storage.from(BARBERSHOP_LOGOS_BUCKET).upload(path, imagem.blob, {
    contentType: imagem.mime,
    cacheControl: '3600',
    upsert: true,
  })
  if (uploadError) throw uploadError

  const { data: publicData } = supabase.storage.from(BARBERSHOP_LOGOS_BUCKET).getPublicUrl(path)
  const publicUrl = `${publicData.publicUrl}?v=${Date.now()}`
  const { data, error } = await supabase
    .from('barbearias')
    .update({ logo_url: publicUrl })
    .eq('id', barbearia.id)
    .select('id,nome,slug,logo_url')
    .single()
  if (error) throw error
  return data
}

export async function removerLogoBarbearia() {
  const barbearia = await carregarIdentidadeBarbearia()
  const path = `${barbearia.id}/logo`
  const { error: storageError } = await supabase.storage.from(BARBERSHOP_LOGOS_BUCKET).remove([path])
  if (storageError && !/not found/i.test(storageError.message ?? '')) throw storageError
  const { data, error } = await supabase
    .from('barbearias')
    .update({ logo_url: null })
    .eq('id', barbearia.id)
    .select('id,nome,slug,logo_url')
    .single()
  if (error) throw error
  return data
}

export function mensagemErroIdentidade(error) {
  if (error instanceof TypeError) return error.message
  if (/storage|bucket|mime|payload|file size|row-level security/i.test([error?.message, error?.details].filter(Boolean).join(' '))) {
    return 'Não foi possível salvar o logo. Verifique a imagem e tente novamente.'
  }
  return 'Não foi possível atualizar a identidade da barbearia.'
}
