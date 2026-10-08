import { supabase } from '../supabase'

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export const iniciarPareamentoTv = () => rpc('tv_pareamento_iniciar')
export const lerEstadoTv = (token) => rpc('tv_estado_ler', { p_token: token })
export const confirmarPareamentoTv = (codigo, nome) => rpc('tv_pareamento_confirmar', { p_codigo: codigo, p_nome: nome })
export const listarAparelhosTv = () => rpc('tv_aparelhos_listar')
export const listarPermissoesTv = () => rpc('tv_permissoes_listar')
export const definirPermissaoTv = (usuarioId, permitir) => rpc('tv_permissao_definir', { p_usuario_id: usuarioId, p_permitir: permitir })
export const definirVideoTv = (aparelhoId, videoId, playlistId, modo) => rpc('tv_video_definir', {
  p_aparelho_id: aparelhoId,
  p_video_id: videoId,
  p_playlist_id: playlistId,
  p_modo: modo,
})
export const revogarAparelhoTv = (aparelhoId) => rpc('tv_aparelho_revogar', { p_aparelho_id: aparelhoId })

export function identificarYoutube(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { videoId: null, playlistId: null }
  let url
  try { url = new URL(raw) } catch { throw new TypeError('Cole um link válido do YouTube.') }
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    throw new TypeError('Use um link do YouTube.')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  const playlistId = url.searchParams.get('list')
  let videoId = host === 'youtu.be' ? parts[0] : url.searchParams.get('v')
  if (!videoId && ['embed', 'shorts', 'live'].includes(parts[0])) videoId = parts[1]
  const valid = (id) => /^[A-Za-z0-9_-]{6,80}$/.test(String(id ?? ''))
  if (videoId && !valid(videoId)) videoId = null
  if (playlistId && !valid(playlistId)) throw new TypeError('A playlist do YouTube é inválida.')
  if (!videoId && !playlistId) throw new TypeError('Link sem vídeo ou playlist reconhecível.')
  return { videoId: videoId || null, playlistId: playlistId || null }
}

export function youtubeUrl(videoId, playlistId) {
  if (videoId) {
    const url = new URL('https://www.youtube.com/watch')
    url.searchParams.set('v', videoId)
    if (playlistId) url.searchParams.set('list', playlistId)
    return url.toString()
  }
  return playlistId ? `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}` : ''
}

export function mensagemErroTv(error) {
  const message = String(error?.message || error || '')
  if (message.includes('TV_SEM_PERMISSAO')) return 'Você não tem permissão para controlar o Modo TV.'
  if (message.includes('TV_CODIGO_EXPIRADO')) return 'Código inválido ou vencido. Gere outro na TV.'
  if (message.includes('TV_APARELHO_NAO_ENCONTRADO')) return 'Esta TV não está mais conectada.'
  return 'Não foi possível concluir a ação. Tente novamente.'
}
