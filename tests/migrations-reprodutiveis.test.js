import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20260926193000_recupera_schema_operacional_producao.sql', import.meta.url)
const repairUrl = new URL('../supabase/repairs/20260926193000_recupera_schema_operacional_producao.sql', import.meta.url)

test('reparo emergencial fica preservado sem duplicar objetos em instalações limpas', async () => {
  const [migration, repair] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(repairUrl, 'utf8'),
  ])

  assert.match(migration, /intencionalmente um no-op/)
  assert.doesNotMatch(migration, /CREATE (?:TABLE|FUNCTION|INDEX|POLICY)/)
  assert.match(repair, /CREATE FUNCTION public\.admin_agenda_listar_periodo/)
  assert.match(repair, /CREATE TABLE public\.atendimento_fechamentos/)
})
