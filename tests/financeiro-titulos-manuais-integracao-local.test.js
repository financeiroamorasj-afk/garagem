import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('títulos manuais cobrem criação idempotente, edição, listagem, cancelamento e autorização', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const expenseCategoryId = crypto.randomUUID()
  const incomeCategoryId = crypto.randomUUID()
  const email = `titulos-${adminId}@local.test`

  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant títulos manuais',$2)", [tenantId, `tenant-titulos-${tenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, email])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin títulos',$3)", [adminId, tenantId, email])
    await client.query("INSERT INTO public.financeiro_categorias(id,barbearia_id,nome,tipo,grupo_dre) VALUES($1,$3,'Despesa manual','saida','despesa_variavel'),($2,$3,'Receita manual','entrada','outros')", [expenseCategoryId, incomeCategoryId, tenantId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const createKey = `titulo-pagar-${crypto.randomUUID()}`
    const payable = await client.query(
      "SELECT public.financeiro_criar_titulo_manual('pagar','Aluguel manual',120,0,current_date,current_date,NULL,$1,$2,NULL) result",
      [expenseCategoryId, createKey],
    )
    const payableRetry = await client.query(
      "SELECT public.financeiro_criar_titulo_manual('pagar','Aluguel manual',120,0,current_date,current_date,NULL,$1,$2,NULL) result",
      [expenseCategoryId, createKey],
    )
    assert.equal(payableRetry.rows[0].result.id, payable.rows[0].result.id)
    assert.equal(payableRetry.rows[0].result.idempotente, true)
    await assert.rejects(
      client.query(
        "SELECT public.financeiro_criar_titulo_manual('pagar','Outro aluguel',120,0,current_date,current_date,NULL,$1,$2,NULL)",
        [expenseCategoryId, createKey],
      ),
      /FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE/,
    )

    const originalVersion = payable.rows[0].result.updated_at
    const edited = await client.query(
      "SELECT public.financeiro_editar_titulo_manual('pagar',$1,'Aluguel editado',130,0,current_date+1,current_date,NULL,$2,$3,NULL) result",
      [payable.rows[0].result.id, expenseCategoryId, originalVersion],
    )
    assert.equal(Number(edited.rows[0].result.valor), 130)
    await assert.rejects(
      client.query(
        "SELECT public.financeiro_editar_titulo_manual('pagar',$1,'Versão antiga',140,0,current_date,current_date,NULL,$2,$3,NULL)",
        [payable.rows[0].result.id, expenseCategoryId, originalVersion],
      ),
      /FINANCEIRO_CONFLITO_VERSAO/,
    )

    const receivable = await client.query(
      "SELECT public.financeiro_criar_titulo_manual('receber','Receita manual',200,10,current_date,current_date-1,'pix',$1,$2,NULL) result",
      [incomeCategoryId, `titulo-receber-${crypto.randomUUID()}`],
    )
    assert.equal(Number(receivable.rows[0].result.valor), 190)
    assert.notEqual(receivable.rows[0].result.data_competencia, receivable.rows[0].result.data_evento)

    const listed = await client.query("SELECT public.financeiro_listar_titulos('receber',current_date,current_date,NULL,'data','asc',1,25) result")
    const listedReceivable = listed.rows[0].result.items.find(({ id }) => id === receivable.rows[0].result.id)
    assert.equal(listedReceivable.origem, 'manual')
    assert.equal(listedReceivable.pode_editar, true)
    assert.equal(listedReceivable.metodo_pagamento, 'pix')
    assert.equal(Number(listedReceivable.valor_bruto), 200)

    await client.query(
      "SELECT public.financeiro_cancelar_titulo_manual('receber',$1,$2,'Cliente desistiu',NULL)",
      [receivable.rows[0].result.id, receivable.rows[0].result.updated_at],
    )
    const canceledPayable = await client.query(
      "SELECT public.financeiro_cancelar_titulo_manual('pagar',$1,$2,'Lançamento duplicado',NULL) result",
      [payable.rows[0].result.id, edited.rows[0].result.updated_at],
    )
    assert.equal(canceledPayable.rows[0].result.status, 'cancelado')

    const audit = await client.query(
      "SELECT depois->>'motivo_cancelamento' motivo FROM public.financeiro_audit_log WHERE entidade='financeiro_contas_pagar' AND entidade_id=$1 ORDER BY created_at DESC LIMIT 1",
      [payable.rows[0].result.id],
    )
    assert.equal(audit.rows[0].motivo, 'Lançamento duplicado')

    await client.query("UPDATE public.profiles SET role='barbeiro' WHERE id=$1", [adminId])
    await assert.rejects(
      client.query(
        "SELECT public.financeiro_criar_titulo_manual('pagar','Sem permissão',10,0,current_date,current_date,NULL,NULL,$1,NULL)",
        [`titulo-negado-${crypto.randomUUID()}`],
      ),
      /FINANCEIRO_SEM_PERMISSAO/,
    )
  } finally {
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await client.end()
  }
})
