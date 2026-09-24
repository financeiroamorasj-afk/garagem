import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('login não consulta o Supabase dentro de onAuthStateChange', async () => {
  const login = await readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(login, /onAuthStateChange\(async/)
  assert.match(login, /signInWithPassword/)
  assert.match(login, /homeRouteForUser\(data\.user\.id\)/)
  assert.match(login, /navigate\(route, \{ replace: true \}\)/)
})
