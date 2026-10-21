import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('CLT fica sob gestão e freelancer edita a própria disponibilidade sem cancelar clientes', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminUserId = crypto.randomUUID()
  const cltUserId = crypto.randomUUID()
  const freelancerUserId = crypto.randomUUID()
  const cltProfessionalId = crypto.randomUUID()
  const freelancerProfessionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  await db.connect()
  try {
    const target = (await db.query("SELECT to_char(current_date+1,'YYYY-MM-DD') data,extract(dow FROM current_date+1)::smallint dow")).rows[0]
    await db.query("INSERT INTO public.barbearias(id,nome,slug,fuso_horario) VALUES($1,'Vínculos',$2,'UTC')", [tenantId, `vinculos-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [adminUserId, `admin-${adminUserId}@test.local`, cltUserId, `clt-${cltUserId}@test.local`, freelancerUserId, `freela-${freelancerUserId}@test.local`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Gestor',$3,true),($4,$2,'barbeiro','CLT',$5,true),($6,$2,'barbeiro','Freelancer',$7,true)", [adminUserId, tenantId, `admin-${adminUserId}@test.local`, cltUserId, `clt-${cltUserId}@test.local`, freelancerUserId, `freela-${freelancerUserId}@test.local`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,user_id,nome,ativo,tipo_vinculo,responsavel_disponibilidade) VALUES($1,$2,$3,'CLT',true,'clt','gestao'),($4,$2,$5,'Freelancer',true,'clt','gestao')", [cltProfessionalId, tenantId, cltUserId, freelancerProfessionalId, freelancerUserId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente preservado')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos,ativo) VALUES($1,$2,'Corte',50,30,true)", [serviceId, tenantId])
    await db.query("INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim) VALUES($1,$2,$3,true,'09:00','18:00')", [tenantId, freelancerProfessionalId, target.dow])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status) VALUES($1,$2,$3,$4,$5,($6::date+time '10:00') AT TIME ZONE 'UTC','confirmado')", [appointmentId, tenantId, freelancerProfessionalId, clientId, serviceId, target.data])

    const closedWeek = Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, ativo: false, hora_inicio: null, hora_fim: null, intervalo_inicio: null, intervalo_fim: null }))

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [cltUserId])
    const cltContext = (await db.query('SELECT public.barbeiro_disponibilidade_contexto() result')).rows[0].result
    assert.equal(cltContext.tipo_vinculo, 'clt')
    assert.equal(cltContext.pode_editar, false)
    await assert.rejects(db.query('SELECT public.barbeiro_jornadas_salvar($1,false)', [JSON.stringify(closedWeek)]), /DISPONIBILIDADE_GESTAO_RESPONSAVEL/)

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminUserId])
    const freelancerUpdatedAt = (await db.query('SELECT updated_at::text FROM public.profissionais WHERE id=$1', [freelancerProfessionalId])).rows[0].updated_at
    const updatedFreelancer = (await db.query(
      'SELECT public.barbeiros_atualizar($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',
      [freelancerProfessionalId, 'Freelancer', null, null, null, null, null, 'freelancer', 'profissional', true, freelancerUpdatedAt],
    )).rows[0].result
    assert.equal(updatedFreelancer.tipo_vinculo, 'freelancer')
    assert.equal(updatedFreelancer.responsavel_disponibilidade, 'profissional')

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [freelancerUserId])
    const freelancerContext = (await db.query('SELECT public.barbeiro_disponibilidade_contexto() result')).rows[0].result
    assert.equal(freelancerContext.tipo_vinculo, 'freelancer')
    assert.equal(freelancerContext.pode_editar, true)

    const analysis = (await db.query('SELECT public.barbeiro_jornada_analisar($1) result', [JSON.stringify(closedWeek)])).rows[0].result
    assert.equal(Number(analysis.quantidade), 1)
    assert.equal(analysis.agendamentos[0].id, appointmentId)
    await assert.rejects(db.query('SELECT public.barbeiro_jornadas_salvar($1,false)', [JSON.stringify(closedWeek)]), /DISPONIBILIDADE_CONFLITOS_CONFIRMAR/)

    await db.query('SELECT public.barbeiro_jornadas_salvar($1,true)', [JSON.stringify(closedWeek)])
    assert.equal((await db.query('SELECT status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].status, 'confirmado')
    assert.ok(Number((await db.query("SELECT count(*) total FROM public.profissionais_disponibilidade_auditoria WHERE barbearia_id=$1 AND profissional_id=$2 AND entidade='jornada'", [tenantId, freelancerProfessionalId])).rows[0].total) >= 7)

    const start = `${target.data}T09:45:00Z`
    const end = `${target.data}T10:45:00Z`
    const blockAnalysis = (await db.query('SELECT public.barbeiro_bloqueio_analisar($1,$2) result', [start, end])).rows[0].result
    assert.equal(Number(blockAnalysis.quantidade), 1)
    await assert.rejects(db.query('SELECT public.barbeiro_bloqueio_criar($1,$2,$3,false)', [start, end, 'Compromisso']), /DISPONIBILIDADE_CONFLITOS_CONFIRMAR/)
    await db.query('SELECT public.barbeiro_bloqueio_criar($1,$2,$3,true)', [start, end, 'Compromisso'])
    assert.equal((await db.query('SELECT count(*) total FROM public.profissionais_bloqueios WHERE profissional_id=$1', [freelancerProfessionalId])).rows[0].total, '1')
  } finally {
    await db.query('DELETE FROM public.agendamentos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais_bloqueios WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais_jornadas WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.clientes WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.servicos WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM public.profissionais WHERE barbearia_id=$1', [tenantId]).catch(() => {})
    await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[adminUserId, cltUserId, freelancerUserId]]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
