import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.SUPABASE_LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

test('catálogo local persiste duração e materiais com isolamento e concorrência', async () => {
  const client = new Client({ connectionString })
  const tenantId = crypto.randomUUID()
  const otherTenantId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  await client.connect()
  try {
    await client.query("INSERT INTO public.barbearias(id,nome,slug) VALUES($1,'Tenant catálogo',$2),($3,'Outro catálogo',$4)", [tenantId, `catalog-${tenantId}`, otherTenantId, `catalog-other-${otherTenantId}`])
    await client.query("INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,now(),now())", [adminId, `catalog-${adminId}@local.test`])
    await client.query("INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES($1,$2,'admin','Admin catálogo',$3)", [adminId, tenantId, `catalog-${adminId}@local.test`])
    await client.query("INSERT INTO public.servicos(barbearia_id,nome,preco,duracao_minutos) VALUES($1,'Serviço externo',99,30)", [otherTenantId])
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])

    const materialResult = await client.query("SELECT public.material_catalogo_criar('Lâmina descartável','insumo','unidade') result")
    const materialId = materialResult.rows[0].result.id
    const links = JSON.stringify([{ material_id: materialId, quantidade: 1, observacao: 'Uma por cliente' }])
    const serviceResult = await client.query("SELECT public.servico_catalogo_criar('Corte completo',55,45,'Corte com acabamento',40,$1::jsonb) result", [links])
    const serviceId = serviceResult.rows[0].result.id

    const listed = await client.query('SELECT * FROM public.servicos_catalogo_listar(false)')
    assert.equal(listed.rows.length, 1)
    assert.equal(listed.rows[0].id, serviceId)
    assert.equal(listed.rows[0].duracao_minutos, 45)
    assert.equal(listed.rows[0].materiais[0].id, materialId)
    assert.equal(Number(listed.rows[0].materiais[0].quantidade), 1)

    const version = serviceResult.rows[0].result.updated_at
    await client.query("SELECT public.servico_catalogo_atualizar($1,'Corte completo',60,50,'Atualizado',40,$2::jsonb,$3)", [serviceId, links, version])
    await assert.rejects(
      client.query("SELECT public.servico_catalogo_atualizar($1,'Versão antiga',60,50,NULL,40,$2::jsonb,$3)", [serviceId, links, version]),
      /CATALOGO_CONFLITO_VERSAO/,
    )
    await assert.rejects(
      client.query('SELECT public.material_catalogo_definir_ativo($1,false)', [materialId]),
      /CATALOGO_MATERIAL_EM_USO/,
    )

    await client.query("UPDATE public.profiles SET role='barbeiro' WHERE id=$1", [adminId])
    await assert.rejects(client.query('SELECT * FROM public.servicos_catalogo_listar(false)'), /CATALOGO_NAO_AUTORIZADO/)
  } finally {
    await client.query('DELETE FROM public.servicos_materiais WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.servicos WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM public.materiais_servico WHERE barbearia_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.query('DELETE FROM auth.users WHERE id=$1', [adminId]).catch(() => {})
    await client.query('DELETE FROM public.barbearias WHERE id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => {})
    await client.end()
  }
})
