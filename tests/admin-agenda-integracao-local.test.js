import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('agenda geral local reúne a equipe sem misturar outra barbearia', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalA = crypto.randomUUID()
  const professionalB = crypto.randomUUID()
  const otherProfessional = crypto.randomUUID()
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant agenda admin',$2),($3,'Outro tenant',$4)", [tenantId, `agenda-admin-${tenantId}`, otherTenantId, `agenda-other-${otherTenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-agenda-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin agenda',$3)", [adminId, tenantId, `admin-agenda-${adminId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo) VALUES($1,$2,'Profissional A','Alpha',true),($3,$2,'Profissional B','Beta',true),($4,$5,'Outro Profissional','Outro',true)", [professionalA, tenantId, professionalB, otherProfessional, otherTenantId])
    await client.query("INSERT INTO public.agendamentos(barbearia_id,profissional_id,cliente_nome_manual,data_hora,status) VALUES($1,$2,'Cliente A','2026-09-23 12:00:00+00','pendente'),($1,$3,'Cliente B','2026-09-23 13:00:00+00','confirmado'),($4,$5,'Cliente de fora','2026-09-23 14:00:00+00','pendente')", [tenantId, professionalA, professionalB, otherTenantId, otherProfessional])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const listed = await client.query("SELECT * FROM public.admin_agenda_listar_periodo('2026-09-21','2026-09-27')")
    assert.equal(listed.rows.length, 2)
    assert.deepEqual(listed.rows.map((row) => row.profissional_apelido).sort(), ['Alpha', 'Beta'])
    assert.equal(listed.rows.some((row) => row.cliente_nome === 'Cliente de fora'), false)
    await assert.rejects(
      client.query("SELECT * FROM public.admin_agenda_listar_periodo('2026-01-01','2026-03-01')"),
      /AGENDA_PERIODO_MUITO_LONGO/,
    )
  } finally {
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.end()
  }
})
