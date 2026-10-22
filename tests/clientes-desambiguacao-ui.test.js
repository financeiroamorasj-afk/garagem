import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('busca distingue homônimos e alerta duplicidade sem bloquear novo cadastro', async () => {
  const [search, warning, walkIn, migration] = await Promise.all([
    readFile(new URL('../src/components/ClientSearch.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ClientDuplicateWarning.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/WalkInModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261022110000_clientes_desambiguacao_encaixe.sql', import.meta.url), 'utf8'),
  ])
  assert.match(search, /client\.total_atendimentos/)
  assert.match(search, /client\.ultima_visita/)
  assert.match(search, /Cadastrar outro cliente/)
  assert.match(search, /digits\(client\.telefone\)/)
  assert.match(warning, /Nomes iguais continuam permitidos/)
  assert.match(warning, /mesmo telefone/)
  assert.match(walkIn, /ClientDuplicateWarning/)
  assert.match(migration, /barbeiro_favorito_nome/)
  assert.match(migration, /total_atendimentos/)
})
