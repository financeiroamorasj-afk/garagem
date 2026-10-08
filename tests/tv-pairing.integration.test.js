import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from 'pg'

const databaseUrl = globalThis.process.env.TV_TEST_DATABASE_URL

test('pareamento e controle da TV respeitam permissões e revogação', { skip: !databaseUrl }, async () => {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('BEGIN')
    const { rows: [admin] } = await client.query(`
      SELECT id,barbearia_id FROM public.profiles
      WHERE role='admin' AND barbearia_id IS NOT NULL AND lower(email)='admin@teste.local' LIMIT 1
    `)
    assert.ok(admin, 'admin local de teste necessário')
    const { rows: [barber] } = await client.query(`
      SELECT id,barbearia_id FROM public.profiles WHERE role='barbeiro' AND coalesce(ativo,true)
        AND barbearia_id <> $1 LIMIT 1
    `, [admin.barbearia_id])
    assert.ok(barber, 'barbeiro de teste necessário')

    await client.query('SET ROLE anon')
    const { rows: [created] } = await client.query('SELECT public.tv_pareamento_iniciar() AS value')
    const { token, codigo } = created.value
    assert.match(token, /^[a-f0-9]{64}$/)
    assert.match(codigo, /^[A-F0-9]{8}$/)
    const { rows: [pending] } = await client.query('SELECT public.tv_estado_ler($1) AS value', [token])
    assert.equal(pending.value.estado, 'pendente')
    assert.equal(pending.value.codigo, codigo)

    await client.query('SET ROLE authenticated')
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [barber.id])
    await client.query('SAVEPOINT denied_pair')
    await assert.rejects(() => client.query('SELECT public.tv_pareamento_confirmar($1,$2)', [codigo, 'TV teste']), /TV_SEM_PERMISSAO/)
    await client.query('ROLLBACK TO SAVEPOINT denied_pair')

    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin.id])
    const { rows: [paired] } = await client.query('SELECT public.tv_pareamento_confirmar($1,$2) AS value', [codigo, 'TV teste'])
    const deviceId = paired.value.id
    assert.ok(deviceId)
    await client.query('SET ROLE anon')
    const { rows: [connected] } = await client.query('SELECT public.tv_estado_ler($1) AS value', [token])
    assert.equal(connected.value.estado, 'conectado')
    assert.equal(connected.value.identidade.nome, 'Garagem Local')
    assert.ok(Array.isArray(connected.value.agenda))
    assert.ok(connected.value.agenda.every((row) => !('cliente_telefone' in row) && !('valor_final' in row)))

    await client.query('SET ROLE postgres')
    await client.query('UPDATE public.profiles SET barbearia_id=$1 WHERE id=$2', [admin.barbearia_id, barber.id])
    await client.query('SET ROLE authenticated')
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [barber.id])
    await client.query('SAVEPOINT denied_video')
    await assert.rejects(() => client.query('SELECT public.tv_video_definir($1,$2,$3,$4)', [deviceId, 'dQw4w9WgXcQ', null, 'split']), /TV_SEM_PERMISSAO/)
    await client.query('ROLLBACK TO SAVEPOINT denied_video')

    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin.id])
    await client.query('SELECT public.tv_permissao_definir($1,true)', [barber.id])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [barber.id])
    await client.query('SELECT public.tv_video_definir($1,$2,$3,$4)', [deviceId, 'dQw4w9WgXcQ', null, 'smart'])
    const { rows: [listed] } = await client.query('SELECT public.tv_aparelhos_listar() AS value')
    assert.equal(listed.value[0].video_id, 'dQw4w9WgXcQ')
    await client.query('SET ROLE postgres')
    await client.query('UPDATE public.profiles SET ativo=false WHERE id=$1', [barber.id])
    await client.query('SET ROLE authenticated')
    await client.query('SAVEPOINT denied_inactive')
    await assert.rejects(() => client.query('SELECT public.tv_aparelhos_listar()'), /TV_SEM_PERMISSAO/)
    await client.query('ROLLBACK TO SAVEPOINT denied_inactive')
    await client.query('SET ROLE postgres')
    await client.query('UPDATE public.profiles SET ativo=true,barbearia_id=$1 WHERE id=$2', [barber.barbearia_id, barber.id])
    await client.query('SET ROLE authenticated')
    await client.query('SAVEPOINT denied_other_tenant')
    await assert.rejects(() => client.query('SELECT public.tv_video_definir($1,$2,$3,$4)', [deviceId, null, null, 'split']), /TV_SEM_PERMISSAO/)
    await client.query('ROLLBACK TO SAVEPOINT denied_other_tenant')
    await client.query('SAVEPOINT denied_revoke')
    await assert.rejects(() => client.query('SELECT public.tv_aparelho_revogar($1)', [deviceId]), /TV_SEM_PERMISSAO/)
    await client.query('ROLLBACK TO SAVEPOINT denied_revoke')

    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin.id])
    await client.query('SELECT public.tv_aparelho_revogar($1)', [deviceId])
    await client.query('SET ROLE anon')
    const { rows: [revoked] } = await client.query('SELECT public.tv_estado_ler($1) AS value', [token])
    assert.equal(revoked.value.estado, 'revogado')
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
})
