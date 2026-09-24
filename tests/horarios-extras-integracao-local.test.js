import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('horário extra local é persistido, validado e isolado por barbearia', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant extra',$2),($3,'Outro extra',$4)", [tenantId, `extra-${tenantId}`, otherTenantId, `extra-other-${otherTenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-extra-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin extra',$3)", [adminId, tenantId, `admin-extra-${adminId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo) VALUES($1,$2,'Profissional Extra','Extra',true)", [professionalId, tenantId])
    await client.query("INSERT INTO public.agenda_horarios_extras(barbearia_id,data,hora_inicio,hora_fim,criado_por) VALUES($1,'2026-09-23','18:00','19:00',$2)", [otherTenantId, adminId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    await client.query("SELECT public.admin_horario_extra_criar('2026-09-23','19:00','21:00',$1,'Demanda adicional')", [professionalId])
    const listed = await client.query("SELECT * FROM public.admin_horarios_extras_listar('2026-09-21','2026-09-27')")
    assert.equal(listed.rows.length, 1)
    assert.equal(listed.rows[0].profissional_id, professionalId)
    assert.equal(listed.rows[0].profissional_apelido, 'Extra')
    assert.equal(listed.rows[0].motivo, 'Demanda adicional')
    await assert.rejects(
      client.query("SELECT public.admin_horario_extra_criar('2026-09-23','21:00','19:00',$1,NULL)", [professionalId]),
      /HORARIO_EXTRA_INTERVALO_INVALIDO/,
    )
  } finally {
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.end()
  }
})
