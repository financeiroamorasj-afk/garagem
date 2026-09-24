const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export async function compactarFotoCorte(file, { maxDimension = 1280, maxBytes = 800 * 1024 } = {}) {
  if (!(file instanceof Blob) || !ACCEPTED.has(file.type)) throw new TypeError('Selecione uma foto JPG, PNG, WebP ou HEIC.')
  if (file.size > 15 * 1024 * 1024) throw new TypeError('A foto original pode ter no máximo 15 MB.')

  const decoded = await decodeImage(file)
  try {
    const baseScale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height))
    let width = Math.max(1, Math.round(decoded.width * baseScale))
    let height = Math.max(1, Math.round(decoded.height * baseScale))
    let quality = 0.82

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('Não foi possível preparar a foto.')
      context.fillStyle = '#111111'
      context.fillRect(0, 0, width, height)
      context.drawImage(decoded.source, 0, 0, width, height)

      let blob = await canvasBlob(canvas, 'image/webp', quality)
      let mime = 'image/webp'
      if (!blob || blob.type !== 'image/webp') {
        blob = await canvasBlob(canvas, 'image/jpeg', quality)
        mime = 'image/jpeg'
      }
      if (!blob) throw new Error('Não foi possível compactar a foto.')
      if (blob.size <= maxBytes) {
        return { blob, mime, width, height, originalBytes: file.size, bytes: blob.size }
      }
      if (quality > 0.58) quality -= 0.08
      else {
        width = Math.max(480, Math.round(width * 0.84))
        height = Math.max(480, Math.round(height * 0.84))
      }
    }
    throw new TypeError('A foto continuou muito grande após a compactação. Escolha outra imagem.')
  } finally {
    decoded.release()
  }
}

export function formatarTamanho(bytes) {
  if (!Number.isFinite(bytes)) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
