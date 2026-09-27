import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('jornada do fundador liga portal, agendas, checkout PIX, estoque, comissão e financeiro', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminUserId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const productId = crypto.randomUUID()
  const slug = `fundador-${tenantId}`
  const checkoutKey = crypto.randomUUID()

  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Barbearia Fundadora',$2)", [tenantId, slug])
    await db.query(
      "INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())",
      [adminUserId, `admin-${adminUserId}@local.test`, barberUserId, `barber-${barberUserId}@local.test`],
    )
    await db.query(
      "INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Dono fundador',$3,true),($4,$2,'barbeiro','Barbeiro fundador',$5,true)",
      [adminUserId, tenantId, `admin-${adminUserId}@local.test`, barberUserId, `barber-${barberUserId}@local.test`],
    )
    await db.query(
      "INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo,user_id,comissao_percentual,comissao_produtos_percentual) VALUES($1,$2,'Barbeiro fundador','Fundador',true,$3,40,10)",
      [professionalId, tenantId, barberUserId],
    )
    await db.query(
      "INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,comissao_percentual,ativo) VALUES($1,$2,'Corte fundador',60,30,50,true)",
      [serviceId, tenantId],
    )
    await db.query(
      "INSERT INTO public.produtos(id,barbearia_id,nome,preco_venda,preco_custo,estoque_quantidade,comissao_percentual,ativo) VALUES($1,$2,'Pomada fundador',25,8,4,10,true)",
      [productId, tenantId],
    )
    await db.query(`INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim)
      SELECT $1,$2,d,true,'09:00','18:00' FROM generate_series(0,6) d`, [tenantId, professionalId])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal) VALUES($1,'Caixa fundador','corrente',true)", [tenantId])
    await db.query("INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES($1,'Serviços','entrada','receita_servicos'),($1,'Produtos','entrada','receita_produtos')", [tenantId])

    await db.query('SET ROLE anon')
    const registration = await db.query(
      "SELECT public.portal_cadastrar($1,'52998224725','Cliente fundador','51999999999') result",
      [slug],
    )
    const token = registration.rows[0].result.token
    const slots = await db.query(
      "SELECT *, (inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS data_local FROM public.portal_horarios_livres($1,$2,current_date+1,$3,3,20)",
      [token, serviceId, professionalId],
    )
    assert.ok(slots.rows.length > 0)
    const slot = slots.rows[0]
    const created = await db.query(
      'SELECT public.portal_agendamento_criar($1,$2,$3,$4) result',
      [token, serviceId, professionalId, slot.inicio],
    )
    const appointmentId = created.rows[0].result.id
    assert.equal(created.rows[0].result.status, 'pendente')

    await db.query('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminUserId])
    const adminAgenda = await db.query('SELECT * FROM public.admin_agenda_listar($1)', [slot.data_local])
    const adminAppointment = adminAgenda.rows.find((item) => item.id === appointmentId)
    assert.equal(adminAppointment?.cliente_nome, 'Cliente fundador')
    assert.equal((await db.query('SELECT origem FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].origem, 'portal_cliente')

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberUserId])
    const barberAgenda = await db.query('SELECT * FROM public.barbeiro_agenda_listar_memoria($1)', [slot.data_local])
    assert.equal(barberAgenda.rows.some((item) => item.id === appointmentId), true)
    const started = await db.query(
      "SELECT public.barbeiro_agendamento_mudar_status($1,'pendente','em_atendimento') result",
      [appointmentId],
    )
    assert.equal(started.rows[0].result.status, 'em_atendimento')

    const checkout = await db.query(
      "SELECT public.barbeiro_checkout_concluir($1,$2::jsonb,$3::jsonb,60,0,'pix',0,current_date,$4) result",
      [
        appointmentId,
        JSON.stringify({ estilo: 'Degradê baixo', acabamento: 'Tesoura', preferencias_cliente: 'Manter o topo' }),
        JSON.stringify([{ produto_id: productId, quantidade: 1 }]),
        checkoutKey,
      ],
    )
    const closure = checkout.rows[0].result.fechamento
    assert.equal(Number(closure.valor_final), 85)
    assert.equal(Number(closure.comissao_servico_valor), 30)
    assert.equal(Number(closure.comissao_produtos_valor), 2.5)
    assert.equal(Number(closure.comissao_total), 32.5)
    assert.equal(closure.forma_pagamento, 'pix')

    const appointment = await db.query('SELECT status,pagamento_status FROM public.agendamentos WHERE id=$1', [appointmentId])
    assert.deepEqual(appointment.rows[0], { status: 'concluido', pagamento_status: 'pago' })
    assert.equal((await db.query('SELECT estoque_quantidade FROM public.produtos WHERE id=$1', [productId])).rows[0].estoque_quantidade, 3)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.estoque_movimentacoes WHERE fechamento_id=$1', [closure.id])).rows[0].total, 1)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.cliente_cortes WHERE agendamento_id=$1', [appointmentId])).rows[0].total, 1)

    const receivables = await db.query('SELECT origem,valor_bruto,status FROM public.financeiro_contas_receber WHERE fechamento_id=$1 ORDER BY origem', [closure.id])
    assert.equal(receivables.rows.length, 2)
    assert.equal(receivables.rows.reduce((sum, item) => sum + Number(item.valor_bruto), 0), 85)
    assert.ok(receivables.rows.every((item) => item.status === 'liquidado'))
    assert.equal(
      Number((await db.query("SELECT COALESCE(sum(CASE WHEN direcao='entrada' THEN valor ELSE -valor END),0) saldo FROM public.financeiro_movimentacoes WHERE fechamento_id=$1", [closure.id])).rows[0].saldo),
      85,
    )
  } finally {
    await db.query('RESET ROLE').catch(() => {})
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
    await db.query('DELETE FROM public.profissionais_jornadas WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[adminUserId, barberUserId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
