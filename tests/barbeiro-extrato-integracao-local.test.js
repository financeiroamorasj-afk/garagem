import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('extrato administrativo isola tenant, mede duração real e vincula o dono sem trocar seu papel', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant extrato',$2)", [tenantId, `extrato-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Dono que atende',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,apelido,ativo) VALUES($1,$2,'Barbeiro Extrato','Extrato',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte cronometrado',60,30)", [serviceId, tenantId])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    for (let day = 1; day <= 3; day += 1) {
      await db.query(`
        INSERT INTO public.agendamentos(
          barbearia_id,profissional_id,cliente_nome_manual,servico_id,data_hora,status,
          valor_final,iniciado_em,concluido_em
        ) VALUES (
          $1,$2,$3,$4,
          ((current_date-$5::integer)::timestamp+time '10:00') AT TIME ZONE 'America/Sao_Paulo',
          'concluido',60,
          ((current_date-$5::integer)::timestamp+time '10:00') AT TIME ZONE 'America/Sao_Paulo',
          ((current_date-$5::integer)::timestamp+time '10:42') AT TIME ZONE 'America/Sao_Paulo'
        )
      `, [tenantId, professionalId, `Cliente ${day}`, serviceId, day])
    }

    await db.query(`
      INSERT INTO public.vendas_produtos(
        barbearia_id,profissional_id,nome_produto,valor_venda,quantidade,status,
        comissao_valor,criado_em
      ) VALUES($1,$2,'Pomada',30,1,'concluida',3,now())
    `, [tenantId, professionalId])

    const statement = (await db.query(
      'SELECT public.admin_barbeiro_extrato($1,current_date-10,current_date) result',
      [professionalId],
    )).rows[0].result

    assert.equal(statement.resumo.atendimentos, 3)
    assert.equal(Number(statement.resumo.valor_servicos), 180)
    assert.equal(Number(statement.resumo.valor_produtos), 30)
    assert.equal(Number(statement.resumo.tempo_medio_minutos), 42)
    assert.equal(statement.servicos[0].status_tempo, 'acima')
    assert.equal(statement.servicos[0].duracao_sugerida_minutos, 40)

    const serviceVersion = (await db.query('SELECT updated_at::text updated_at FROM public.servicos WHERE id=$1', [serviceId])).rows[0].updated_at
    const durationUpdate = (await db.query(
      'SELECT public.admin_servico_duracao_atualizar($1,40,$2) result',
      [serviceId, serviceVersion],
    )).rows[0].result
    assert.equal(durationUpdate.duracao_minutos, 40)

    const ownerProfessional = (await db.query('SELECT public.admin_vincular_como_profissional() result')).rows[0].result
    assert.equal(ownerProfessional.user_id, adminId)
    assert.equal((await db.query('SELECT role FROM public.profiles WHERE id=$1', [adminId])).rows[0].role, 'admin')
    assert.equal((await db.query('SELECT count(*)::int total FROM public.profissionais WHERE user_id=$1', [adminId])).rows[0].total, 1)
  } finally {
    await db.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
