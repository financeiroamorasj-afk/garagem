import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('gestor vê equipe e conflitos; barbeiro vê apenas a própria disponibilidade', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const dayOffProfessionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  await db.connect()
  try {
    const target = (await db.query("SELECT to_char(current_date+7,'YYYY-MM-DD') data,extract(dow FROM current_date+7)::smallint dow")).rows[0]
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Disponibilidade operacional',$2)", [tenantId, `operational-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())", [adminId, `admin-${adminId}@local.test`, barberId, `barber-${barberId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin',$3),($4,$2,'barbeiro','Barbeiro',$5)", [adminId, tenantId, `admin-${adminId}@local.test`, barberId, `barber-${barberId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id) VALUES($1,$2,'Com jornada',true,$3),($4,$2,'De folga',true,NULL)", [professionalId, tenantId, barberId, dayOffProfessionalId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente conflito')", [clientId, tenantId])
    await db.query("INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim) VALUES($1,$2,$3,true,'09:00','17:00','12:00','13:00')", [tenantId, professionalId, target.dow])
    await db.query("INSERT INTO public.profissionais_bloqueios(barbearia_id,profissional_id,inicio,fim,motivo) VALUES($1,$2,($3||' 10:00:00-03')::timestamptz,($3||' 11:00:00-03')::timestamptz,'Consulta')", [tenantId, professionalId, target.data])
    await db.query("INSERT INTO public.agendamentos(barbearia_id,profissional_id,cliente_id,data_hora,status) VALUES($1,$2,$3,($4||' 10:15:00-03')::timestamptz,'confirmado'),($1,$2,$3,($4||' 18:00:00-03')::timestamptz,'pendente')", [tenantId, professionalId, clientId, target.data])

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])
    const adminRows = await db.query('SELECT * FROM public.agenda_disponibilidade_periodo($1,$1)', [target.data])
    assert.equal(adminRows.rows.length, 2)
    const working = adminRows.rows.find((row) => row.profissional_id === professionalId)
    const dayOff = adminRows.rows.find((row) => row.profissional_id === dayOffProfessionalId)
    assert.equal(working.jornada_ativa, true)
    assert.equal(working.bloqueios.length, 1)
    assert.equal(working.conflitos.length, 2)
    assert.ok(working.conflitos.some((item) => item.motivos.includes('Sobrepõe bloqueio')))
    assert.ok(working.conflitos.some((item) => item.motivos.includes('Fora da disponibilidade')))
    assert.equal(dayOff.jornada_ativa, false)
    const monthlyGrid = await db.query('SELECT count(*)::integer total FROM public.agenda_disponibilidade_calendario($1::date,($1::date+41))', [target.data])
    assert.equal(monthlyGrid.rows[0].total, 84)

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberId])
    const barberRows = await db.query('SELECT * FROM public.agenda_disponibilidade_periodo($1,$1)', [target.data])
    assert.equal(barberRows.rows.length, 1)
    assert.equal(barberRows.rows[0].profissional_id, professionalId)
  } finally {
    await db.query('DELETE FROM public.agendamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais_bloqueios WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais_jornadas WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=ANY($1)', [[adminId, barberId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
