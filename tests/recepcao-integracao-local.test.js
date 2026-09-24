import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('recepção enxerga somente operação da própria barbearia e não acessa financeiro', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const receptionId = crypto.randomUUID()
  const otherReceptionId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const otherProfessionalId = crypto.randomUUID()
  const customerId = crypto.randomUUID()
  const otherCustomerId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const otherServiceId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Recepção teste',$2),($3,'Outra recepção',$4)", [tenantId, `recepcao-${tenantId}`, otherTenantId, `recepcao-${otherTenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [adminId, `admin-${adminId}@local.test`, receptionId, `recepcao-${receptionId}@local.test`, otherReceptionId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Admin',$3,true),($4,$2,'recepcao','Balcão',$5,true),($6,$7,'recepcao','Outro balcão',$8,true)", [adminId, tenantId, `admin-${adminId}@local.test`, receptionId, `recepcao-${receptionId}@local.test`, otherReceptionId, otherTenantId, `recepcao-${otherReceptionId}@local.test`])
    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato,ativo_na_unidade) VALUES($1,'recepcao','ativo',true),($2,'recepcao','ativo',true)", [tenantId, otherTenantId])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Barbeiro local',true),($3,$4,'Barbeiro externo',true)", [professionalId, tenantId, otherProfessionalId, otherTenantId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$2,'Cliente local','11999990000'),($3,$4,'Cliente externo','11888880000')", [customerId, tenantId, otherCustomerId, otherTenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte local',50,30),($3,$4,'Corte externo',60,30)", [serviceId, tenantId, otherServiceId, otherTenantId])
    await db.query("INSERT INTO public.agendamentos(barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,(current_date::timestamp + interval '14 hour') AT TIME ZONE 'America/Sao_Paulo','confirmado',50),($5,$6,$7,$8,(current_date::timestamp + interval '15 hour') AT TIME ZONE 'America/Sao_Paulo','confirmado',60)", [tenantId, professionalId, customerId, serviceId, otherTenantId, otherProfessionalId, otherCustomerId, otherServiceId])
    await db.query("INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim) VALUES($1,$2,extract(dow from current_date)::smallint,true,'09:00','19:00')", [tenantId, professionalId])

    await setUser(db, adminId)
    const users = await db.query('SELECT * FROM public.recepcao_usuarios_listar(true)')
    assert.equal(users.rows.length, 1)
    assert.equal(users.rows[0].id, receptionId)

    await setUser(db, receptionId)
    const agenda = await db.query('SELECT * FROM public.recepcao_agenda_listar_periodo(current_date,current_date)')
    assert.equal(agenda.rows.length, 1)
    assert.equal(agenda.rows[0].cliente_nome, 'Cliente local')
    assert.equal(agenda.rows[0].profissional_nome, 'Barbeiro local')

    const customers = await db.query("SELECT * FROM public.recepcao_clientes_buscar('Cliente',20)")
    assert.deepEqual(customers.rows.map((row) => row.nome), ['Cliente local'])
    assert.deepEqual(Object.keys(customers.rows[0]).sort(), ['id', 'nome', 'proximo_horario', 'telefone'])

    await db.query('SET ROLE authenticated')
    const directClients = await db.query('SELECT id FROM public.clientes')
    const directProducts = await db.query('SELECT id FROM public.produtos')
    assert.equal(directClients.rows.length, 0)
    assert.equal(directProducts.rows.length, 0)
    await db.query('RESET ROLE')

    const availability = await db.query('SELECT * FROM public.agenda_disponibilidade_calendario(current_date,current_date)')
    assert.equal(availability.rows.length, 1)
    assert.equal(availability.rows[0].profissional_nome, 'Barbeiro local')

    await assert.rejects(db.query('SELECT public.financeiro_resumo_periodo(current_date,current_date)'), /FINANCEIRO_SEM_PERMISSAO/)

    await setUser(db, adminId)
    const currentVersion = (await db.query("SELECT updated_at::text FROM public.profiles WHERE id=$1", [receptionId])).rows[0].updated_at
    await db.query('SELECT public.recepcao_usuario_atualizar($1,$2,$3,false,$4)', [receptionId, 'Balcão local', '11977770000', currentVersion])
    await setUser(db, receptionId)
    assert.equal((await db.query("SELECT public.modulo_acesso_verificar('recepcao') result")).rows[0].result, false)
    await assert.rejects(db.query('SELECT * FROM public.recepcao_agenda_listar_periodo(current_date,current_date)'), /RECEPCAO_MODULO_INATIVO/)
  } finally {
    await db.query('RESET ROLE').catch(() => {})
    await db.query('DELETE FROM public.barbearia_modulos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[adminId, receptionId, otherReceptionId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await db.end()
  }
})

async function setUser(db, userId) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])
}
