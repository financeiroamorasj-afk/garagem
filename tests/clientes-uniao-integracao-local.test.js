import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('união move histórico, mantém a memória mais recente e apaga a origem', async () => {
  const db = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const professionalId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const sourceId = crypto.randomUUID()
  const targetId = crypto.randomUUID()
  const sourceAppointment = crypto.randomUUID()
  const targetAppointment = crypto.randomUUID()
  const oldCut = crypto.randomUUID()
  const newCut = crypto.randomUUID()
  await db.connect()
  try {
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'União clientes',$2)", [tenantId, `uniao-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [userId, `uniao-${userId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin união',$3)", [userId, tenantId, `uniao-${userId}@local.test`])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo) VALUES($1,$2,'Barbeiro união',true)", [professionalId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte união',50,30)", [serviceId, tenantId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$3,'Duplicado','11999999999'),($2,$3,'Cliente mantido',NULL)", [sourceId, targetId, tenantId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status) VALUES($1,$3,$4,$5,$6,now()-interval '2 days','concluido'),($2,$3,$4,$7,$6,now()-interval '1 day','concluido')", [sourceAppointment, targetAppointment, tenantId, professionalId, sourceId, serviceId, targetId])
    await db.query("INSERT INTO public.cliente_cortes(id,barbearia_id,cliente_id,agendamento_id,profissional_id,estilo,ativo,criado_por,criado_em) VALUES($1,$3,$4,$5,$6,'Antigo',true,$7,now()-interval '2 days'),($2,$3,$8,$9,$6,'Mais recente',true,$7,now()-interval '1 day')", [oldCut, newCut, tenantId, sourceId, sourceAppointment, professionalId, userId, targetId, targetAppointment])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId])

    const result = (await db.query('SELECT public.clientes_unir($1,$2) result', [sourceId, targetId])).rows[0].result
    assert.equal(result.id, targetId)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.clientes WHERE id=$1', [sourceId])).rows[0].total, 0)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.agendamentos WHERE cliente_id=$1', [targetId])).rows[0].total, 2)
    assert.equal((await db.query('SELECT count(*)::int total FROM public.cliente_cortes WHERE cliente_id=$1', [targetId])).rows[0].total, 2)
    assert.equal((await db.query('SELECT id FROM public.cliente_cortes WHERE cliente_id=$1 AND ativo', [targetId])).rows[0].id, newCut)
    assert.equal((await db.query('SELECT telefone FROM public.clientes WHERE id=$1', [targetId])).rows[0].telefone, '11999999999')
    const audit = (await db.query('SELECT origem_cliente_id,origem_snapshot FROM public.clientes_unioes WHERE destino_cliente_id=$1', [targetId])).rows[0]
    assert.equal(audit.origem_cliente_id, sourceId)
    assert.equal(Object.hasOwn(audit.origem_snapshot, 'cpf_hash'), false)
  } finally {
    await db.query('DELETE FROM auth.users WHERE id=$1', [userId]).catch(() => {})
    await db.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await db.end()
  }
})
