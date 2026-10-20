import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('intervalo configurado pelo gestor vira snapshot e protege os próximos horários', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  await db.connect()

  try {
    const target = await db.query("SELECT (current_date+1)::text data, extract(dow FROM current_date+1)::smallint dow")
    await db.query("INSERT INTO public.barbearias(id,nome,slug,fuso_horario) VALUES($1,'Intervalo configurável',$2,'UTC')", [tenantId, `interval-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `interval-${adminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Gestor intervalo',$3)", [adminId, tenantId, `interval-${adminId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Profissional intervalo',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente intervalo')", [customerId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Serviço 30 minutos',50,30,true)", [serviceId, tenantId])
    await db.query("INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim) VALUES($1,$2,$3,true,'09:00','18:00')", [tenantId, professionalId, target.rows[0].dow])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    assert.equal((await db.query('SELECT public.admin_intervalo_atendimentos_obter() valor')).rows[0].valor, 5)
    assert.equal((await db.query('SELECT public.admin_intervalo_atendimentos_salvar(1) valor')).rows[0].valor, 1)
    await assert.rejects(db.query('SELECT public.admin_intervalo_atendimentos_salvar(61)'), /DISPONIBILIDADE_INTERVALO_INVALIDO/)

    const created = await db.query(`
      INSERT INTO public.agendamentos(barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status)
      VALUES($1,$2,$3,$4,($5::date+time '09:00') AT TIME ZONE 'UTC','confirmado')
      RETURNING margem_minutos_snapshot,ocupacao_fim-data_hora ocupacao
    `, [tenantId, professionalId, customerId, serviceId, target.rows[0].data])
    assert.equal(created.rows[0].margem_minutos_snapshot, 1)
    assert.equal(created.rows[0].ocupacao.minutes, 31)

    const slots = await db.query('SELECT inicio FROM public.agenda_horarios_livres($1,$2,$3,1,50)', [serviceId, target.rows[0].data, professionalId])
    const nineThirty = new Date(`${target.rows[0].data}T09:30:00.000Z`).getTime()
    assert.ok(slots.rows.every((row) => new Date(row.inicio).getTime() !== nineThirty))

    await db.query('SELECT public.admin_intervalo_atendimentos_salvar(5)')
    const snapshot = await db.query('SELECT margem_minutos_snapshot FROM public.agendamentos WHERE barbearia_id=$1', [tenantId])
    assert.equal(snapshot.rows[0].margem_minutos_snapshot, 1, 'alterar a configuração não muda agendamentos existentes')
  } finally {
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await db.end()
  }
})
