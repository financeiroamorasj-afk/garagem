import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('instalação do webapp é oferecida no login e nas áreas protegidas', async () => {
  const [prompt, login, protectedRoute, manifest, index] = await Promise.all([
    readFile(new URL('../src/components/InstallAppPrompt.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ProtectedRoute.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/site.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ])

  assert.match(prompt, /beforeinstallprompt/)
  assert.match(prompt, /Adicionar à Tela de Início/)
  assert.match(prompt, /Instalar app/)
  assert.match(login, /InstallAppPrompt/)
  assert.match(protectedRoute, /<InstallAppPrompt \/>/)
  assert.match(manifest, /"display": "standalone"/)
  assert.match(index, /apple-mobile-web-app-capable/)
  assert.match(index, /site\.webmanifest/)
})
