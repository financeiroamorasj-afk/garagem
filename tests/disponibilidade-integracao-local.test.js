import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

function week() {
  return Array.from({ length: 7 }, (_, day) => ({
    dia_semana: day,
    ativo: day >= 1 && day <= 6,
    hora_inicio: day >= 1 && day <= 6 ? '09:00' : null,
    hora_fim: day >= 1 && day <= 6 ? '19:00' : null,
    intervalo_inicio: day >= 1 && day <= 6 ? '12:00' : null,
    intervalo_fim: day >= 1 && day <= 6 ? '13:00' : null,
  }))
}

test('disponibilidade local salva jornada e bloqueios sem atravessar barbearias', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const otherProfessionalId = crypto.randomUUID()
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant jornada',$2),($3,'Outro jornada',$4)", [tenantId, `availability-${tenantId}`, otherTenantId, `availability-other-${otherTenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `availability-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin jornada',$3)", [adminId, tenantId, `availability-${adminId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Profissional jornada',true),($3,$4,'Outro profissional',true)", [professionalId, tenantId, otherProfessionalId, otherTenantId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    await client.query('SELECT public.admin_jornadas_salvar($1,$2::jsonb)', [professionalId, JSON.stringify(week())])
    const listed = await client.query('SELECT * FROM public.admin_jornadas_listar($1)', [professionalId])
    assert.equal(listed.rows.length, 7)
    assert.equal(listed.rows.filter((day) => day.ativo).length, 6)
    assert.equal(String(listed.rows.find((day) => day.dia_semana === 1).intervalo_inicio).slice(0, 5), '12:00')

    const block = await client.query("SELECT public.admin_bloqueio_criar($1,'2026-10-01 12:00:00-03','2026-10-01 14:00:00-03','Consulta') result", [professionalId])
    const blockId = block.rows[0].result.id
    const blocks = await client.query("SELECT * FROM public.admin_bloqueios_listar($1,'2026-09-23','2026-12-31')", [professionalId])
    assert.equal(blocks.rows.length, 1)
    assert.equal(blocks.rows[0].motivo, 'Consulta')
    await assert.rejects(client.query("SELECT public.admin_bloqueio_criar($1,'2026-10-01 14:00:00-03','2026-10-01 12:00:00-03',NULL)", [professionalId]), /DISPONIBILIDADE_BLOQUEIO_INVALIDO/)
    await assert.rejects(client.query('SELECT * FROM public.admin_jornadas_listar($1)', [otherProfessionalId]), /DISPONIBILIDADE_PROFISSIONAL_INVALIDO/)
    await client.query('SELECT public.admin_bloqueio_excluir($1)', [blockId])

    await client.query("UPDATE public.profiles SET role='barbeiro' WHERE id=$1", [adminId])
    await assert.rejects(client.query('SELECT * FROM public.admin_jornadas_listar($1)', [professionalId]), /DISPONIBILIDADE_NAO_AUTORIZADO/)
  } finally {
    await client.query('DELETE FROM public.profissionais_bloqueios WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.profissionais_jornadas WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.profissionais WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.end()
  }
})
