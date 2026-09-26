import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('configuração PIX é isolada, acessível à equipe e auditada sem expor a chave', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const email = `pix-${adminId}@local.test`
  await client.connect()
  try {
    await client.query('INSERT INTO public.barbearias(id,nome,slug) VALUES($1,\'Tenant PIX\',$2),($3,\'Outro PIX\',$4)', [tenantId, `tenant-pix-${tenantId}`, otherTenantId, `tenant-pix-${otherTenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())", [adminId, email, barberId, `barber-${barberId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin PIX',$3),($4,$2,'barbeiro','Barbeiro PIX',$5)", [adminId, tenantId, email, barberId, `barber-${barberId}@local.test`])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const saved = await client.query("SELECT public.configuracoes_pix_salvar('51992433413','Garagem Local','Porto Alegre') result")
    assert.equal(saved.rows[0].result.configurado, true)
    assert.equal(saved.rows[0].result.chave, '51992433413')

    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberId])
    const teamRead = await client.query('SELECT public.configuracoes_pix_obter() result')
    assert.equal(teamRead.rows[0].result.chave, '51992433413')

    const audit = await client.query("SELECT antes,depois FROM public.financeiro_audit_log WHERE barbearia_id=$1 AND entidade='barbearias_pix' ORDER BY created_at DESC LIMIT 1", [tenantId])
    assert.equal(audit.rows[0].depois.configurado, true)
    assert.equal(JSON.stringify(audit.rows[0]), JSON.stringify(audit.rows[0]).replace('51992433413', ''))
  } finally {
    await client.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [adminId, barberId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id IN ($1,$2)', [tenantId, otherTenantId]).catch(() => {})
    await client.end()
  }
})
