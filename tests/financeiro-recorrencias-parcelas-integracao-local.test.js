import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('parcelas e recorrências são mensais, exatas, auditadas e idempotentes', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const categoryId = crypto.randomUUID()
  const email = `series-${adminId}@local.test`

  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant séries',$2)", [tenantId, `tenant-series-${tenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, email])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin séries',$3)", [adminId, tenantId, email])
    await client.query("INSERT INTO public.financeiro_categorias(id,barbearia_id,nome,tipo,grupo_dre) VALUES($1,$2,'Despesa parcelada','saida','despesa_variavel')", [categoryId, tenantId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const installmentKey = `parcelas-${crypto.randomUUID()}`
    const installments = await client.query(
      "SELECT public.financeiro_criar_titulos_em_lote('pagar','parcelado','Equipamento',100,0,'2026-01-31','2026-01-31',NULL,$1,3,$2,NULL) result",
      [categoryId, installmentKey],
    )
    const installmentRetry = await client.query(
      "SELECT public.financeiro_criar_titulos_em_lote('pagar','parcelado','Equipamento',100,0,'2026-01-31','2026-01-31',NULL,$1,3,$2,NULL) result",
      [categoryId, installmentKey],
    )
    assert.equal(installmentRetry.rows[0].result.idempotente, true)
    assert.equal(installmentRetry.rows[0].result.grupo_id, installments.rows[0].result.grupo_id)

    const installmentRows = await client.query(
      'SELECT valor,data_vencimento,numero_repeticao,total_repeticoes,modalidade FROM public.financeiro_contas_pagar WHERE barbearia_id=$1 AND grupo_id=$2 ORDER BY numero_repeticao',
      [tenantId, installments.rows[0].result.grupo_id],
    )
    assert.deepEqual(installmentRows.rows.map((row) => Number(row.valor)), [33.34, 33.33, 33.33])
    assert.deepEqual(installmentRows.rows.map((row) => row.data_vencimento.toISOString().slice(0, 10)), ['2026-01-31', '2026-02-28', '2026-03-31'])
    assert.equal(installmentRows.rows.reduce((sum, row) => sum + Number(row.valor), 0), 100)
    assert.ok(installmentRows.rows.every((row) => row.modalidade === 'parcelado' && row.total_repeticoes === 3))

    const recurring = await client.query(
      "SELECT public.financeiro_criar_titulos_em_lote('receber','recorrente','Mensalidade',80,4,'2026-01-31','2026-01-31','pix',NULL,3,$1,NULL) result",
      [`recorrencias-${crypto.randomUUID()}`],
    )
    const recurringRows = await client.query(
      'SELECT valor_bruto,taxa,valor_liquido,data_previsao,modalidade FROM public.financeiro_contas_receber WHERE barbearia_id=$1 AND grupo_id=$2 ORDER BY numero_repeticao',
      [tenantId, recurring.rows[0].result.grupo_id],
    )
    assert.deepEqual(recurringRows.rows.map((row) => Number(row.valor_bruto)), [80, 80, 80])
    assert.deepEqual(recurringRows.rows.map((row) => Number(row.taxa)), [4, 4, 4])
    assert.deepEqual(recurringRows.rows.map((row) => Number(row.valor_liquido)), [76, 76, 76])
    assert.deepEqual(recurringRows.rows.map((row) => row.data_previsao.toISOString().slice(0, 10)), ['2026-01-31', '2026-02-28', '2026-03-31'])

    const audit = await client.query(
      "SELECT count(*)::integer total FROM public.financeiro_audit_log WHERE barbearia_id=$1 AND entidade IN ('financeiro_contas_pagar','financeiro_contas_receber')",
      [tenantId],
    )
    assert.equal(audit.rows[0].total, 6)
  } finally {
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await client.end()
  }
})
