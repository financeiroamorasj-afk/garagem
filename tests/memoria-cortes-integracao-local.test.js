import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('conclusão registra memória ativa, arquiva a anterior e atualiza preferências', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const barberUserId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const firstAppointment = crypto.randomUUID()
  const secondAppointment = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Memória cortes',$2)", [tenantId, `cut-memory-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [barberUserId, `cut-memory-${barberUserId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'barbeiro','Barbeiro memória',$3)", [barberUserId, tenantId, `cut-memory-${barberUserId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id) VALUES($1,$2,'Barbeiro memória',true,$3)", [professionalId, tenantId, barberUserId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente memória')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte memória',50,30)", [serviceId, tenantId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status) VALUES($1,$2,$3,$4,$5,'2026-10-01 12:00:00+00','em_atendimento'),($6,$2,$3,$4,$5,'2026-10-01 13:00:00+00','em_atendimento')", [firstAppointment, tenantId, professionalId, clientId, serviceId, secondAppointment])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [barberUserId])

    const first = await db.query("SELECT public.barbeiro_atendimento_concluir($1,'Degradê','0,5 e 2','Navalha','Marcada','Primeiro registro','Não subir a lateral',NULL,NULL,NULL,NULL,NULL) result", [firstAppointment])
    assert.equal(first.rows[0].result.status, 'concluido')
    assert.equal(first.rows[0].result.corte.estilo, 'Degradê')

    const second = await db.query("SELECT public.barbeiro_atendimento_concluir($1,'Social','2 e 3','Tesoura','Não realizada','Mudou o corte','Manter topo longo',NULL,NULL,NULL,NULL,NULL) result", [secondAppointment])
    assert.equal(second.rows[0].result.corte.estilo, 'Social')

    const history = await db.query('SELECT estilo,ativo,arquivado_em FROM public.cliente_cortes WHERE cliente_id=$1 ORDER BY criado_em', [clientId])
    assert.equal(history.rows.length, 2)
    assert.equal(history.rows[0].ativo, false)
    assert.ok(history.rows[0].arquivado_em)
    assert.equal(history.rows[1].ativo, true)
    assert.equal(history.rows[1].estilo, 'Social')

    const customer = await db.query('SELECT notas_preferencias FROM public.clientes WHERE id=$1', [clientId])
    assert.equal(customer.rows[0].notas_preferencias, 'Manter topo longo')
    const agenda = await db.query("SELECT * FROM public.barbeiro_agenda_listar_memoria('2026-10-01')")
    assert.equal(agenda.rows.length, 2)
    assert.equal(agenda.rows[0].ultimo_corte.estilo, 'Social')
    assert.equal(agenda.rows[1].status, 'concluido')

    assert.equal((await db.query("SELECT public.cliente_corte_ultimo($1) corte", [clientId])).rows[0].corte.estilo, 'Social')
    assert.equal(Number((await db.query("SELECT file_size_limit FROM storage.buckets WHERE id='cortes-clientes'")).rows[0].file_size_limit), 1048576)
  } finally {
    await db.query('DELETE FROM public.cliente_cortes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.agendamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.servicos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id=$1', [barberUserId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
