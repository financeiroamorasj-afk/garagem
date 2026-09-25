import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('recepção devolve atendimento com histórico e conclui venda avulsa atômica', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const adminUserId = crypto.randomUUID()
  const receptionUserId = crypto.randomUUID()
  const otherReceptionId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const firstProductId = crypto.randomUUID()
  const secondProductId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  const saleKey = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Balcão teste',$2),($3,'Balcão externo',$4)", [tenantId, `balcao-${tenantId}`, otherTenantId, `balcao-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [barberUserId, `barber-${barberUserId}@local.test`, receptionUserId, `recepcao-${receptionUserId}@local.test`, otherReceptionId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'barbeiro','Barbeiro balcão',$3,true),($4,$2,'recepcao','Recepção balcão',$5,true),($6,$7,'recepcao','Recepção externa',$8,true)", [barberUserId, tenantId, `barber-${barberUserId}@local.test`, receptionUserId, `recepcao-${receptionUserId}@local.test`, otherReceptionId, otherTenantId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminUserId, `admin-${adminUserId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Gestor balcão',$3,true)", [adminUserId, tenantId, `admin-${adminUserId}@local.test`])
    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato,ativo_na_unidade) VALUES($1,'recepcao','ativo',true),($2,'recepcao','ativo',true)", [tenantId, otherTenantId])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo,user_id,comissao_percentual,comissao_produtos_percentual) VALUES($1,$2,'Barbeiro balcão','Balcão',true,$3,40,10)", [professionalId, tenantId, barberUserId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente balcão')", [customerId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte balcão',70,45)", [serviceId, tenantId])
    await db.query("INSERT INTO public.produtos(id,barbearia_id,nome,preco_venda,preco_custo,estoque_quantidade,ativo,comissao_percentual) VALUES($1,$2,'Pomada balcão',30,10,5,true,NULL),($3,$2,'Óleo balcão',20,8,4,true,20)", [firstProductId, tenantId, secondProductId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,now(),'em_atendimento',70)", [appointmentId, tenantId, professionalId, customerId, serviceId])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal) VALUES($1,'Caixa balcão','caixa',true)", [tenantId])
    await db.query("INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES($1,'Produtos balcão','entrada','receita_produtos')", [tenantId])

    await setUser(db, barberUserId)
    const firstHandoff = await db.query("SELECT public.barbeiro_atendimento_enviar_recepcao($1,$2::jsonb,'[]'::jsonb,70,$3) result", [appointmentId, JSON.stringify({ estilo: 'Social' }), crypto.randomUUID()])
    const pendingId = firstHandoff.rows[0].result.pendencia_id
    const pendingVersion = (await db.query('SELECT updated_at::text updated_at FROM public.atendimento_pendencias WHERE id=$1', [pendingId])).rows[0].updated_at

    await setUser(db, receptionUserId)
    const returned = await db.query("SELECT public.recepcao_fila_devolver($1,'Produto indicado incorretamente',$2) result", [pendingId, pendingVersion])
    assert.equal(returned.rows[0].result.agendamento_status, 'em_atendimento')
    assert.equal((await db.query('SELECT status FROM public.atendimento_pendencias WHERE id=$1', [pendingId])).rows[0].status, 'cancelado')
    assert.equal((await db.query('SELECT status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].status, 'em_atendimento')
    assert.equal((await db.query('SELECT count(*)::int total FROM public.financeiro_contas_receber WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 0)

    await setUser(db, barberUserId)
    const secondHandoff = await db.query("SELECT public.barbeiro_atendimento_enviar_recepcao($1,$2::jsonb,'[]'::jsonb,70,$3) result", [appointmentId, JSON.stringify({ estilo: 'Social corrigido' }), crypto.randomUUID()])
    assert.notEqual(secondHandoff.rows[0].result.pendencia_id, pendingId)
    assert.equal((await db.query("SELECT count(*)::int total FROM public.atendimento_pendencias WHERE agendamento_id=$1 AND status='aguardando_pagamento'", [appointmentId])).rows[0].total, 1)

    await setUser(db, receptionUserId)
    assert.equal((await db.query('SELECT * FROM public.recepcao_profissionais_listar()')).rows.length, 1)
    const items = JSON.stringify([{ produto_id: firstProductId, quantidade: 2 }, { produto_id: secondProductId, quantidade: 1 }])
    const sold = await db.query("SELECT public.recepcao_venda_avulsa_concluir_cliente($1::jsonb,$2,$3,8,'credito',2,current_date,$4) result", [items, professionalId, customerId, saleKey])
    const repeated = await db.query("SELECT public.recepcao_venda_avulsa_concluir_cliente($1::jsonb,$2,$3,8,'credito',2,current_date,$4) result", [items, professionalId, customerId, saleKey])
    const counterSale = sold.rows[0].result.venda
    assert.equal(repeated.rows[0].result.idempotente, true)
    assert.equal(repeated.rows[0].result.venda.id, counterSale.id)
    await assert.rejects(
      db.query("SELECT public.recepcao_venda_avulsa_concluir_cliente($1::jsonb,$2,NULL,8,'credito',2,current_date,$3)", [items, professionalId, saleKey]),
      /RECEPCAO_VENDA_CHAVE_EM_USO/,
    )
    assert.equal(Number(counterSale.valor_final), 72)
    assert.equal(Number(counterSale.comissao_total), 9)
    assert.equal(counterSale.cliente_id, customerId)
    assert.deepEqual((await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=ANY($1) ORDER BY nome', [[firstProductId, secondProductId]])).rows.map((row) => row.estoque_quantidade), [3, 3])
    assert.equal((await db.query('SELECT count(*)::int total FROM public.vendas_produtos WHERE venda_balcao_id=$1', [counterSale.id])).rows[0].total, 2)
    const receivable = (await db.query('SELECT valor_bruto,taxa,status,cliente_id FROM public.financeiro_contas_receber WHERE venda_balcao_id=$1', [counterSale.id])).rows[0]
    assert.equal(Number(receivable.valor_bruto), 72)
    assert.equal(Number(receivable.taxa), 2)
    assert.equal(receivable.status, 'liquidado')
    assert.equal(receivable.cliente_id, customerId)
    assert.equal(Number((await db.query("SELECT COALESCE(sum(CASE WHEN direcao='entrada' THEN valor ELSE -valor END),0) saldo FROM public.financeiro_movimentacoes WHERE venda_balcao_id=$1", [counterSale.id])).rows[0].saldo), 70)

    const directSale = await db.query("SELECT public.recepcao_venda_avulsa_concluir_cliente($1::jsonb,NULL,NULL,0,'pix',0,current_date,$2) result", [JSON.stringify([{ produto_id: secondProductId, quantidade: 1 }]), crypto.randomUUID()])
    assert.equal(Number(directSale.rows[0].result.venda.comissao_total), 0)
    const directLine = (await db.query('SELECT profissional_id,comissao_valor FROM public.vendas_produtos WHERE venda_balcao_id=$1', [directSale.rows[0].result.venda.id])).rows[0]
    assert.equal(directLine.profissional_id, null)
    assert.equal(Number(directLine.comissao_valor), 0)

    const listedBeforeRefund = await db.query('SELECT * FROM public.recepcao_vendas_balcao_listar(current_date,current_date,50)')
    assert.equal(listedBeforeRefund.rows.length, 2)
    assert.equal(listedBeforeRefund.rows.find((row) => row.id === counterSale.id).produtos.length, 2)
    assert.equal(listedBeforeRefund.rows.find((row) => row.id === counterSale.id).cliente_nome, 'Cliente balcão')

    const refundKey = crypto.randomUUID()
    const refunded = await db.query("SELECT public.recepcao_venda_avulsa_estornar($1,'Cliente desistiu da compra',$2) result", [counterSale.id, refundKey])
    const repeatedRefund = await db.query("SELECT public.recepcao_venda_avulsa_estornar($1,'Cliente desistiu da compra',$2) result", [counterSale.id, refundKey])
    assert.equal(refunded.rows[0].result.venda.status, 'estornada')
    assert.equal(repeatedRefund.rows[0].result.idempotente, true)
    const restoredStock = (await db.query('SELECT id,estoque_quantidade FROM public.produtos WHERE id=ANY($1)', [[firstProductId, secondProductId]])).rows
    assert.equal(restoredStock.find((row) => row.id === firstProductId).estoque_quantidade, 5)
    assert.equal(restoredStock.find((row) => row.id === secondProductId).estoque_quantidade, 3)
    assert.deepEqual((await db.query('SELECT DISTINCT status FROM public.vendas_produtos WHERE venda_balcao_id=$1', [counterSale.id])).rows.map((row) => row.status), ['cancelada'])
    assert.deepEqual((await db.query('SELECT DISTINCT status FROM public.financeiro_contas_receber WHERE venda_balcao_id=$1', [counterSale.id])).rows.map((row) => row.status), ['estornado'])
    assert.deepEqual((await db.query('SELECT DISTINCT status FROM public.financeiro_movimentacoes WHERE venda_balcao_id=$1', [counterSale.id])).rows.map((row) => row.status), ['estornado'])
    assert.equal((await db.query("SELECT count(*)::int total FROM public.estoque_movimentacoes WHERE venda_produto_id IN (SELECT id FROM public.vendas_produtos WHERE venda_balcao_id=$1) AND tipo='estorno'", [counterSale.id])).rows[0].total, 2)
    const listedAfterRefund = await db.query('SELECT * FROM public.recepcao_vendas_balcao_listar(current_date,current_date,50)')
    assert.equal(listedAfterRefund.rows.find((row) => row.id === counterSale.id).motivo_estorno, 'Cliente desistiu da compra')
    await assert.rejects(
      db.query("SELECT public.recepcao_venda_avulsa_estornar($1,'Nova tentativa indevida',$2)", [counterSale.id, crypto.randomUUID()]),
      /RECEPCAO_ESTORNO_JA_REALIZADO/,
    )

    await setUser(db, otherReceptionId)
    assert.equal((await db.query('SELECT * FROM public.recepcao_profissionais_listar()')).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM public.recepcao_vendas_balcao_listar(current_date,current_date,50)')).rows.length, 0)
    await assert.rejects(
      db.query("SELECT public.recepcao_venda_avulsa_concluir_cliente($1::jsonb,NULL,NULL,0,'pix',0,current_date,$2)", [JSON.stringify([{ produto_id: firstProductId, quantidade: 1 }]), crypto.randomUUID()]),
      /RECEPCAO_VENDA_PRODUTO_NAO_ENCONTRADO/,
    )
    await assert.rejects(
      db.query("SELECT public.recepcao_venda_avulsa_estornar($1,'Tentativa em outra unidade',$2)", [directSale.rows[0].result.venda.id, crypto.randomUUID()]),
      /RECEPCAO_ESTORNO_VENDA_NAO_ENCONTRADA/,
    )

    await setUser(db, adminUserId)
    const report = (await db.query('SELECT public.admin_recepcao_resumo(current_date,current_date) result')).rows[0].result
    assert.equal(Number(report.resumo.vendas_avulsas), 1)
    assert.equal(Number(report.resumo.valor_vendas_avulsas), 20)
    assert.equal(Number(report.resumo.estornos_avulsos), 1)
    assert.equal(Number(report.resumo.valor_estornado), 72)
    assert.equal(Number(report.resumo.produtos_vendidos), 1)
    assert.equal(Number(report.resumo.devolucoes_ao_barbeiro), 1)
    assert.equal(report.operadores.length, 1)
    assert.equal(report.operadores[0].nome, 'Recepção balcão')
  } finally {
    await db.query('DELETE FROM public.atendimento_operacao_log WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_itens_pendentes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_pendencias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.estoque_movimentacoes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_movimentacoes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_contas_receber WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.vendas_produtos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.vendas_balcao WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.cliente_cortes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_categorias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_contas_bancarias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[barberUserId, adminUserId, receptionUserId, otherReceptionId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.end()
  }
})

async function setUser(db, userId) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
}
