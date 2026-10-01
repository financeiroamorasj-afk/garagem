import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20260928143000_adm_integracoes_configuraveis.sql', import.meta.url)
const dataUrl = new URL('../apps/adm/src/lib/data.ts', import.meta.url)
const pageUrl = new URL('../apps/adm/src/app/(protected)/configuracoes/page.tsx', import.meta.url)
const shellUrl = new URL('../apps/adm/src/components/admin-shell.tsx', import.meta.url)
const fiscalMigrationUrl = new URL('../supabase/migrations/20261001143000_modulo_fiscal_fila.sql', import.meta.url)

test('integrações são configuráveis por provedor sem persistir segredos', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /CREATE TABLE public\.plataforma_integracoes/)
  assert.match(sql, /provider text NOT NULL CHECK \(provider ~/)
  assert.match(sql, /credencial_ref text/)
  assert.match(sql, /webhook_secret_ref text/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.plataforma_integracoes FROM PUBLIC,anon,authenticated/)
  assert.doesNotMatch(sql, /sk-proj-|\$aact_|api_key\s*text/i)
  assert.doesNotMatch(sql, /provider\s*=\s*'asaas'/)
})

test('catálogo prevê os dois complementos de IA e o gateway inicial', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /'gateway_assinaturas','principal','Gateway de assinaturas','asaas'/)
  assert.match(sql, /'ia_gestao','IA para gestão'/)
  assert.match(sql, /'ia_atendimento_whatsapp','IA para atendimento no WhatsApp'/)
  assert.match(sql, /DROP CONSTRAINT IF EXISTS saas_checkouts_gateway_provider_check/)
  assert.match(sql, /DROP CONSTRAINT IF EXISTS saas_assinaturas_gateway_provider_check/)
})

test('ADM expõe configurações apenas ao super admin e lê módulos reais', async () => {
  const [data, page, shell] = await Promise.all([
    readFile(dataUrl, 'utf8'),
    readFile(pageUrl, 'utf8'),
    readFile(shellUrl, 'utf8'),
  ])

  assert.match(data, /plataforma_integracoes/)
  assert.match(data, /saas_modulos/)
  assert.match(page, /requirePlatformAdmin\(\["super_admin"\]\)/)
  assert.match(page, /Gateway de assinaturas/)
  assert.match(page, /APIs e inteligências artificiais/)
  assert.match(shell, /href: "\/configuracoes"/)
})

test('módulo fiscal fica reservado para oferta anual sem escolher provedor antes da hora', async () => {
  const sql = await readFile(fiscalMigrationUrl, 'utf8')

  assert.match(sql, /'fiscal'/)
  assert.match(sql, /'Módulo fiscal'/)
  assert.match(sql, /'ciclo', 'anual'/)
  assert.match(sql, /'permite_desconto', true/)
  assert.match(sql, /'provedor', NULL/)
  assert.match(sql, /'rascunho'/)
})
