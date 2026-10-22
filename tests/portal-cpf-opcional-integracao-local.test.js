import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('acesso sem CPF agenda sem expor dados de outra sessão do mesmo cliente', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const slug = `portal-sem-cpf-${tenantId}`
  let firstToken
  let secondToken
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Barbearia sem CPF',$2)", [tenantId, slug])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Barbeiro Portal',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Corte',45,30,true)", [serviceId, tenantId])
    await db.query(`INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim)
      SELECT $1,$2,d,true,'09:00','18:00','12:00','13:00' FROM generate_series(0,6) d`, [tenantId, professionalId])

    await db.query('SET ROLE anon')
    const first = await db.query("SELECT public.portal_agendar_sem_cpf($1,'Cliente Sem Documento','11988887777') result", [slug])
    firstToken = first.rows[0].result.token
    assert.equal(first.rows[0].result.acesso_tipo, 'agendamento')
    assert.equal(firstToken.length, 64)

    const beforeBooking = await db.query('SELECT public.portal_dados($1) result', [firstToken])
    assert.equal(beforeBooking.rows[0].result.acesso_tipo, 'agendamento')
    assert.equal(beforeBooking.rows[0].result.historico.length, 0)
    assert.equal(beforeBooking.rows[0].result.agendamentos.length, 0)
    assert.equal(beforeBooking.rows[0].result.cliente.cpf_final, null)

    const slots = await db.query('SELECT * FROM public.portal_horarios_livres($1,$2,current_date+1,NULL,3,20)', [firstToken, serviceId])
    assert.ok(slots.rows.length > 0)
    const slot = slots.rows[0]
    const created = await db.query('SELECT public.portal_agendamento_criar($1,$2,$3,$4) result', [firstToken, serviceId, professionalId, slot.inicio])
    assert.equal(created.rows[0].result.status, 'confirmado')

    const firstData = await db.query('SELECT public.portal_dados($1) result', [firstToken])
    assert.equal(firstData.rows[0].result.agendamentos.length, 1)
    await assert.rejects(
      db.query("SELECT public.portal_perfil_atualizar($1,'Outro Nome','11988887777',NULL,NULL)", [firstToken]),
      /PORTAL_ACESSO_LIMITADO/,
    )

    const second = await db.query("SELECT public.portal_agendar_sem_cpf($1,'Cliente Sem Documento','(11) 98888-7777') result", [slug])
    secondToken = second.rows[0].result.token
    const secondData = await db.query('SELECT public.portal_dados($1) result', [secondToken])
    assert.equal(secondData.rows[0].result.agendamentos.length, 0)

    await db.query('RESET ROLE')
    const clients = await db.query('SELECT count(*)::integer total FROM public.clientes WHERE barbearia_id=$1', [tenantId])
    assert.equal(clients.rows[0].total, 1)
    const linked = await db.query('SELECT portal_sessao_id IS NOT NULL linked FROM public.agendamentos WHERE id=$1', [created.rows[0].result.id])
    assert.equal(linked.rows[0].linked, true)
  } finally {
    await db.query('RESET ROLE').catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})

