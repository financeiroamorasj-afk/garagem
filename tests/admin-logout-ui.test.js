import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('painel administrativo permite encerrar a sessão no desktop e no celular', async () => {
  const layout = await readFile(
    new URL('../src/components/layout/AdminLayout.jsx', import.meta.url),
    'utf8',
  )

  assert.match(layout, /await supabase\.auth\.signOut\(\)/)
  assert.match(layout, /navigate\('\/login', \{ replace: true \}\)/)
  assert.match(layout, /Sair do aplicativo/)
  assert.match(layout, /signingOut \? 'Saindo\.\.\.' : 'Sair'/)
  assert.match(layout, /onSignOut=\{handleSignOut\}/)
  assert.match(layout, /Sair e voltar ao login/)
})
