import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('motor de encaixe respeita jornada, bloqueios, ocupação e isolamento do tenant', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalA = crypto.randomUUID()
  const professionalB = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const otherServiceId = crypto.randomUUID()
  await client.connect()

  try {
    const target = await client.query("SELECT to_char(current_date + 7,'YYYY-MM-DD') data, extract(dow FROM current_date + 7)::smallint dow")
    const targetDate = target.rows[0].data
    const dayOfWeek = target.rows[0].dow

    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant encaixe',$2),($3,'Outro encaixe',$4)", [tenantId, `walk-in-${tenantId}`, otherTenantId, `walk-in-other-${otherTenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `walk-in-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin encaixe',$3)", [adminId, tenantId, `walk-in-${adminId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo) VALUES($1,$2,'Ana Profissional','Ana',true),($3,$2,'Bia Profissional','Bia',true)", [professionalA, tenantId, professionalB])
    await client.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$2,'Cliente Encaixe','11999999999')", [clientId, tenantId])
    await client.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Corte 30',45,30,true),($3,$4,'Serviço de fora',100,30,true)", [serviceId, tenantId, otherServiceId, otherTenantId])
    await client.query("INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim) VALUES($1,$2,$4,true,'09:00','12:00'),($1,$3,$4,true,'09:00','12:00')", [tenantId, professionalA, professionalB, dayOfWeek])
    await client.query("INSERT INTO public.profissionais_bloqueios(barbearia_id,profissional_id,inicio,fim,motivo) VALUES($1,$2,($3||' 09:00:00-03')::timestamptz,($3||' 10:00:00-03')::timestamptz,'Bloqueio teste')", [tenantId, professionalA, targetDate])
    await client.query("INSERT INTO public.agendamentos(barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status) VALUES($1,$2,$3,$4,($5||' 09:00:00-03')::timestamptz,'confirmado')", [tenantId, professionalB, clientId, serviceId, targetDate])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const catalog = await client.query('SELECT public.agenda_encaixe_catalogo() catalogo')
    assert.equal(catalog.rows[0].catalogo.servicos.length, 1)
    assert.equal(catalog.rows[0].catalogo.profissionais.length, 2)

    const availability = await client.query('SELECT * FROM public.agenda_horarios_livres($1,$2,NULL,1,50)', [serviceId, targetDate])
    assert.ok(availability.rows.length > 0)
    const localMinutes = (row) => {
      const parts = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).formatToParts(new Date(row.inicio))
      return Number(parts.find((part) => part.type === 'hour').value) * 60 + Number(parts.find((part) => part.type === 'minute').value)
    }
    assert.ok(availability.rows.filter((row) => row.profissional_id === professionalA).every((row) => localMinutes(row) >= 10 * 60))
    assert.ok(availability.rows.filter((row) => row.profissional_id === professionalB).every((row) => localMinutes(row) >= 9 * 60 + 30))

    const chosen = availability.rows[0]
    const created = await client.query('SELECT public.agenda_encaixe_criar($1,$2,$3,$4,44) result', [clientId, serviceId, chosen.profissional_id, chosen.inicio])
    assert.equal(created.rows[0].result.status, 'encaixe')
    const persisted = await client.query('SELECT status,duracao_minutos_snapshot,data_fim-data_hora duracao FROM public.agendamentos WHERE id=$1', [created.rows[0].result.id])
    assert.equal(persisted.rows[0].status, 'encaixe')
    assert.equal(persisted.rows[0].duracao_minutos_snapshot, 30)
    assert.equal(persisted.rows[0].duracao.minutes, 30)

    await assert.rejects(
      client.query('SELECT public.agenda_encaixe_criar($1,$2,$3,$4,44)', [clientId, serviceId, chosen.profissional_id, chosen.inicio]),
      /AGENDA_HORARIO_INDISPONIVEL/,
    )
    await assert.rejects(
      client.query('SELECT * FROM public.agenda_horarios_livres($1,$2,NULL,1,10)', [otherServiceId, targetDate]),
      /AGENDA_SERVICO_INVALIDO/,
    )
  } finally {
    await client.query('DELETE FROM public.agendamentos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.profissionais_bloqueios WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.profissionais_jornadas WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.clientes WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.servicos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.profissionais WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.end()
  }
})
