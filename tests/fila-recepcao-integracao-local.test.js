import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('barbeiro envia para cobrança sem baixar estoque ou gerar financeiro', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const receptionUserId = crypto.randomUUID()
  const otherReceptionId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const productId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  const blockedCheckoutAppointmentId = crypto.randomUUID()
  const handoffKey = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Fila teste',$2),($3,'Fila externa',$4)", [tenantId, `fila-${tenantId}`, otherTenantId, `fila-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [barberUserId, `barber-${barberUserId}@local.test`, receptionUserId, `recepcao-${receptionUserId}@local.test`, otherReceptionId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'barbeiro','Barbeiro fila',$3,true),($4,$2,'recepcao','Recepção fila',$5,true),($6,$7,'recepcao','Recepção externa',$8,true)", [barberUserId, tenantId, `barber-${barberUserId}@local.test`, receptionUserId, `recepcao-${receptionUserId}@local.test`, otherReceptionId, otherTenantId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato,ativo_na_unidade) VALUES($1,'recepcao','ativo',true),($2,'recepcao','ativo',true)", [tenantId, otherTenantId])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id,comissao_percentual) VALUES($1,$2,'Barbeiro fila',true,$3,40)", [professionalId, tenantId, barberUserId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$2,'Cliente fila','11999990000')", [customerId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,comissao_percentual) VALUES($1,$2,'Corte fila',70,45,50)", [serviceId, tenantId])
    await db.query("INSERT INTO public.produtos(id,barbearia_id,nome,preco_venda,preco_custo,estoque_quantidade,ativo) VALUES($1,$2,'Pomada fila',30,10,5,true)", [productId, tenantId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,now(),'em_atendimento',70),($6,$2,$3,$4,$5,now()+interval '1 hour','em_atendimento',70)", [appointmentId, tenantId, professionalId, customerId, serviceId, blockedCheckoutAppointmentId])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal) VALUES($1,'Caixa fila','caixa',true)", [tenantId])
    await db.query("INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES($1,'Serviços fila','entrada','receita_servicos'),($1,'Produtos fila','entrada','receita_produtos')", [tenantId])

    await setUser(db, barberUserId)
    const memory = { estilo: 'Degradê baixo', acabamento: 'Navalha', preferencias_cliente: 'Manter topo' }
    const products = [{ produto_id: productId, quantidade: 2 }]
    const first = await db.query('SELECT public.barbeiro_atendimento_enviar_recepcao($1,$2::jsonb,$3::jsonb,70,$4) result', [appointmentId, JSON.stringify(memory), JSON.stringify(products), handoffKey])
    const retry = await db.query('SELECT public.barbeiro_atendimento_enviar_recepcao($1,$2::jsonb,$3::jsonb,70,$4) result', [appointmentId, JSON.stringify(memory), JSON.stringify(products), handoffKey])
    assert.equal(first.rows[0].result.status, 'aguardando_pagamento')
    assert.equal(retry.rows[0].result.idempotente, true)
    assert.equal(retry.rows[0].result.pendencia_id, first.rows[0].result.pendencia_id)
    assert.equal((await db.query('SELECT status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].status, 'aguardando_pagamento')
    assert.equal((await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])).rows[0].estoque_quantidade, 5)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.vendas_produtos WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 0)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.atendimento_fechamentos WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 0)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.financeiro_contas_receber WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 0)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.cliente_cortes WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 1)

    await assert.rejects(
      db.query("SELECT public.barbeiro_checkout_concluir($1,$2::jsonb,'[]'::jsonb,70,0,'pix',0,current_date,$3)", [blockedCheckoutAppointmentId, JSON.stringify({ estilo: 'Corte social' }), crypto.randomUUID()]),
      /CHECKOUT_USAR_RECEPCAO/,
    )

    await setUser(db, receptionUserId)
    const queue = await db.query('SELECT * FROM public.recepcao_fila_listar()')
    assert.equal(queue.rows.length, 1)
    assert.equal(queue.rows[0].cliente_nome, 'Cliente fila')
    assert.equal(Number(queue.rows[0].valor_total), 130)
    assert.equal(queue.rows[0].produtos[0].quantidade, 2)

    await db.query('SET ROLE authenticated')
    assert.equal((await db.query('SELECT count(*)::int total FROM public.atendimento_pendencias')).rows[0].total, 1)
    await db.query('RESET ROLE')

    await setUser(db, otherReceptionId)
    assert.equal((await db.query('SELECT * FROM public.recepcao_fila_listar()')).rows.length, 0)
    await db.query('SET ROLE authenticated')
    assert.equal((await db.query('SELECT count(*)::int total FROM public.atendimento_pendencias')).rows[0].total, 0)
    await db.query('RESET ROLE')
  } finally {
    await db.query('DELETE FROM public.atendimento_operacao_log WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_itens_pendentes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_pendencias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.cliente_cortes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_categorias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_contas_bancarias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[barberUserId, receptionUserId, otherReceptionId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.end()
  }
})

async function setUser(db, userId) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
}
