import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { criarLinkPortal, criarMensagemPortal } from '../src/lib/portal/share.js'

test('gestor recebe link completo e mensagem pronta do portal da própria barbearia', async () => {
  const [settings, card] = await Promise.all([
    readFile(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/ClientPortalShareCard.jsx', import.meta.url), 'utf8'),
  ])

  const portalUrl = criarLinkPortal('Barbearia-Teste', 'https://app.garagemsystem.com.br')
  const message = criarMensagemPortal({ nomeBarbearia: 'Barbearia Teste', portalUrl })

  assert.equal(portalUrl, 'https://app.garagemsystem.com.br/portal/barbearia-teste')
  assert.match(message, /agenda online da Barbearia Teste/)
  assert.match(message, /https:\/\/app\.garagemsystem\.com\.br\/portal\/barbearia-teste/)
  assert.match(message, /primeiro acesso.*CPF/s)
  assert.match(settings, /ClientPortalShareCard barbearia=\{identity\}/)
  assert.match(card, /navigator\.clipboard\.writeText\(value\)/)
  assert.match(card, /Copiar link/)
  assert.match(card, /Copiar mensagem/)
})

test('link do portal não é produzido sem um slug válido', () => {
  assert.equal(criarLinkPortal('', 'https://app.garagemsystem.com.br'), '')
  assert.equal(criarLinkPortal('../outra-rota', 'https://app.garagemsystem.com.br'), '')
})
