import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('entitlement comercial e ativação do módulo são isolados por barbearia', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const otherAdminId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Módulos teste',$2),($3,'Outro tenant',$4)", [tenantId, `modulos-${tenantId}`, otherTenantId, `modulos-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [adminId, `admin-${adminId}@local.test`, barberId, `barber-${barberId}@local.test`, otherAdminId, `admin-${otherAdminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin módulos',$3),($4,$2,'barbeiro','Barbeiro módulos',$5),($6,$7,'admin','Outro admin',$8)", [adminId, tenantId, `admin-${adminId}@local.test`, barberId, `barber-${barberId}@local.test`, otherAdminId, otherTenantId, `admin-${otherAdminId}@local.test`])

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])
    const unavailable = await db.query('SELECT public.configuracoes_modulos_listar() result')
    assert.equal(unavailable.rows[0].result[0].status_contrato, 'nao_contratado')
    assert.equal(unavailable.rows[0].result[0].ativo, false)
    await assert.rejects(
      db.query("SELECT public.configuracoes_modulo_definir_ativo('recepcao',true,NULL)"),
      /MODULO_NAO_CONTRATADO/,
    )

    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato) VALUES($1,'recepcao','ativo')", [tenantId])
    const activated = await db.query("SELECT public.configuracoes_modulo_definir_ativo('recepcao',true,NULL) result")
    assert.equal(activated.rows[0].result.ativo, true)
    assert.equal(await accessFor(db, adminId), true)
    assert.equal(await accessFor(db, barberId), true)
    assert.equal(await accessFor(db, otherAdminId), false)

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberId])
    await assert.rejects(
      db.query("SELECT public.configuracoes_modulo_definir_ativo('recepcao',false,NULL)"),
      /MODULO_SEM_PERMISSAO/,
    )

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])
    await db.query('SET ROLE authenticated')
    await assert.rejects(
      db.query("UPDATE public.barbearia_modulos SET status_contrato='cancelado' WHERE barbearia_id=$1", [tenantId]),
      /permission denied/i,
    )
    await db.query('RESET ROLE')

    await db.query("UPDATE public.barbearia_modulos SET status_contrato='suspenso' WHERE barbearia_id=$1", [tenantId])
    assert.equal(await accessFor(db, adminId), false)
  } finally {
    await db.query('RESET ROLE').catch(() => {})
    await db.query('DELETE FROM public.barbearia_modulos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[adminId, barberId, otherAdminId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.end()
  }
})

async function accessFor(db, userId) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
  return (await db.query("SELECT public.modulo_acesso_verificar('recepcao') result")).rows[0].result
}
