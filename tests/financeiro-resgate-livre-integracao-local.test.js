import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('resgate livre devolve reserva ao disponível sem criar receita ou movimentação bancária', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const envelopeId = crypto.randomUUID()
  const key = `liberar-${crypto.randomUUID()}`
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant resgate livre',$2)", [tenantId, `tenant-resgate-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin resgate',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(id,barbearia_id,nome,tipo,saldo_inicial,conta_principal) VALUES($1,$2,'Conta principal','corrente',100,true)", [accountId, tenantId])
    await db.query("INSERT INTO public.financeiro_envelopes(id,barbearia_id,conta_bancaria_id,nome,finalidade,saldo_acumulado) VALUES($1,$2,$3,'Reserva','reserva',60)", [envelopeId, tenantId, accountId])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const before = (await db.query('SELECT * FROM public.financeiro_saldos_disponiveis_contas()')).rows[0]
    assert.equal(Number(before.saldo_bancario), 100)
    assert.equal(Number(before.saldo_reservado), 60)
    assert.equal(Number(before.saldo_disponivel), 40)

    const first = (await db.query('SELECT public.financeiro_liberar_envelope($1,25,$2,$2) result', [envelopeId, key])).rows[0].result
    assert.equal(first.idempotente, false)
    assert.equal(first.conta_bancaria_id, accountId)
    assert.equal(Number(first.saldo_depois), 35)

    const repeated = (await db.query('SELECT public.financeiro_liberar_envelope($1,25,$2,$2) result', [envelopeId, key])).rows[0].result
    assert.equal(repeated.idempotente, true)
    await assert.rejects(() => db.query('SELECT public.financeiro_liberar_envelope($1,26,$2,$2)', [envelopeId, key]), /FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE/)
    await assert.rejects(() => db.query('SELECT public.financeiro_liberar_envelope($1,36,$2,$2)', [envelopeId, `excesso-${crypto.randomUUID()}`]), /FINANCEIRO_SALDO_INSUFICIENTE/)

    const after = (await db.query('SELECT * FROM public.financeiro_saldos_disponiveis_contas()')).rows[0]
    assert.equal(Number(after.saldo_bancario), 100)
    assert.equal(Number(after.saldo_reservado), 35)
    assert.equal(Number(after.saldo_disponivel), 65)
    const movements = await db.query('SELECT count(*)::integer total FROM public.financeiro_movimentacoes WHERE barbearia_id=$1', [tenantId])
    assert.equal(movements.rows[0].total, 0)
    const transactions = await db.query('SELECT tipo,direcao,valor,conta_pagar_id FROM public.financeiro_envelopes_transacoes WHERE barbearia_id=$1', [tenantId])
    assert.equal(transactions.rowCount, 1)
    assert.deepEqual(transactions.rows[0], { tipo: 'resgate_livre', direcao: 'debito', valor: '25.00', conta_pagar_id: null })
  } finally {
    await db.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
