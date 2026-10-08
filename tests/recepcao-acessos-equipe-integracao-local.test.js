import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('barbeiro recebe e perde acesso ao balcão sem perder seu papel; login exclusivo pode ser revogado', async () => {
  const db = new pg.Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const receptionId = crypto.randomUUID()
  const outsiderId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Teste de acesso recepção',$2),($3,'Outra unidade',$4)", [tenantId, `recepcao-acesso-${tenantId}`, otherTenantId, `recepcao-outra-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now()),($7,'authenticated','authenticated',$8,now(),now())", [adminId, `admin-${adminId}@local.test`, barberId, `barber-${barberId}@local.test`, receptionId, `reception-${receptionId}@local.test`, outsiderId, `outsider-${outsiderId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Dono',$3,true),($4,$2,'barbeiro','Barbeiro autorizado',$5,true),($6,$2,'recepcao','Recepcionista',$7,true),($8,$9,'barbeiro','Outra unidade',$10,true)", [adminId, tenantId, `admin-${adminId}@local.test`, barberId, `barber-${barberId}@local.test`, receptionId, `reception-${receptionId}@local.test`, outsiderId, otherTenantId, `outsider-${outsiderId}@local.test`])
    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato,ativo_na_unidade) VALUES($1,'recepcao','ativo',true),($2,'recepcao','ativo',true)", [tenantId, otherTenantId])
    await db.query("INSERT INTO public.profissionais(barbearia_id,nome,ativo,user_id) VALUES($1,'Barbeiro autorizado',true,$2),($1,'Outro profissional',true,NULL)", [tenantId, barberId])

    await setUser(db, barberId)
    assert.equal((await db.query('SELECT public.recepcao_acesso_operador_verificar() AS allowed')).rows[0].allowed, false)
    await denied(db, 'SELECT public.recepcao_fila_listar()', /RECEPCAO_NAO_AUTORIZADA/)

    await setUser(db, adminId)
    const listed = await db.query('SELECT * FROM public.recepcao_barbeiros_listar()')
    assert.deepEqual(listed.rows.map((row) => row.id), [barberId])
    await denied(db, 'SELECT public.recepcao_barbeiro_acesso_definir($1,true)', /RECEPCAO_BARBEIRO_NAO_ENCONTRADO/, [outsiderId])
    await db.query('SELECT public.recepcao_barbeiro_acesso_definir($1,true)', [barberId])
    const report = (await db.query('SELECT public.admin_recepcao_resumo(current_date,current_date) AS value')).rows[0].value
    assert.equal(report.operadores.length, 2)

    await setUser(db, barberId)
    assert.equal((await db.query('SELECT public.recepcao_acesso_operador_verificar() AS allowed')).rows[0].allowed, true)
    assert.equal((await db.query('SELECT role FROM public.profiles WHERE id=$1', [barberId])).rows[0].role, 'barbeiro')
    assert.deepEqual((await db.query('SELECT * FROM public.recepcao_fila_listar()')).rows, [])
    assert.equal((await db.query('SELECT * FROM public.agenda_disponibilidade_periodo(current_date,current_date)')).rows.length, 2)
    await db.query('UPDATE public.profissionais SET ativo=false WHERE user_id=$1', [barberId])
    assert.equal((await db.query('SELECT public.recepcao_acesso_operador_verificar() AS allowed')).rows[0].allowed, false)
    await denied(db, 'SELECT public.recepcao_fila_listar()', /RECEPCAO_NAO_AUTORIZADA/)
    await db.query('UPDATE public.profissionais SET ativo=true WHERE user_id=$1', [barberId])

    await setUser(db, adminId)
    await db.query('SELECT public.recepcao_barbeiro_acesso_definir($1,false)', [barberId])
    await setUser(db, barberId)
    assert.equal((await db.query('SELECT public.recepcao_acesso_operador_verificar() AS allowed')).rows[0].allowed, false)
    await denied(db, 'SELECT public.recepcao_fila_listar()', /RECEPCAO_NAO_AUTORIZADA/)

    await setUser(db, receptionId)
    assert.equal((await db.query('SELECT public.recepcao_acesso_operador_verificar() AS allowed')).rows[0].allowed, true)
    await setUser(db, adminId)
    const version = (await db.query('SELECT updated_at::text AS updated_at FROM public.profiles WHERE id=$1', [receptionId])).rows[0].updated_at
    await denied(db, 'SELECT public.recepcao_usuario_atualizar($1,$2,$3,false,$4)', /RECEPCAO_ULTIMO_OPERADOR/, [receptionId, 'Recepcionista', null, version])
    await db.query("SELECT public.configuracoes_modulo_definir_ativo('recepcao',false,NULL)")
    await db.query('SELECT public.recepcao_usuario_atualizar($1,$2,$3,false,$4)', [receptionId, 'Recepcionista', null, version])
    await setUser(db, receptionId)
    assert.equal((await db.query('SELECT public.recepcao_acesso_operador_verificar() AS allowed')).rows[0].allowed, false)
    await denied(db, 'SELECT public.recepcao_fila_listar()', /RECEPCAO_MODULO_INATIVO/)
  } finally {
    await db.query('ROLLBACK').catch(() => {})
    await db.end()
  }
})

async function setUser(db, userId) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userId])
}

async function denied(db, sql, pattern, params = []) {
  await db.query('SAVEPOINT before_denied')
  await assert.rejects(db.query(sql, params), pattern)
  await db.query('ROLLBACK TO SAVEPOINT before_denied')
}
