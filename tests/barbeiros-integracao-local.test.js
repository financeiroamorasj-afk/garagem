import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('gestão local de barbeiros respeita tenant, versão e papel administrativo', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant barbeiros',$2)", [tenantId, `barbeiros-${tenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin barbeiros',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await client.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,telefone,ativo) VALUES($1,$2,'Profissional Teste','Teste','11999999999',true)", [professionalId, tenantId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const listed = await client.query('SELECT * FROM public.barbeiros_listar(false)')
    assert.equal(listed.rows.length, 1)
    assert.equal(listed.rows[0].id, professionalId)
    assert.equal(listed.rows[0].apelido, 'Teste')

    const versionResult = await client.query('SELECT updated_at::text updated_at FROM public.profissionais WHERE id=$1', [professionalId])
    const version = versionResult.rows[0].updated_at
    await client.query('SELECT public.barbeiros_atualizar($1,$2,$3,$4,$5,$6,$7,$8,$9)', [professionalId, 'Profissional Atualizado', 'Atualizado', '11888888888', 'Degradê', 45, 12, true, version])
    const commissions = await client.query('SELECT comissao_percentual,comissao_produtos_percentual FROM public.profissionais WHERE id=$1', [professionalId])
    assert.equal(Number(commissions.rows[0].comissao_percentual), 45)
    assert.equal(Number(commissions.rows[0].comissao_produtos_percentual), 12)
    await assert.rejects(
      client.query('SELECT public.barbeiros_atualizar($1,$2,$3,$4,$5,$6,$7,$8,$9)', [professionalId, 'Versão antiga', 'Antigo', '11888888888', null, 45, 12, true, version]),
      /BARBEIROS_CONFLITO_VERSAO/,
    )

    const currentVersion = await client.query('SELECT updated_at::text updated_at FROM public.profissionais WHERE id=$1', [professionalId])
    await client.query('SELECT public.barbeiros_atualizar($1,$2,$3,$4,$5,$6,$7,$8,$9)', [professionalId, 'Profissional Atualizado', 'Atualizado', '11888888888', 'Degradê', 45, 12, false, currentVersion.rows[0].updated_at])
    await client.query('UPDATE public.profissionais SET user_id=$1 WHERE id=$2', [adminId, professionalId])
    await client.query("UPDATE public.profiles SET role='barbeiro' WHERE id=$1", [adminId])
    const ownProfessional = await client.query('SELECT public.get_my_profissional_id() id')
    assert.equal(ownProfessional.rows[0].id, null)
    await assert.rejects(client.query('SELECT * FROM public.barbeiros_listar(false)'), /BARBEIROS_NAO_AUTORIZADO/)
  } finally {
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await client.end()
  }
})
