import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('central de clientes protege CPF, evita duplicidade e isola barbearias', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Clientes teste',$2),($3,'Outro clientes',$4)", [tenantId, `clients-${tenantId}`, otherTenantId, `clients-other-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `clients-${adminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin clientes',$3)", [adminId, tenantId, `clients-${adminId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo) VALUES($1,$2,'Profissional Cliente','Preferido',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.clientes(barbearia_id,nome) VALUES($1,'Cliente de outra barbearia')", [otherTenantId])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const created = await db.query("SELECT public.cliente_salvar(NULL,'João Cliente','11999999999','529.982.247-25',false,$1,'Não subir a lateral',NULL) result", [professionalId])
    const clientId = created.rows[0].result.id
    const stored = await db.query('SELECT cpf_hash,cpf_final,updated_at FROM public.clientes WHERE id=$1', [clientId])
    assert.equal(stored.rows[0].cpf_final.trim(), '4725')
    assert.notEqual(stored.rows[0].cpf_hash, '52998224725')
    assert.equal(stored.rows[0].cpf_hash.length, 64)

    const byCpf = await db.query("SELECT * FROM public.clientes_listar('52998224725',100)")
    assert.equal(byCpf.rows.length, 1)
    assert.equal(byCpf.rows[0].id, clientId)
    assert.equal(byCpf.rows[0].cpf_cadastrado, true)
    assert.equal(byCpf.rows[0].barbeiro_favorito_nome, 'Preferido')
    assert.ok(!JSON.stringify(byCpf.rows[0]).includes('52998224725'))

    const detail = await db.query('SELECT public.cliente_ficha_detalhe($1) detail', [clientId])
    assert.equal(detail.rows[0].detail.cliente.nome, 'João Cliente')
    assert.deepEqual(detail.rows[0].detail.cortes, [])

    await assert.rejects(
      db.query("SELECT public.cliente_salvar(NULL,'Duplicado',NULL,'52998224725',false,NULL,NULL,NULL)"),
      /CLIENTE_CPF_DUPLICADO/,
    )
    await assert.rejects(
      db.query("SELECT public.cliente_salvar(NULL,'CPF inválido',NULL,'11111111111',false,NULL,NULL,NULL)"),
      /CLIENTE_CPF_INVALIDO/,
    )

    const version = created.rows[0].result.updated_at
    await db.query("SELECT public.cliente_salvar($1,'João Atualizado','11888888888',NULL,false,$2,'Prefere tesoura',$3)", [clientId, professionalId, version])
    await assert.rejects(
      db.query("SELECT public.cliente_salvar($1,'Versão antiga',NULL,NULL,false,NULL,NULL,$2)", [clientId, version]),
      /CLIENTE_CONFLITO_VERSAO/,
    )
    const all = await db.query('SELECT * FROM public.clientes_listar(NULL,100)')
    assert.equal(all.rows.length, 1)
  } finally {
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.end()
  }
})
