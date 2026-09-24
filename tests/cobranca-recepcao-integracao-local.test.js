import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('recepção confere o carrinho e cobra com estoque, comissão e financeiro atômicos', async () => {
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
  const handoffKey = crypto.randomUUID()
  const checkoutKey = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Cobrança recepção',$2),($3,'Cobrança externa',$4)", [tenantId, `cobranca-${tenantId}`, otherTenantId, `cobranca-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [barberUserId, `barber-${barberUserId}@local.test`, receptionUserId, `recepcao-${receptionUserId}@local.test`, otherReceptionId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'barbeiro','Barbeiro cobrança',$3,true),($4,$2,'recepcao','Recepção cobrança',$5,true),($6,$7,'recepcao','Recepção externa',$8,true)", [barberUserId, tenantId, `barber-${barberUserId}@local.test`, receptionUserId, `recepcao-${receptionUserId}@local.test`, otherReceptionId, otherTenantId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato,ativo_na_unidade) VALUES($1,'recepcao','ativo',true),($2,'recepcao','ativo',true)", [tenantId, otherTenantId])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id,comissao_percentual,comissao_produtos_percentual) VALUES($1,$2,'Barbeiro cobrança',true,$3,40,10)", [professionalId, tenantId, barberUserId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$2,'Cliente cobrança','11999991111')", [customerId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,comissao_percentual) VALUES($1,$2,'Corte cobrança',70,45,50)", [serviceId, tenantId])
    await db.query("INSERT INTO public.produtos(id,barbearia_id,nome,preco_venda,preco_custo,estoque_quantidade,ativo,comissao_percentual) VALUES($1,$2,'Pomada cobrança',30,10,5,true,NULL)", [productId, tenantId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,now(),'em_atendimento',70)", [appointmentId, tenantId, professionalId, customerId, serviceId])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal) VALUES($1,'Caixa cobrança','caixa',true)", [tenantId])
    await db.query("INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES($1,'Serviços cobrança','entrada','receita_servicos'),($1,'Produtos cobrança','entrada','receita_produtos')", [tenantId])

    await setUser(db, barberUserId)
    const handoff = await db.query("SELECT public.barbeiro_atendimento_enviar_recepcao($1,$2::jsonb,$3::jsonb,70,$4) result", [appointmentId, JSON.stringify({ estilo: 'Degradê baixo' }), JSON.stringify([{ produto_id: productId, quantidade: 1 }]), handoffKey])
    const pendingId = handoff.rows[0].result.pendencia_id

    await setUser(db, receptionUserId)
    assert.equal((await db.query('SELECT * FROM public.recepcao_produtos_listar()')).rows.length, 1)
    const queue = await db.query('SELECT * FROM public.recepcao_fila_listar()')
    const originalVersion = (await db.query('SELECT updated_at::text updated_at FROM public.atendimento_pendencias WHERE id=$1', [pendingId])).rows[0].updated_at
    assert.equal(queue.rows[0].pendencia_id, pendingId)
    const saved = await db.query("SELECT public.recepcao_carrinho_salvar($1,80,$2::jsonb,$3) result", [pendingId, JSON.stringify([{ produto_id: productId, quantidade: 3 }]), originalVersion])
    assert.equal(Number(saved.rows[0].result.valor_total), 170)
    assert.equal((await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])).rows[0].estoque_quantidade, 5)
    await assert.rejects(
      db.query("SELECT public.recepcao_carrinho_salvar($1,80,$2::jsonb,$3)", [pendingId, JSON.stringify([{ produto_id: productId, quantidade: 2 }]), originalVersion]),
      /RECEPCAO_CARRINHO_CONFLITO_VERSAO/,
    )

    const checkoutArgs = [pendingId, checkoutKey, saved.rows[0].result.updated_at]
    const charged = await db.query("SELECT public.recepcao_cobranca_concluir($1,10,'credito',2,current_date,$2,$3) result", checkoutArgs)
    const repeated = await db.query("SELECT public.recepcao_cobranca_concluir($1,10,'credito',2,current_date,$2,$3) result", checkoutArgs)
    const closure = charged.rows[0].result.fechamento
    assert.equal(repeated.rows[0].result.idempotente, true)
    assert.equal(repeated.rows[0].result.fechamento.id, closure.id)
    assert.equal(Number(closure.valor_final), 160)
    assert.equal(Number(closure.comissao_servico_valor), 37.65)
    assert.equal(Number(closure.comissao_produtos_valor), 8.47)
    assert.equal(Number(closure.comissao_total), 46.12)
    assert.equal((await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])).rows[0].estoque_quantidade, 2)
    assert.equal((await db.query('SELECT status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].status, 'concluido')
    const pending = (await db.query('SELECT status,fechamento_id,cobrado_por FROM public.atendimento_pendencias WHERE id=$1', [pendingId])).rows[0]
    assert.equal(pending.status, 'cobrado')
    assert.equal(pending.fechamento_id, closure.id)
    assert.equal(pending.cobrado_por, receptionUserId)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.recepcao_fila_listar()')).rows[0].total, 0)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.vendas_produtos WHERE fechamento_id=$1', [closure.id])).rows[0].total, 1)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.financeiro_contas_receber WHERE fechamento_id=$1', [closure.id])).rows[0].total, 2)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.atendimento_fechamentos WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 1)

    await setUser(db, otherReceptionId)
    assert.equal((await db.query('SELECT * FROM public.recepcao_produtos_listar()')).rows.length, 0)
    await assert.rejects(
      db.query("SELECT public.recepcao_cobranca_concluir($1,0,'pix',0,current_date,$2,$3)", [pendingId, crypto.randomUUID(), saved.rows[0].result.updated_at]),
      /RECEPCAO_COBRANCA_NAO_ENCONTRADA/,
    )
  } finally {
    await db.query('DELETE FROM public.atendimento_operacao_log WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_itens_pendentes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.estoque_movimentacoes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_movimentacoes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.financeiro_contas_receber WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.vendas_produtos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_pendencias WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.cliente_cortes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.atendimento_fechamentos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
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
