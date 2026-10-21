import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('gestor profissional opera somente a própria agenda sem perder o papel administrativo', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const otherProfessionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const ownAppointmentId = crypto.randomUUID()
  const otherAppointmentId = crypto.randomUUID()

  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Gestor profissional',$2)", [tenantId, `gestor-prof-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `gestor-prof-${adminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Gestor que atende',$3,true)", [adminId, tenantId, `gestor-prof-${adminId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Outro profissional',true)", [otherProfessionalId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Corte gestor',60,30,true)", [serviceId, tenantId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente gestor')", [customerId, tenantId])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    await assert.rejects(db.query('SELECT public.barbeiro_agenda_contexto()'), /AGENDA_BARBEIRO_NAO_AUTORIZADO|AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO/)

    const linked = (await db.query('SELECT public.admin_vincular_como_profissional() result')).rows[0].result
    assert.equal(linked.user_id, adminId)
    assert.equal((await db.query('SELECT role FROM public.profiles WHERE id=$1', [adminId])).rows[0].role, 'admin')

    await db.query(
      "INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,(current_date::timestamp+time '10:00') AT TIME ZONE 'America/Sao_Paulo','confirmado',60),($6,$2,$7,$4,$5,(current_date::timestamp+time '11:00') AT TIME ZONE 'America/Sao_Paulo','confirmado',60)",
      [ownAppointmentId, tenantId, linked.id, customerId, serviceId, otherAppointmentId, otherProfessionalId],
    )

    const context = (await db.query('SELECT public.barbeiro_agenda_contexto() result')).rows[0].result
    assert.equal(context.id, linked.id)

    const today = await db.query('SELECT * FROM public.barbeiro_agenda_listar_memoria(current_date)')
    assert.deepEqual(today.rows.map((row) => row.id), [ownAppointmentId])

    const started = (await db.query("SELECT public.barbeiro_agendamento_mudar_status($1,'confirmado','em_atendimento') result", [ownAppointmentId])).rows[0].result
    assert.equal(started.status, 'em_atendimento')
    const active = (await db.query('SELECT public.barbeiro_atendimento_ativo() result')).rows[0].result
    assert.equal(active.id, ownAppointmentId)

    await assert.rejects(
      db.query("SELECT public.barbeiro_agendamento_mudar_status($1,'confirmado','cancelado')", [otherAppointmentId]),
      /AGENDA_AGENDAMENTO_NAO_ENCONTRADO/,
    )

    const period = await db.query('SELECT * FROM public.barbeiro_agenda_listar_periodo(current_date,current_date)')
    assert.deepEqual(period.rows.map((row) => row.id), [ownAppointmentId])
    const materials = await db.query('SELECT * FROM public.barbeiro_atendimento_materiais_listar($1)', [ownAppointmentId])
    assert.equal(materials.rows.length, 0)
    await assert.rejects(
      db.query("SELECT public.barbeiro_checkout_concluir($1,'{}'::jsonb,'[]'::jsonb,60,0,'dinheiro',0,current_date,NULL)", [ownAppointmentId]),
      /CHECKOUT_CHAVE_INVALIDA/,
    )
    await assert.rejects(
      db.query("SELECT public.barbeiro_atendimento_enviar_recepcao($1,'{}'::jsonb,'[]'::jsonb,60,NULL)", [ownAppointmentId]),
      /FILA_RECEPCAO_MODULO_INATIVO|FILA_RECEPCAO_CHAVE_INVALIDA/,
    )
    const summary = (await db.query('SELECT public.barbeiro_painel_resumo(current_date,current_date) result')).rows[0].result
    assert.equal(summary.proximos, 1)
    await db.query('SELECT * FROM public.barbeiro_produtos_listar()')
  } finally {
    await db.query('DELETE FROM public.agendamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.servicos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
