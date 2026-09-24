import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('portal público é mobile-first e cobre acesso, agenda, histórico, equipe e perfil', async () => {
  const [app, page, api, migration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/portal/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923230000_portal_cliente.sql', import.meta.url), 'utf8'),
  ])
  assert.match(app, /path="\/portal\/:slug" element={<ClientPortal/)
  assert.match(page, /Portal do cliente/i)
  assert.match(page, /Sua barbearia sempre com você/)
  assert.match(page, /ENTRAR OU CRIAR CONTA/)
  assert.match(page, /o cadastro abre automaticamente/)
  assert.match(page, /Novo agendamento/i)
  assert.match(page, /Memória de cortes/i)
  assert.match(page, /Nossa equipe/i)
  assert.match(page, /Preferências pessoais/i)
  assert.match(page, /grid-cols-5/)
  assert.match(api, /persistSession: false/)
  assert.match(api, /portal_agendamento_criar/)
  assert.match(migration, /portal_sessoes/)
  assert.match(migration, /extensions\.digest/)
  assert.match(migration, /'portal_cliente'/)
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS cpf\s/)
})
