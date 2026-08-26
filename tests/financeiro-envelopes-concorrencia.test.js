import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('dois resgates concorrentes não excedem o saldo do envelope', async () => {
  const setup = new Client({ connectionString })
  const first = new Client({ connectionString })
  const second = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const envelopeId = crypto.randomUUID()
  const titleA = crypto.randomUUID()
  const titleB = crypto.randomUUID()

  await Promise.all([setup.connect(), first.connect(), second.connect()])
  try {
    await setup.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant concorrência envelopes',$2)", [tenantId, `tenant-env-${tenantId}`])
    await setup.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin envelopes',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.financeiro_contas_bancarias(id,barbearia_id,nome,tipo,saldo_inicial,conta_principal) VALUES($1,$2,'Conta','corrente',100,true)", [accountId, tenantId])
    await setup.query("INSERT INTO public.financeiro_envelopes(id,barbearia_id,conta_bancaria_id,nome,finalidade,saldo_acumulado) VALUES($1,$2,$3,'Reserva','reserva',60)", [envelopeId, tenantId, accountId])
    await setup.query("INSERT INTO public.financeiro_contas_pagar(id,barbearia_id,descricao,valor,data_vencimento,data_competencia,origem) VALUES($1,$3,'Título A',40,current_date,current_date,'manual'),($2,$3,'Título B',40,current_date,current_date,'manual')", [titleA, titleB, tenantId])

    await Promise.all([
      first.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId]),
      second.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId]),
    ])
    const results = await Promise.allSettled([
      first.query("SELECT public.financeiro_resgatar_envelope($1,$2,40,current_date,$3,NULL) result", [envelopeId, titleA, `resgate-a-${crypto.randomUUID()}`]),
      second.query("SELECT public.financeiro_resgatar_envelope($1,$2,40,current_date,$3,NULL) result", [envelopeId, titleB, `resgate-b-${crypto.randomUUID()}`]),
    ])
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1)
    assert.match(results.find(({ status }) => status === 'rejected').reason.message, /FINANCEIRO_SALDO_INSUFICIENTE/)
    const state = await setup.query('SELECT saldo_acumulado FROM public.financeiro_envelopes WHERE id=$1', [envelopeId])
    assert.equal(Number(state.rows[0].saldo_acumulado), 20)
  } finally {
    await setup.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await setup.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await Promise.all([setup.end(), first.end(), second.end()])
  }
})

test('pagamento e transferência concorrentes não consomem a mesma disponibilidade', async () => {
  const setup = new Client({ connectionString })
  const payment = new Client({ connectionString })
  const transfer = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const destinationId = crypto.randomUUID()
  const envelopeId = crypto.randomUUID()
  const titleId = crypto.randomUUID()

  await Promise.all([setup.connect(), payment.connect(), transfer.connect()])
  try {
    await setup.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant concorrência disponibilidade',$2)", [tenantId, `tenant-available-${tenantId}`])
    await setup.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin disponibilidade',$3)", [adminId, tenantId, `admin-${adminId}@local.test`])
    await setup.query("INSERT INTO public.financeiro_contas_bancarias(id,barbearia_id,nome,tipo,saldo_inicial,conta_principal) VALUES($1,$3,'Origem','corrente',100,true),($2,$3,'Destino','corrente',0,false)", [accountId, destinationId, tenantId])
    await setup.query("INSERT INTO public.financeiro_envelopes(id,barbearia_id,conta_bancaria_id,nome,finalidade,saldo_acumulado) VALUES($1,$2,$3,'Reserva','reserva',90)", [envelopeId, tenantId, accountId])
    await setup.query("INSERT INTO public.financeiro_contas_pagar(id,barbearia_id,descricao,valor,data_vencimento,data_competencia,origem) VALUES($1,$2,'Título concorrente',10,current_date,current_date,'manual')", [titleId, tenantId])
    await Promise.all([
      payment.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId]),
      transfer.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId]),
    ])

    const results = await Promise.allSettled([
      payment.query("SELECT public.financeiro_pagar_conta($1,$2,current_date,$3,NULL) result", [titleId, accountId, `pay-race-${crypto.randomUUID()}`]),
      transfer.query("SELECT public.financeiro_transferir($1,$2,10,current_date,$3,NULL) result", [accountId, destinationId, `transfer-race-${crypto.randomUUID()}`]),
    ])
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1)
    assert.match(results.find(({ status }) => status === 'rejected').reason.message, /FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE/)
    await setup.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])
    const available = await setup.query('SELECT * FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=$1', [accountId])
    assert.equal(Number(available.rows[0].saldo_disponivel), 0)
  } finally {
    await setup.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await setup.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await Promise.all([setup.end(), payment.end(), transfer.end()])
  }
})
