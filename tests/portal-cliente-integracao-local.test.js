import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('portal cria sessão segura, cadastra cliente e agenda sem choque de horário', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const slug = `portal-${tenantId}`
  let token
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Barbearia Portal',$2)", [tenantId, slug])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo) VALUES($1,$2,'João Portal','Jão',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Corte Portal',50,30,true)", [serviceId, tenantId])
    await db.query(`INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim)
      SELECT $1,$2,d,true,'09:00','18:00' FROM generate_series(0,6) d`, [tenantId, professionalId])

    await db.query('SET ROLE anon')
    const publicData = await db.query('SELECT public.portal_barbearia_publica($1) result', [slug])
    assert.equal(publicData.rows[0].result.nome, 'Barbearia Portal')
    assert.equal(publicData.rows[0].result.equipe.length, 1)

    const notFound = await db.query("SELECT public.portal_acessar($1,'52998224725') result", [slug])
    assert.equal(notFound.rows[0].result.status, 'cadastro')

    const registration = await db.query("SELECT public.portal_cadastrar($1,'52998224725','Cliente Portal','11999999999') result", [slug])
    token = registration.rows[0].result.token
    assert.equal(registration.rows[0].result.status, 'autenticado')
    assert.equal(token.length, 64)

    const portal = await db.query('SELECT public.portal_dados($1) result', [token])
    assert.equal(portal.rows[0].result.cliente.nome, 'Cliente Portal')
    assert.equal(portal.rows[0].result.servicos.length, 1)
    assert.ok(!JSON.stringify(portal.rows[0].result).includes('52998224725'))

    const slots = await db.query("SELECT * FROM public.portal_horarios_livres($1,$2,current_date+1,NULL,3,20)", [token, serviceId])
    assert.ok(slots.rows.length > 0)
    const slot = slots.rows[0]
    const created = await db.query('SELECT public.portal_agendamento_criar($1,$2,$3,$4) result', [token, serviceId, professionalId, slot.inicio])
    assert.equal(created.rows[0].result.status, 'pendente')

    await assert.rejects(
      db.query('SELECT public.portal_agendamento_criar($1,$2,$3,$4)', [token, serviceId, professionalId, slot.inicio]),
      /PORTAL_HORARIO_INDISPONIVEL/,
    )

    await db.query('RESET ROLE')
    const stored = await db.query('SELECT origem,pagamento_status FROM public.agendamentos WHERE id=$1', [created.rows[0].result.id])
    assert.equal(stored.rows[0].origem, 'portal_cliente')
    assert.equal(stored.rows[0].pagamento_status, 'nao_solicitado')
    const protectedCpf = await db.query('SELECT cpf_hash,cpf_final FROM public.clientes WHERE barbearia_id=$1', [tenantId])
    assert.equal(protectedCpf.rows[0].cpf_hash.length, 64)
    assert.notEqual(protectedCpf.rows[0].cpf_hash, '52998224725')

    await db.query('SET ROLE anon')
    const cancelled = await db.query('SELECT public.portal_agendamento_cancelar($1,$2) result', [token, created.rows[0].result.id])
    assert.equal(cancelled.rows[0].result.status, 'cancelado')
    await db.query('SELECT public.portal_encerrar($1)', [token])
    await assert.rejects(db.query('SELECT public.portal_dados($1)', [token]), /PORTAL_SESSAO_INVALIDA/)
  } finally {
    await db.query('RESET ROLE').catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
