import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('troca de status não reabre conflito de horários legados', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const firstId = crypto.randomUUID()
  const secondId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Operação real',$2)", [tenantId, `operacao-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [userId, `operacao-${userId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'barbeiro','Barbeiro operação',$3)", [userId, tenantId, `operacao-${userId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id) VALUES($1,$2,'Barbeiro operação',true,$3)", [professionalId, tenantId, userId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente operação')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Serviço operação',50,30)", [serviceId, tenantId])

    // Simula dois registros antigos que ficaram separados pela duração nominal,
    // mas passaram a se sobrepor depois da margem operacional de cinco minutos.
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status) VALUES($1,$2,$3,$4,$5,'2026-09-29 15:00:00-03','cancelado'),($6,$2,$3,$4,$5,'2026-09-29 15:30:00-03','cancelado')", [firstId, tenantId, professionalId, clientId, serviceId, secondId])
    await db.query("UPDATE public.agendamentos SET status='pendente' WHERE id=ANY($1)", [[firstId, secondId]])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])

    const started = await db.query("SELECT public.barbeiro_agendamento_mudar_status($1,'pendente','em_atendimento') result", [firstId])
    assert.equal(started.rows[0].result.status, 'em_atendimento')
    assert.ok(started.rows[0].result.iniciado_em)

    await assert.rejects(
      db.query("SELECT public.barbeiro_agendamento_mudar_status($1,'pendente','em_atendimento')", [secondId]),
      /AGENDA_ATENDIMENTO_EM_ANDAMENTO/,
    )

    await assert.rejects(
      db.query("UPDATE public.agendamentos SET data_hora='2026-09-29 15:15:00-03' WHERE id=$1", [secondId]),
      /AGENDA_HORARIO_OCUPADO/,
    )
  } finally {
    await db.query('DELETE FROM auth.users WHERE id=$1', [userId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
