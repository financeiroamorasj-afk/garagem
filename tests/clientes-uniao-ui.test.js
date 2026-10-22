import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('admin une duplicados com confirmação, bloqueios e auditoria', async () => {
  const [page, api, migration] = await Promise.all([
    readFile(new URL('../src/pages/AdminClients.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clientes/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261022130000_clientes_uniao_auditavel.sql', import.meta.url), 'utf8'),
  ])
  assert.match(page, /Unir duplicado/)
  assert.match(page, /Ficha que será mantida/)
  assert.match(page, /As sessões do portal serão encerradas/)
  assert.match(page, /CPF \(opcional\)/)
  assert.match(api, /clientes_unir/)
  assert.match(api, /CLIENTE_UNIAO_CPFS_DIFERENTES/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.clientes_unioes/)
  assert.match(migration, /generate_subscripts\(con\.conkey,1\)/)
  assert.match(migration, /UPDATE public\.portal_sessoes SET revogada_em/)
  assert.match(migration, /to_jsonb\(v_origem\)-'cpf_hash'/)
})
