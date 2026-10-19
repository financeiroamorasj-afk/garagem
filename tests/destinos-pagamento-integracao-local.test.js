import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('dinheiro vai para o caixa e cartões vão para a conta da maquininha', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const principalId = crypto.randomUUID()
  const cashId = crypto.randomUUID()
  const cardId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Destinos de pagamento',$2)", [tenantId, `destinos-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [userId, `destinos-${userId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'barbeiro','Barbeiro destinos',$3,true)", [userId, tenantId, `destinos-${userId}@local.test`])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(id,barbearia_id,nome,tipo,conta_principal) VALUES($1,$4,'Conta principal','corrente',true),($2,$4,'Caixa físico','caixa',false),($3,$4,'Maquininha','cartao',false)", [principalId, cashId, cardId, tenantId])

    assert.equal((await db.query("SELECT public.financeiro_resolver_conta_recebimento($1,'dinheiro') id", [tenantId])).rows[0].id, cashId)
    assert.equal((await db.query("SELECT public.financeiro_resolver_conta_recebimento($1,'debito') id", [tenantId])).rows[0].id, cardId)
    assert.equal((await db.query("SELECT public.financeiro_resolver_conta_recebimento($1,'credito') id", [tenantId])).rows[0].id, cardId)
    assert.equal((await db.query("SELECT public.financeiro_resolver_conta_recebimento($1,'pix') id", [tenantId])).rows[0].id, principalId)

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
    const destinations = (await db.query('SELECT public.financeiro_destinos_recebimento() result')).rows[0].result
    assert.equal(destinations.dinheiro.conta_nome, 'Caixa físico')
    assert.equal(destinations.credito.conta_nome, 'Maquininha')
    assert.equal(destinations.pix.conta_nome, 'Conta principal')

    await db.query('DELETE FROM public.financeiro_contas_bancarias WHERE id=$1', [cardId])
    await assert.rejects(
      db.query("SELECT public.financeiro_resolver_conta_recebimento($1,'credito')", [tenantId]),
      /FINANCEIRO_CONTA_CARTAO_NAO_CONFIGURADA/,
    )
  } finally {
    await db.query('DELETE FROM public.financeiro_contas_bancarias WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=$1', [userId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
