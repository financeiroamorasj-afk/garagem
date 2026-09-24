import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('checkout é atômico, idempotente e estorno recompõe estoque e financeiro', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminUserId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  const productId = crypto.randomUUID()
  const checkoutKey = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Checkout teste',$2)", [tenantId, `checkout-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())", [adminUserId, `admin-${adminUserId}@local.test`, barberUserId, `barber-${barberUserId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin checkout',$3),($4,$2,'barbeiro','Barbeiro checkout',$5)", [adminUserId, tenantId, `admin-${adminUserId}@local.test`, barberUserId, `barber-${barberUserId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id,comissao_percentual) VALUES($1,$2,'Barbeiro checkout',true,$3,40)", [professionalId, tenantId, barberUserId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente checkout')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,comissao_percentual) VALUES($1,$2,'Corte completo',80,45,50)", [serviceId, tenantId])
    await db.query("INSERT INTO public.produtos(id,barbearia_id,nome,preco_venda,preco_custo,estoque_quantidade,comissao_percentual) VALUES($1,$2,'Pomada checkout',30,10,5,10)", [productId, tenantId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,now(),'em_atendimento',80)", [appointmentId, tenantId, professionalId, clientId, serviceId])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal) VALUES($1,'Caixa principal','corrente',true)", [tenantId])
    await db.query("INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES($1,'Serviços','entrada','receita_servicos'),($1,'Produtos','entrada','receita_produtos')", [tenantId])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberUserId])

    const args = [
      appointmentId,
      JSON.stringify({ estilo: 'Degradê baixo', acabamento: 'Navalha', preferencias_cliente: 'Manter topo' }),
      JSON.stringify([{ produto_id: productId, quantidade: 1 }]),
      checkoutKey,
    ]
    const first = await db.query("SELECT public.barbeiro_checkout_concluir($1,$2::jsonb,$3::jsonb,80,11,'credito',4.95,current_date,$4) result", args)
    const repeated = await db.query("SELECT public.barbeiro_checkout_concluir($1,$2::jsonb,$3::jsonb,80,11,'credito',4.95,current_date,$4) result", args)
    const closure = first.rows[0].result.fechamento
    assert.equal(repeated.rows[0].result.idempotente, true)
    assert.equal(repeated.rows[0].result.fechamento.id, closure.id)
    assert.equal(Number(closure.valor_servico_liquido), 72)
    assert.equal(Number(closure.valor_produtos_liquido), 27)
    assert.equal(Number(closure.valor_final), 99)
    assert.equal(Number(closure.valor_liquido), 94.05)
    assert.equal(Number(closure.comissao_servico_valor), 36)
    assert.equal(Number(closure.comissao_produtos_valor), 2.7)
    assert.equal(Number(closure.comissao_total), 38.7)

    const product = await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])
    assert.equal(product.rows[0].estoque_quantidade, 4)
    const sale = await db.query('SELECT valor_venda,desconto_valor,valor_liquido,comissao_valor,status FROM public.vendas_produtos WHERE fechamento_id=$1', [closure.id])
    assert.deepEqual(sale.rows.map((row) => Number(row.valor_venda)), [30])
    assert.equal(Number(sale.rows[0].desconto_valor), 3)
    assert.equal(Number(sale.rows[0].valor_liquido), 27)
    assert.equal(Number(sale.rows[0].comissao_valor), 2.7)
    assert.equal(sale.rows[0].status, 'concluida')

    const receivables = await db.query('SELECT origem,valor_bruto,taxa,status FROM public.financeiro_contas_receber WHERE fechamento_id=$1 ORDER BY origem', [closure.id])
    assert.equal(receivables.rows.length, 2)
    assert.equal(receivables.rows.reduce((total, row) => total + Number(row.valor_bruto), 0), 99)
    assert.equal(receivables.rows.reduce((total, row) => total + Number(row.taxa), 0), 4.95)
    assert.ok(receivables.rows.every((row) => row.status === 'liquidado'))
    assert.equal(Number((await db.query("SELECT COALESCE(sum(CASE WHEN direcao='entrada' THEN valor ELSE -valor END),0) saldo FROM public.financeiro_movimentacoes WHERE fechamento_id=$1", [closure.id])).rows[0].saldo), 94.05)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.estoque_movimentacoes WHERE fechamento_id=$1', [closure.id])).rows[0].total, 1)

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminUserId])
    const titleList = await db.query("SELECT public.financeiro_listar_titulos('receber',current_date,current_date,NULL,'data','asc',1,100) result")
    const checkoutTitles = titleList.rows[0].result.items.filter((item) => item.fechamento_id === closure.id)
    assert.equal(checkoutTitles.length, 2)
    assert.ok(checkoutTitles.every((item) => item.pode_estornar === true))
    const reversed = await db.query("SELECT public.admin_checkout_estornar($1,'Pagamento devolvido ao cliente') result", [closure.id])
    assert.equal(reversed.rows[0].result.status, 'estornado')
    assert.equal((await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])).rows[0].estoque_quantidade, 5)
    assert.equal((await db.query('SELECT status FROM public.vendas_produtos WHERE fechamento_id=$1', [closure.id])).rows[0].status, 'cancelada')
    assert.ok((await db.query('SELECT status FROM public.financeiro_contas_receber WHERE fechamento_id=$1', [closure.id])).rows.every((row) => row.status === 'estornado'))
    assert.equal((await db.query('SELECT pagamento_status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].pagamento_status, 'estornado')
  } finally {
    await db.query('DELETE FROM public.estoque_movimentacoes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_movimentacoes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_contas_receber WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.vendas_produtos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.cliente_cortes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_fechamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_categorias WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_contas_bancarias WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.agendamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.produtos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.servicos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[adminUserId, barberUserId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
