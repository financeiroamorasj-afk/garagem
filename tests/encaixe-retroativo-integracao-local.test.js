import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('barbeiro registra início retroativo até dois dias atrás com autoria preservada', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Retroativo',$2)", [tenantId, `retro-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [userId, `retro-${userId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'barbeiro','Barbeiro retroativo',$3)", [userId, tenantId, `retro-${userId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id) VALUES($1,$2,'Barbeiro retroativo',true,$3)", [professionalId, tenantId, userId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome) VALUES($1,$2,'Cliente retroativo')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte retroativo',55,30)", [serviceId, tenantId])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])

    const result = (await db.query("SELECT public.barbeiro_encaixe_retroativo_criar($1,$2,clock_timestamp()-interval '30 seconds',NULL) result", [clientId, serviceId])).rows[0].result
    assert.equal(result.status, 'em_atendimento')
    assert.equal(result.registro_retroativo, true)
    const stored = (await db.query('SELECT * FROM public.agendamentos WHERE id=$1', [result.id])).rows[0]
    assert.equal(stored.registro_retroativo, true)
    assert.equal(stored.retroativo_registrado_por, userId)
    assert.equal(stored.valor_final, '55.00')
    assert.ok(stored.iniciado_em < stored.retroativo_registrado_em)
    await db.query('DELETE FROM public.agendamentos WHERE id=$1', [result.id])

    const previousDay = (await db.query(`
      SELECT public.barbeiro_encaixe_retroativo_criar(
        $1,$2,
        (((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date - 1) + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
        NULL
      ) result
    `, [clientId, serviceId])).rows[0].result
    assert.equal(previousDay.registro_retroativo, true)
    await db.query('DELETE FROM public.agendamentos WHERE id=$1', [previousDay.id])

    const twoDaysAgo = (await db.query(`
      SELECT public.barbeiro_encaixe_retroativo_criar(
        $1,$2,
        (((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date - 2) + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
        NULL
      ) result
    `, [clientId, serviceId])).rows[0].result
    assert.equal(twoDaysAgo.registro_retroativo, true)
    await db.query('DELETE FROM public.agendamentos WHERE id=$1', [twoDaysAgo.id])

    await assert.rejects(
      db.query(`
        SELECT public.barbeiro_encaixe_retroativo_criar(
          $1,$2,
          (((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date - 3) + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
          NULL
        )
      `, [clientId, serviceId]),
      /AGENDA_RETROATIVO_FORA_JANELA/,
    )
  } finally {
    await db.query('DELETE FROM auth.users WHERE id=$1', [userId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
