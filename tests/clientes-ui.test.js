import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('central de clientes está roteada e não expõe CPF completo', async () => {
  const [app, layout, page, api, migration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminClients.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clientes/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923220000_central_clientes.sql', import.meta.url), 'utf8'),
  ])
  assert.match(app, /path="clientes" element={<AdminClients/)
  assert.match(layout, /Clientes.*\/admin\/clientes/s)
  assert.match(page, /Histórico de cortes/)
  assert.match(page, /Preferências do cliente/)
  assert.match(page, /CPF protegido/)
  assert.match(page, /Barbeiro favorito/)
  assert.match(page, /Clientes em lista/)
  assert.match(page, /Clientes em cards/)
  assert.match(page, /garagem-clientes-view/)
  assert.match(api, /clientes_listar/)
  assert.match(api, /cliente_ficha_detalhe/)
  assert.match(api, /cliente_salvar/)
  assert.match(migration, /extensions\.hmac/)
  assert.match(migration, /clientes_cpf_tenant_uidx/)
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS cpf\s/)
})
