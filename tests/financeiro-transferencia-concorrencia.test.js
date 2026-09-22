import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('duas conexões com a mesma chave criam uma única transferência', async () => {
  const setup = new Client({ connectionString })
  const first = new Client({ connectionString })
  const second = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const origemId = crypto.randomUUID()
  const destinoId = crypto.randomUUID()
  const key = `concorrencia:${crypto.randomUUID()}`

  await Promise.all([setup.connect(), first.connect(), second.connect()])
  try {
    await setup.query('BEGIN')
    await setup.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant concorrência',$2)", [tenantId, `tenant-concorrencia-${tenantId}`])
    await setup.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin concorrência',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.financeiro_contas_bancarias(id,barbearia_id,nome,tipo,saldo_inicial) VALUES($1,$3,'Origem','corrente',100),($2,$3,'Destino','corrente',0)", [origemId, destinoId, tenantId])
    await setup.query('COMMIT')

    await first.query('BEGIN')
    await first.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [adminId])
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2,0))", [tenantId, key])

    await second.query('BEGIN')
    await second.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [adminId])
    const secondCall = second.query('SELECT public.financeiro_transferir($1,$2,10,current_date,$3,NULL) resultado', [origemId, destinoId, key])

    await new Promise((resolve) => setTimeout(resolve, 150))
    const firstResult = await first.query('SELECT public.financeiro_transferir($1,$2,10,current_date,$3,NULL) resultado', [origemId, destinoId, key])
    await first.query('COMMIT')
    const secondResult = await secondCall
    await second.query('COMMIT')

    assert.equal(firstResult.rows[0].resultado.idempotente, false)
    assert.equal(secondResult.rows[0].resultado.idempotente, true)
    const count = await setup.query('SELECT count(*)::integer quantidade FROM public.financeiro_movimentacoes WHERE barbearia_id=$1 AND idempotency_key IN ($2,$3)', [tenantId, key, `${key}:entrada`])
    assert.equal(count.rows[0].quantidade, 2)
  } finally {
    await first.query('ROLLBACK').catch(() => {})
    await second.query('ROLLBACK').catch(() => {})
    await setup.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await setup.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await Promise.all([setup.end(), first.end(), second.end()])
  }
})
