import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('checkout usa a página hospedada do Asaas e persiste a intenção antes do redirecionamento', async () => {
  const [route, asaas, checkoutHelpers, migration] = await Promise.all([
    read('../apps/adm/src/app/api/checkouts/route.ts'),
    read('../apps/adm/src/lib/asaas.ts'),
    read('../apps/adm/src/lib/checkout.ts'),
    read('../supabase/migrations/20261005143000_checkout_asaas_hospedado.sql'),
  ])

  assert.match(asaas, /https:\/\/api-sandbox\.asaas\.com\/v3/)
  assert.match(asaas, /"User-Agent": "GaragemSystem\/1\.0/)
  assert.match(asaas, /fetchAsaas<AsaasCheckout>\("\/checkouts"/)
  assert.match(asaas, /chargeTypes: \["RECURRENT"\]/)
  assert.doesNotMatch(asaas, /www\.asaas\.com\/c\//)

  assert.match(route, /from\("saas_checkouts"\)\.insert/)
  assert.match(route, /from\("saas_checkout_modulos"\)\.insert/)
  assert.match(route, /idempotency-key/)
  assert.match(checkoutHelpers, /CHECKOUT_ALLOWED_ORIGINS/)
  assert.doesNotMatch(route, /Access-Control-Allow-Origin", "\*"/)
  assert.doesNotMatch(route, /responsavel_cpf/)

  assert.match(migration, /gateway_checkout_id text/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.saas_checkout_modulos/)
  assert.match(migration, /quantidade integer NOT NULL DEFAULT 1/)
  assert.match(migration, /pix_ou_cartao/)
})

test('webhook usa id do evento, sanitiza dados e aceita reentrega idempotente', async () => {
  const webhook = await read('../apps/adm/src/app/api/webhooks/asaas/route.ts')
  assert.match(webhook, /event_id: payload\.id/)
  assert.match(webhook, /error\?\.code === "23505"/)
  assert.match(webhook, /duplicate: true/)
  assert.match(webhook, /retryScheduled: previous\?\.status === "falhou"/)
  assert.match(webhook, /payload_sanitizado: sanitized/)
  assert.match(webhook, /payload_sha256: sha256\(rawBody\)/)
  assert.match(webhook, /timingSafeEqual/)
  assert.doesNotMatch(webhook, /Recebido.*token/i)
  assert.match(webhook, /provisionPaidCheckout/)
})
