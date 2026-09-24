import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('painel do barbeiro isola agenda e venda baixa estoque uma única vez', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminUserId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  const idempotencyKey = crypto.randomUUID()
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant varejo',$2)", [tenantId, `varejo-${tenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())", [adminUserId, `admin-${adminUserId}@local.test`, barberUserId, `barber-${barberUserId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin varejo',$3),($4,$2,'barbeiro','Barbeiro varejo',$5)", [adminUserId, tenantId, `admin-${adminUserId}@local.test`, barberUserId, `barber-${barberUserId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id,comissao_percentual) VALUES($1,$2,'Barbeiro Varejo',true,$3,40)", [barberId, tenantId, barberUserId])
    await client.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente Varejo')", [customerId, tenantId])
    await client.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,comissao_percentual) VALUES($1,$2,'Corte Varejo',50,30,50)", [serviceId, tenantId])
    await client.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,'2026-09-24 13:00:00+00','concluido',50)", [appointmentId, tenantId, barberId, customerId, serviceId])

    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminUserId])
    const created = await client.query("SELECT public.produto_catalogo_criar('Pomada teste','POM-1','Finalização',NULL,30,10,5,2,10) result")
    const productId = created.rows[0].result.id

    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberUserId])
    const weekly = await client.query("SELECT * FROM public.barbeiro_agenda_listar_periodo('2026-09-21','2026-09-27')")
    assert.equal(weekly.rows.length, 1)
    assert.equal(weekly.rows[0].id, appointmentId)

    const listed = await client.query('SELECT * FROM public.barbeiro_produtos_listar()')
    assert.equal(listed.rows.length, 1)
    assert.equal(listed.rows[0].estoque_quantidade, 5)

    const firstSale = await client.query("SELECT public.barbeiro_produto_vender($1,2,$2,'pix',$3) result", [productId, appointmentId, idempotencyKey])
    const repeatedSale = await client.query("SELECT public.barbeiro_produto_vender($1,2,$2,'pix',$3) result", [productId, appointmentId, idempotencyKey])
    assert.equal(firstSale.rows[0].result.id, repeatedSale.rows[0].result.id)
    assert.equal(Number(firstSale.rows[0].result.valor_venda), 60)
    assert.equal(Number(firstSale.rows[0].result.comissao_valor), 6)

    const stock = await client.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])
    assert.equal(stock.rows[0].estoque_quantidade, 3)
    const summary = await client.query("SELECT public.barbeiro_painel_resumo('2026-09-21','2026-09-27') result")
    assert.equal(summary.rows[0].result.atendimentos, 1)
    assert.equal(Number(summary.rows[0].result.valor_servicos), 50)
    assert.equal(Number(summary.rows[0].result.comissao_servicos), 25)
    assert.equal(Number(summary.rows[0].result.valor_produtos), 60)
    assert.equal(Number(summary.rows[0].result.comissao_produtos), 6)
  } finally {
    await client.query('DELETE FROM public.vendas_produtos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await client.query('DELETE FROM public.produtos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await client.query('DELETE FROM auth.users WHERE id = ANY($1)', [[adminUserId, barberUserId]]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await client.end()
  }
})
