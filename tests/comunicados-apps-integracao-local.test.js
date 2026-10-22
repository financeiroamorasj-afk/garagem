import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('central de avisos respeita aplicativo, tenant e leitura individual', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const managerNoticeId = crypto.randomUUID()
  const barberNoticeId = crypto.randomUUID()
  const bothNoticeId = crypto.randomUUID()
  const otherNoticeId = crypto.randomUUID()
  await db.connect()

  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Avisos tenant',$2),($3,'Outro tenant',$4)", [tenantId, `avisos-${tenantId}`, otherTenantId, `avisos-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now())", [adminId, `avisos-admin-${adminId}@local.test`, barberId, `avisos-barber-${barberId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Gestor avisos',$3),($4,$2,'barbeiro','Barbeiro avisos',$5)", [adminId, tenantId, `avisos-admin-${adminId}@local.test`, barberId, `avisos-barber-${barberId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,user_id,nome,ativo) VALUES($1,$2,$3,'Barbeiro avisos',true)", [professionalId, tenantId, barberId])
    await db.query(`
      INSERT INTO public.app_comunicados(id,chave,barbearia_id,titulo,resumo,publico,rota_gestao,rota_barbeiro,publicado_em)
      VALUES
        ($1,$2,$5,'Aviso da gestão','Conteúdo exclusivo para o aplicativo de gestão.','gestao','/admin/agenda',NULL,now()-interval '1 minute'),
        ($3,$4,$5,'Aviso do barbeiro','Conteúdo exclusivo para o aplicativo do barbeiro.','barbeiros',NULL,'/barber/dashboard',now()-interval '1 minute'),
        ($6,$7,NULL,'Aviso para ambos','Conteúdo compartilhado entre os dois aplicativos.','ambos','/admin/dashboard','/barber/dashboard',now()-interval '1 minute'),
        ($8,$9,$10,'Aviso de outro tenant','Este conteúdo não pode atravessar barbearias.','gestao','/admin/agenda',NULL,now()-interval '1 minute')
    `, [managerNoticeId, `manager-${managerNoticeId}`, barberNoticeId, `barber-${barberNoticeId}`, tenantId, bothNoticeId, `both-${bothNoticeId}`, otherNoticeId, `other-${otherNoticeId}`, otherTenantId])

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])
    const managerRows = await db.query("SELECT * FROM public.app_comunicados_listar('gestao',50)")
    const managerIds = new Set(managerRows.rows.map((row) => row.id))
    assert.ok(managerIds.has(managerNoticeId))
    assert.ok(managerIds.has(bothNoticeId))
    assert.ok(!managerIds.has(barberNoticeId))
    assert.ok(!managerIds.has(otherNoticeId))
    assert.equal(managerRows.rows.find((row) => row.id === managerNoticeId).destino, '/admin/agenda')

    await db.query("SELECT public.app_comunicado_marcar_lido($1,'gestao')", [managerNoticeId])
    const managerRead = await db.query("SELECT lido FROM public.app_comunicados_listar('gestao',50) WHERE id=$1", [managerNoticeId])
    assert.equal(managerRead.rows[0].lido, true)

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberId])
    const barberRows = await db.query("SELECT * FROM public.app_comunicados_listar('barbeiro',50)")
    const barberIds = new Set(barberRows.rows.map((row) => row.id))
    assert.ok(barberIds.has(barberNoticeId))
    assert.ok(barberIds.has(bothNoticeId))
    assert.ok(!barberIds.has(managerNoticeId))
    assert.equal(barberRows.rows.find((row) => row.id === bothNoticeId).destino, '/barber/dashboard')
  } finally {
    await db.query('DELETE FROM public.app_comunicados WHERE id=ANY($1::uuid[])', [[managerNoticeId, barberNoticeId, bothNoticeId, otherNoticeId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=ANY($1::uuid[])', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])', [[adminId, barberId]]).catch(() => {})
    await db.end()
  }
})
