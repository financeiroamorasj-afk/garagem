import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('barbeiro e gestor que atende criam novo corte confirmado somente na própria agenda', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const managerUserId = crypto.randomUUID()
  const unlinkedManagerId = crypto.randomUUID()
  const barberProfessionalId = crypto.randomUUID()
  const managerProfessionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()

  await db.connect()
  try {
    const target = (await db.query(`
      SELECT
        (current_date + 1)::date data,
        extract(dow FROM current_date + 1)::smallint dow
    `)).rows[0]

    await db.query("INSERT INTO public.barbearias(id,nome,slug,fuso_horario) VALUES($1,'Novo corte',$2,'UTC')", [tenantId, `novo-corte-${tenantId}`])
    await db.query(
      "INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())",
      [barberUserId, `barber-${barberUserId}@local.test`, managerUserId, `manager-${managerUserId}@local.test`, unlinkedManagerId, `unlinked-${unlinkedManagerId}@local.test`],
    )
    await db.query(
      "INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'barbeiro','Barbeiro',$3,true),($4,$2,'admin','Gestor',$5,true),($6,$2,'admin','Gestor sem vínculo',$7,true)",
      [barberUserId, tenantId, `barber-${barberUserId}@local.test`, managerUserId, `manager-${managerUserId}@local.test`, unlinkedManagerId, `unlinked-${unlinkedManagerId}@local.test`],
    )
    await db.query(
      "INSERT INTO public.profissionais(id,barbearia_id,user_id,nome,ativo) VALUES($1,$2,$3,'Barbeiro',true),($4,$2,$5,'Gestor',true)",
      [barberProfessionalId, tenantId, barberUserId, managerProfessionalId, managerUserId],
    )
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente novo corte')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Corte',55,30,true)", [serviceId, tenantId])
    await db.query(
      "INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim) VALUES($1,$2,$4,true,'09:00','18:00'),($1,$3,$4,true,'09:00','18:00')",
      [tenantId, barberProfessionalId, managerProfessionalId, target.dow],
    )

    for (const [userId, professionalId] of [[barberUserId, barberProfessionalId], [managerUserId, managerProfessionalId]]) {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
      const slots = await db.query('SELECT * FROM public.agenda_horarios_livres($1,$2,$3,1,50)', [serviceId, target.data, professionalId])
      assert.ok(slots.rows.length > 0)

      const created = (await db.query(
        'SELECT public.barbeiro_agendamento_criar($1,$2,$3,50) result',
        [clientId, serviceId, slots.rows[0].inicio],
      )).rows[0].result
      assert.equal(created.status, 'confirmado')
      assert.equal(created.profissional_id, professionalId)

      const persisted = (await db.query(
        'SELECT profissional_id,status,origem,pagamento_status,valor_final FROM public.agendamentos WHERE id=$1',
        [created.id],
      )).rows[0]
      assert.equal(persisted.profissional_id, professionalId)
      assert.equal(persisted.status, 'confirmado')
      assert.equal(persisted.origem, 'interno')
      assert.equal(persisted.pagamento_status, 'nao_solicitado')
      assert.equal(Number(persisted.valor_final), 50)
    }

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [unlinkedManagerId])
    await assert.rejects(
      db.query("SELECT public.barbeiro_agendamento_criar($1,$2,now()+interval '1 day',50)", [clientId, serviceId]),
      /AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO/,
    )
  } finally {
    await db.query('DELETE FROM public.agendamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais_jornadas WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.servicos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[barberUserId, managerUserId, unlinkedManagerId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
