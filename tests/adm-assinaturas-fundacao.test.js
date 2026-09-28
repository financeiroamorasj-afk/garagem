import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20260927120000_adm_assinaturas_fundacao.sql', import.meta.url)

test('fundação do ADM separa catálogo, checkout, assinatura e gateway', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const table of [
    'plataforma_produtos',
    'plataforma_admins',
    'saas_planos',
    'saas_modulos',
    'saas_ofertas',
    'saas_checkouts',
    'saas_assinaturas',
    'saas_assinatura_modulos',
    'saas_provisionamento_etapas',
    'saas_gateway_eventos',
    'saas_auditoria',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}`))
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }

  assert.match(sql, /VALUES \('garagem','Garagem System','garagem'\)/)
  assert.match(sql, /gateway_ambiente IN \('sandbox','producao'\)/)
  assert.match(sql, /UNIQUE \(provider,ambiente,event_id\)/)
})

test('preço pode permanecer em rascunho sem antecipar a decisão comercial', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /status text NOT NULL DEFAULT 'rascunho'/)
  assert.match(sql, /preco_mensal numeric\(12,2\)/)
  assert.match(sql, /CHECK \(status <> 'ativo' OR preco_mensal IS NOT NULL\)/)
  assert.doesNotMatch(sql, /VALUES \([^\n]*(89|179|299)/)
})

test('checkout não persiste documento integral nem dados de cartão', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const checkoutBlock = sql.match(/CREATE TABLE public\.saas_checkouts \(([\s\S]*?)\n\);/)?.[1] ?? ''

  assert.match(checkoutBlock, /documento_hash text/)
  assert.match(checkoutBlock, /documento_final text/)
  assert.doesNotMatch(checkoutBlock, /cpf_cnpj|numero_cartao|cvv|card_number/i)
  assert.match(checkoutBlock, /checkout_token_hash text NOT NULL UNIQUE/)
})

test('assinatura usa máquina de estados, versão otimista e sincroniza entitlements', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.saas_assinatura_mudar_status/)
  assert.match(sql, /SAAS_CONFLITO_VERSAO/)
  assert.match(sql, /SAAS_TRANSICAO_INVALIDA/)
  assert.match(sql, /version = version \+ 1/)
  assert.match(sql, /PERFORM public\.saas_entitlements_sincronizar/)
  assert.match(sql, /ON CONFLICT \(barbearia_id,modulo\) DO UPDATE/)
})

test('tabelas comerciais não são expostas aos usuários das barbearias', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const tableGrants = [...sql.matchAll(/GRANT[\s\S]*?ON TABLE[\s\S]*?TO\s+([^;]+);/g)].map((match) => match[1])

  assert.match(sql, /FROM PUBLIC,anon,authenticated/)
  assert.match(sql, /TO service_role/)
  assert.ok(tableGrants.length > 0)
  assert.ok(tableGrants.every((grantees) => !/authenticated/.test(grantees)))
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.plataforma_admin_tem_acesso\(text\[\]\) TO authenticated,service_role/)
})

test('chaves compostas impedem misturar plano, módulo e evento entre produtos', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /FOREIGN KEY \(plano_id,produto_id\) REFERENCES public\.saas_planos\(id,produto_id\)/)
  assert.match(sql, /FOREIGN KEY \(modulo_id,produto_id\) REFERENCES public\.saas_modulos\(id,produto_id\)/)
  assert.match(sql, /FOREIGN KEY \(checkout_id,produto_id\) REFERENCES public\.saas_checkouts\(id,produto_id\)/)
  assert.match(sql, /FOREIGN KEY \(assinatura_id,produto_id\) REFERENCES public\.saas_assinaturas\(id,produto_id\)/)
})
