import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('fluxo integrado 2C cobre idempotência, versão, status, histórico e autorização local', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const suffix = tenantId.slice(0, 8)
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant integração 2C',$2)", [tenantId, `tenant-ui-${tenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `ui-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin UI',$3)", [adminId, tenantId, `ui-${adminId}@local.test`])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const accountKey = `ui-account:${crypto.randomUUID()}`
    const accountA = await client.query("SELECT public.financeiro_criar_conta_bancaria($1,NULL,'corrente',0,$2,NULL) result", [`Conta A ${suffix}`, accountKey])
    const accountRetry = await client.query("SELECT public.financeiro_criar_conta_bancaria($1,NULL,'corrente',0,$2,NULL) result", [`Conta A ${suffix}`, accountKey])
    assert.equal(accountRetry.rows[0].result.id, accountA.rows[0].result.id)
    assert.equal(accountRetry.rows[0].result.idempotente, true)
    const accountB = await client.query("SELECT public.financeiro_criar_conta_bancaria($1,NULL,'caixa',0,$2,NULL) result", [`Conta B ${suffix}`, `ui-account:${crypto.randomUUID()}`])
    const versionA = await client.query('SELECT updated_at::text updated_at FROM public.financeiro_contas_bancarias WHERE id=$1', [accountA.rows[0].result.id])
    await client.query("SELECT public.financeiro_editar_conta_bancaria($1,$2,'Banco local','corrente',$3,NULL)", [accountA.rows[0].result.id, `Conta A editada ${suffix}`, versionA.rows[0].updated_at])
    await assert.rejects(client.query("SELECT public.financeiro_editar_conta_bancaria($1,$2,NULL,'corrente',$3,NULL)", [accountA.rows[0].result.id, `Conta A stale ${suffix}`, versionA.rows[0].updated_at]), /FINANCEIRO_CONFLITO_VERSAO/)
    await client.query('SELECT public.financeiro_definir_conta_principal($1,NULL)', [accountB.rows[0].result.id])
    await client.query('SELECT public.financeiro_definir_conta_ativa($1,false,$2,NULL)', [accountB.rows[0].result.id, accountA.rows[0].result.id])
    await client.query('SELECT public.financeiro_definir_conta_ativa($1,true,NULL,NULL)', [accountB.rows[0].result.id])
    await client.query('SELECT public.financeiro_definir_conta_ativa($1,false,NULL,NULL)', [accountB.rows[0].result.id])
    await assert.rejects(client.query('SELECT public.financeiro_definir_conta_ativa($1,false,NULL,NULL)', [accountA.rows[0].result.id]), /FINANCEIRO_ULTIMA_CONTA_ATIVA/)

    const categoryKey = `ui-category:${crypto.randomUUID()}`
    const category = await client.query("SELECT public.financeiro_criar_categoria($1,'saida','despesa_variavel',$2,NULL) result", [`Categoria ${suffix}`, categoryKey])
    const categoryRetry = await client.query("SELECT public.financeiro_criar_categoria($1,'saida','despesa_variavel',$2,NULL) result", [`Categoria ${suffix}`, categoryKey])
    assert.equal(categoryRetry.rows[0].result.id, category.rows[0].result.id)
    assert.equal(categoryRetry.rows[0].result.idempotente, true)
    const categoryVersion = await client.query('SELECT updated_at::text updated_at FROM public.financeiro_categorias WHERE id=$1', [category.rows[0].result.id])
    await client.query("SELECT public.financeiro_editar_categoria($1,$2,'saida','despesa_fixa',$3,NULL)", [category.rows[0].result.id, `Categoria editada ${suffix}`, categoryVersion.rows[0].updated_at])
    await assert.rejects(client.query("SELECT public.financeiro_editar_categoria($1,$2,'saida','outros',$3,NULL)", [category.rows[0].result.id, `Categoria stale ${suffix}`, categoryVersion.rows[0].updated_at]), /FINANCEIRO_CONFLITO_VERSAO/)
    const currentCategory = await client.query('SELECT updated_at::text updated_at FROM public.financeiro_categorias WHERE id=$1', [category.rows[0].result.id])
    await client.query("INSERT INTO public.financeiro_contas_pagar(barbearia_id,descricao,valor,data_vencimento,data_competencia,categoria_id) VALUES($1,'Histórico UI',10,current_date,current_date,$2)", [tenantId, category.rows[0].result.id])
    await assert.rejects(client.query("SELECT public.financeiro_editar_categoria($1,$2,'saida','outros',$3,NULL)", [category.rows[0].result.id, `Categoria histórica ${suffix}`, currentCategory.rows[0].updated_at]), /FINANCEIRO_CATEGORIA_COM_HISTORICO/)
    await client.query('SELECT public.financeiro_definir_categoria_ativa($1,false,NULL)', [category.rows[0].result.id])
    await client.query('SELECT public.financeiro_definir_categoria_ativa($1,true,NULL)', [category.rows[0].result.id])
    await assert.rejects(client.query("SELECT public.financeiro_criar_categoria($1,'saida','outros',$2,NULL)", [`Categoria editada ${suffix}`, `ui-category:${crypto.randomUUID()}`]), /FINANCEIRO_NOME_ATIVO_EM_USO/)

    await client.query("UPDATE public.profiles SET role='barbeiro' WHERE id=$1", [adminId])
    await assert.rejects(client.query('SELECT * FROM public.financeiro_listar_contas_bancarias_cadastro(false)'), /FINANCEIRO_SEM_PERMISSAO/)
  } finally {
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id=$1', [tenantId]).catch(() => {})
    await client.end()
  }
})
