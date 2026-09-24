import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('agenda local lista e altera somente atendimentos do barbeiro autenticado', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const otherUserId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const otherBarberId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const ownAppointmentId = crypto.randomUUID()
  const otherAppointmentId = crypto.randomUUID()

  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant agenda',$2)", [tenantId, `agenda-${tenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())", [barberUserId, `barber-${barberUserId}@local.test`, otherUserId, `other-${otherUserId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'barbeiro','Barbeiro agenda',$3),($4,$2,'barbeiro','Outro barbeiro',$5)", [barberUserId, tenantId, `barber-${barberUserId}@local.test`, otherUserId, `other-${otherUserId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo,user_id) VALUES($1,$2,'Barbeiro Agenda','Agenda',true,$3),($4,$2,'Outro Barbeiro','Outro',true,$5)", [barberId, tenantId, barberUserId, otherBarberId, otherUserId])
    await client.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$2,'Cliente Agenda','11999999999')", [customerId, tenantId])
    await client.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte Teste',50,45)", [serviceId, tenantId])
    await client.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status) VALUES($1,$2,$3,$4,$5,'2026-09-23 13:00:00+00','pendente'),($6,$2,$7,$4,$5,'2026-09-23 14:00:00+00','pendente')", [ownAppointmentId, tenantId, barberId, customerId, serviceId, otherAppointmentId, otherBarberId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberUserId])

    const context = await client.query('SELECT public.barbeiro_agenda_contexto() contexto')
    assert.equal(context.rows[0].contexto.apelido, 'Agenda')

    const listed = await client.query("SELECT * FROM public.barbeiro_agenda_listar('2026-09-23')")
    assert.equal(listed.rows.length, 1)
    assert.equal(listed.rows[0].id, ownAppointmentId)
    assert.equal(listed.rows[0].cliente_nome, 'Cliente Agenda')

    await client.query("SELECT public.barbeiro_agendamento_mudar_status($1,'pendente','em_atendimento')", [ownAppointmentId])
    await assert.rejects(
      client.query("SELECT public.barbeiro_agendamento_mudar_status($1,'pendente','em_atendimento')", [ownAppointmentId]),
      /AGENDA_STATUS_ALTERADO/,
    )
    await client.query("SELECT public.barbeiro_agendamento_mudar_status($1,'em_atendimento','concluido')", [ownAppointmentId])
    await assert.rejects(
      client.query("SELECT public.barbeiro_agendamento_mudar_status($1,'pendente','cancelado')", [otherAppointmentId]),
      /AGENDA_AGENDAMENTO_NAO_ENCONTRADO/,
    )
  } finally {
    await client.query('DELETE FROM auth.users WHERE id = ANY($1)', [[barberUserId, otherUserId]]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await client.end()
  }
})
