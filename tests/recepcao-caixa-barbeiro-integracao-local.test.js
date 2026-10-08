import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('barbeiro habilitado cobra atendimento de colega somente pela fila da recepção', async () => {
  const db = new pg.Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const serviceBarberId = crypto.randomUUID()
  const cashierBarberId = crypto.randomUUID()
  const serviceProfessionalId = crypto.randomUUID()
  const cashierProfessionalId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Caixa em equipe',$2)", [tenantId, `caixa-equipe-${tenantId}`])
    await db.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now()),($3,'authenticated','authenticated',$4,now(),now()),($5,'authenticated','authenticated',$6,now(),now())", [adminId, `admin-${adminId}@local.test`, serviceBarberId, `servico-${serviceBarberId}@local.test`, cashierBarberId, `caixa-${cashierBarberId}@local.test`])
    await db.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email,ativo) VALUES($1,$2,'admin','Dono',$3,true),($4,$2,'barbeiro','Barbeiro do corte',$5,true),($6,$2,'barbeiro','Barbeiro do caixa',$7,true)", [adminId, tenantId, `admin-${adminId}@local.test`, serviceBarberId, `servico-${serviceBarberId}@local.test`, cashierBarberId, `caixa-${cashierBarberId}@local.test`])
    await db.query("INSERT INTO public.barbearia_modulos(barbearia_id,modulo,status_contrato,ativo_na_unidade) VALUES($1,'recepcao','ativo',true)", [tenantId])
    await db.query("INSERT INTO public.profissionais(id,barbearia_id,nome,ativo,user_id) VALUES($1,$2,'Barbeiro do corte',true,$3),($4,$2,'Barbeiro do caixa',true,$5)", [serviceProfessionalId, tenantId, serviceBarberId, cashierProfessionalId, cashierBarberId])
    await db.query("INSERT INTO public.clientes(id,barbearia_id,nome,telefone) VALUES($1,$2,'Cliente do corte','11999991111')", [clientId, tenantId])
    await db.query("INSERT INTO public.servicos(id,barbearia_id,nome,preco,duracao_minutos) VALUES($1,$2,'Corte',70,45)", [serviceId, tenantId])
    await db.query("INSERT INTO public.agendamentos(id,barbearia_id,profissional_id,cliente_id,servico_id,data_hora,status,valor_final) VALUES($1,$2,$3,$4,$5,now(),'em_atendimento',70)", [appointmentId, tenantId, serviceProfessionalId, clientId, serviceId])
    await db.query("INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal) VALUES($1,'Caixa','caixa',true)", [tenantId])
    await db.query("INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES($1,'Serviços','entrada','receita_servicos')", [tenantId])

    await setUser(db, adminId)
    await db.query('SELECT public.recepcao_barbeiro_acesso_definir($1,true)', [cashierBarberId])
    await setUser(db, cashierBarberId)
    await denied(db, 'INSERT INTO public.atendimento_fechamentos DEFAULT VALUES', /CHECKOUT_USAR_RECEPCAO/)

    await setUser(db, serviceBarberId)
    await denied(db, 'SELECT public.recepcao_fila_listar()', /RECEPCAO_NAO_AUTORIZADA/)
    const handoff = await db.query("SELECT public.barbeiro_atendimento_enviar_recepcao($1,$2::jsonb,$3::jsonb,70,$4) result", [appointmentId, JSON.stringify({ estilo: 'Corte social' }), '[]', crypto.randomUUID()])
    const pendingId = handoff.rows[0].result.pendencia_id
    assert.equal((await db.query('SELECT status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].status, 'aguardando_pagamento')

    await setUser(db, cashierBarberId)
    const queue = await db.query('SELECT * FROM public.recepcao_fila_listar()')
    assert.equal(queue.rows.length, 1)
    assert.equal(queue.rows[0].profissional_id, serviceProfessionalId)
    assert.equal((await db.query('SELECT * FROM public.recepcao_agenda_listar_periodo(current_date,current_date)')).rows.length, 1)
    const version = (await db.query('SELECT updated_at::text AS value FROM public.atendimento_pendencias WHERE id=$1', [pendingId])).rows[0].value
    const charged = await db.query("SELECT public.recepcao_cobranca_concluir($1,0,'pix',0,current_date,$2,$3) result", [pendingId, crypto.randomUUID(), version])
    assert.equal(charged.rows[0].result.fechamento.criado_por, cashierBarberId)
    assert.equal((await db.query('SELECT status FROM public.agendamentos WHERE id=$1', [appointmentId])).rows[0].status, 'concluido')
    assert.equal((await db.query('SELECT cobrado_por FROM public.atendimento_pendencias WHERE id=$1', [pendingId])).rows[0].cobrado_por, cashierBarberId)
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.recepcao_fila_listar()')).rows[0].total, 0)
    await setUser(db, adminId)
    await denied(db, 'SELECT public.recepcao_barbeiro_acesso_definir($1,false)', /RECEPCAO_ULTIMO_OPERADOR/, [cashierBarberId])
    const professionalVersion = (await db.query('SELECT updated_at::text AS value FROM public.profissionais WHERE id=$1', [cashierProfessionalId])).rows[0].value
    await denied(db, 'SELECT public.barbeiros_atualizar($1,$2,$3,$4,$5,$6,false,$7)', /RECEPCAO_ULTIMO_OPERADOR/, [cashierProfessionalId, 'Barbeiro do caixa', null, null, null, null, professionalVersion])
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
