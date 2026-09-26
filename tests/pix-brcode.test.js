import assert from 'node:assert/strict'
import test from 'node:test'
import { crc16Pix, gerarPayloadPix, normalizarChavePix } from '../src/lib/pix/brcode.js'

test('BR Code PIX estático inclui valor, chave e CRC válido', () => {
  const payload = gerarPayloadPix({ chave: '51992433413', beneficiario: 'Garagem Local', cidade: 'Porto Alegre', valor: 85 })
  assert.match(payload, /^00020126\d{2}0014BR\.GOV\.BCB\.PIX01\d{2}51992433413/)
  assert.match(payload, /540585\.00/)
  assert.match(payload, /6304[0-9A-F]{4}$/)
  assert.equal(payload.slice(-4), crc16Pix(payload.slice(0, -4)))
})

test('normaliza os formatos de chave aceitos e rejeita chave ambígua', () => {
  assert.equal(normalizarChavePix('(51) 99243-3413'), '51992433413')
  assert.equal(normalizarChavePix('cliente@garagemsystem.com.br'), 'cliente@garagemsystem.com.br')
  assert.throws(() => normalizarChavePix('chave sem formato'), /chave PIX válida/)
})
