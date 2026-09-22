import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('promoções concorrentes mantêm exatamente uma conta principal', async () => {
  const setup = new Client({ connectionString })
  const first = new Client({ connectionString })
  const second = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const accountA = crypto.randomUUID()
  const accountB = crypto.randomUUID()

  await Promise.all([setup.connect(), first.connect(), second.connect()])
  try {
    await setup.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant concorrência 2C',$2)", [tenantId, `tenant-2c-${tenantId}`])
    await setup.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin concorrência',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.financeiro_contas_bancarias(id,barbearia_id,nome,tipo,conta_principal) VALUES($1,$3,'Conta A','corrente',true),($2,$3,'Conta B','corrente',false)", [accountA, accountB, tenantId])

    await Promise.all([first.query('BEGIN'), second.query('BEGIN')])
    await Promise.all([
      first.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [adminId]),
      second.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [adminId]),
    ])
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':contas',0))", [tenantId])
    const callB = second.query('SELECT public.financeiro_definir_conta_principal($1,NULL)', [accountB])
    await new Promise((resolve) => setTimeout(resolve, 100))
    await first.query('SELECT public.financeiro_definir_conta_principal($1,NULL)', [accountA])
    await first.query('COMMIT')
    await callB
    await second.query('COMMIT')

    const count = await setup.query('SELECT count(*)::integer quantidade FROM public.financeiro_contas_bancarias WHERE barbearia_id=$1 AND ativa AND conta_principal', [tenantId])
    assert.equal(count.rows[0].quantidade, 1)
  } finally {
    await first.query('ROLLBACK').catch(() => {})
    await second.query('ROLLBACK').catch(() => {})
    await setup.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await setup.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await Promise.all([setup.end(), first.end(), second.end()])
  }
})

test('criações concorrentes com nome normalizado repetido retornam erro financeiro estável', async () => {
  const setup = new Client({ connectionString })
  const first = new Client({ connectionString })
  const second = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()

  await Promise.all([setup.connect(), first.connect(), second.connect()])
  try {
    await setup.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant nome concorrente',$2)", [tenantId, `tenant-nome-${tenantId}`])
    await setup.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin nome concorrente',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await Promise.all([
      first.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId]),
      second.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId]),
    ])

    const results = await Promise.allSettled([
      first.query("SELECT public.financeiro_criar_conta_bancaria('Conta Concorrente',NULL,'corrente',0,$1,NULL)", [`nome-a:${crypto.randomUUID()}`]),
      second.query("SELECT public.financeiro_criar_conta_bancaria(' conta concorrente ',NULL,'corrente',0,$1,NULL)", [`nome-b:${crypto.randomUUID()}`]),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const rejected = results.find((result) => result.status === 'rejected')
    assert.match(rejected.reason.message, /FINANCEIRO_NOME_ATIVO_EM_USO/)
    const count = await setup.query('SELECT count(*)::integer quantidade FROM public.financeiro_contas_bancarias WHERE barbearia_id=$1', [tenantId])
    assert.equal(count.rows[0].quantidade, 1)
  } finally {
    await setup.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await setup.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await Promise.all([setup.end(), first.end(), second.end()])
  }
})
