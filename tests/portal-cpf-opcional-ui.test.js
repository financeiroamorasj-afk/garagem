import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('portal deixa CPF opcional e separa acesso de agendamento do acesso ao histórico', async () => {
  const [page, api, migration] = await Promise.all([
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/portal/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261022180000_portal_cpf_opcional.sql', import.meta.url), 'utf8'),
  ])

  assert.match(page, /AGENDAR SEM CPF/)
  assert.match(page, /CPF \(opcional\)/)
  assert.match(page, /O CPF é opcional e não impede o agendamento/)
  assert.match(page, /Já tenho cadastro e quero ver meu histórico/)
  assert.match(page, /agendarSemCpf\(\{ slug, nome: name, telefone: phone \}\)/)
  assert.match(page, /initialData\.acesso_tipo === 'agendamento' \? 'agendar' : 'inicio'/)
  assert.match(page, /\['inicio', 'agendar', 'equipe'\]\.includes\(id\)/)
  assert.match(page, /este acesso mostra apenas os horários criados nele/i)
  assert.match(api, /rpc\('portal_agendar_sem_cpf'/)
  assert.match(api, /Sua sessão expirou\. Informe seus dados novamente\./)

  assert.match(migration, /acesso_tipo IN \('completo','agendamento'\)/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.portal_agendar_sem_cpf/)
  assert.match(migration, /a\.portal_sessao_id=v_sessao\.id/)
  assert.match(migration, /v_sessao\.acesso_tipo<>'completo'/)
  assert.match(migration, /Portal agora agenda sem CPF/)
  assert.doesNotMatch(migration, /cliente_cpf_hash\(v_barbearia\.id,p_telefone\)/)
})

