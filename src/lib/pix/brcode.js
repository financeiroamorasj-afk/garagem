const encoder = new TextEncoder()

function tamanhoUtf8(value) {
  return encoder.encode(value).length
}

function campo(id, value) {
  const texto = String(value)
  const tamanho = tamanhoUtf8(texto)
  if (tamanho > 99) throw new TypeError(`Campo PIX ${id} excede o limite do BR Code.`)
  return `${id}${String(tamanho).padStart(2, '0')}${texto}`
}

function textoBrCode(value, maxLength, label) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
  if (normalized.length < 2) throw new TypeError(`${label} PIX inválido.`)
  return normalized
}

export function normalizarChavePix(value) {
  const chave = String(value ?? '').trim()
  if (!chave || tamanhoUtf8(chave) > 77) throw new TypeError('Informe uma chave PIX válida.')
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)) return chave.toLowerCase()
  if (/^\+[1-9]\d{9,14}$/.test(chave)) return chave
  const digits = chave.replace(/\D/g, '')
  if ((digits.length === 11 || digits.length === 14) && /^[\d.()\s\-/]+$/.test(chave)) return digits
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chave)) return chave.toLowerCase()
  throw new TypeError('Informe uma chave PIX válida. Use e-mail, telefone com +55, CPF, CNPJ ou chave aleatória.')
}

export function normalizarBeneficiarioPix(value) {
  return textoBrCode(value, 25, 'Nome do beneficiário')
}

export function normalizarCidadePix(value) {
  return textoBrCode(value, 15, 'Cidade')
}

export function crc16Pix(value) {
  let crc = 0xffff
  for (const byte of encoder.encode(value)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function gerarPayloadPix({ chave, beneficiario, cidade, valor, txid = '***' }) {
  const chaveNormalizada = normalizarChavePix(chave)
  const nomeNormalizado = normalizarBeneficiarioPix(beneficiario)
  const cidadeNormalizada = normalizarCidadePix(cidade)
  const valorNumerico = Number(valor)
  if (!Number.isFinite(valorNumerico) || valorNumerico <= 0 || valorNumerico > 99999999.99) throw new TypeError('Valor PIX inválido.')
  const txidNormalizado = String(txid || '***').toUpperCase().replace(/[^A-Z0-9*]/g, '').slice(0, 25) || '***'
  const contaPix = campo('00', 'BR.GOV.BCB.PIX') + campo('01', chaveNormalizada)
  const payloadSemCrc = [
    campo('00', '01'),
    campo('26', contaPix),
    campo('52', '0000'),
    campo('53', '986'),
    campo('54', valorNumerico.toFixed(2)),
    campo('58', 'BR'),
    campo('59', nomeNormalizado),
    campo('60', cidadeNormalizada),
    campo('62', campo('05', txidNormalizado)),
    '6304',
  ].join('')
  return payloadSemCrc + crc16Pix(payloadSemCrc)
}
