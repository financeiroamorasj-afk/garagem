import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('grade da agenda nasce em 30 minutos e pode ser alterada para 15', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  await db.connect()

  try {
    const target = await db.query("SELECT (current_date+1)::text data, extract(dow FROM current_date+1)::smallint dow")
    await db.query("INSERT INTO public.barbearias(id,nome,slug,fuso_horario) VALUES($1,'Grade configurável',$2,'UTC')", [tenantId, `grade-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `grade-${adminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Gestor grade',$3)", [adminId, tenantId, `grade-${adminId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Profissional grade',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Serviço 30 minutos',50,30,true)", [serviceId, tenantId])
    await db.query("INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim) VALUES($1,$2,$3,true,'09:00','12:00')", [tenantId, professionalId, target.rows[0].dow])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    assert.equal((await db.query('SELECT public.admin_grade_agenda_obter() valor')).rows[0].valor, 30)
    const slots30 = await db.query('SELECT inicio FROM public.agenda_horarios_livres($1,$2,$3,1,50)', [serviceId, target.rows[0].data, professionalId])
    assert.ok(slots30.rows.length > 1)
    assert.ok(slots30.rows.every((row) => [0, 30].includes(new Date(row.inicio).getUTCMinutes())))

    assert.equal((await db.query('SELECT public.admin_grade_agenda_salvar(15) valor')).rows[0].valor, 15)
    const slots15 = await db.query('SELECT inicio FROM public.agenda_horarios_livres($1,$2,$3,1,50)', [serviceId, target.rows[0].data, professionalId])
    assert.ok(slots15.rows.some((row) => new Date(row.inicio).getUTCMinutes() === 15))
    await assert.rejects(db.query('SELECT public.admin_grade_agenda_salvar(20)'), /DISPONIBILIDADE_GRADE_INVALIDA/)
  } finally {
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await db.end()
  }
})
