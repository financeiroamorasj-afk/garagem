import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('ADM provisiona tenant manual com autenticação, catálogo e convite', async () => {
  const [action, page, form, provisioning, migration] = await Promise.all([
    read('../apps/adm/src/app/(protected)/barbearias/nova/actions.ts'),
    read('../apps/adm/src/app/(protected)/barbearias/nova/page.tsx'),
    read('../apps/adm/src/app/(protected)/barbearias/nova/manual-tenant-form.tsx'),
    read('../apps/adm/src/lib/provisioning.ts'),
    read('../supabase/migrations/20261007100000_provisionamento_manual_tenant.sql'),
  ])

  assert.match(action, /requirePlatformAdmin\(\["super_admin"\]\)/)
  assert.match(action, /gateway_provider: "manual"/)
  assert.match(action, /forma_pagamento: "manual"/)
  assert.match(action, /from\("saas_checkout_modulos"\)\.insert/)
  assert.match(action, /provisionPaidCheckout/)
  assert.match(action, /revalidatePath\("\/barbearias"\)/)
  assert.match(page, /manualProvisioningOptions/)
  assert.match(form, /Criar barbearia e enviar convite/)
  assert.match(form, /Nenhuma cobrança será criada no Asaas/)
  assert.match(provisioning, /gateway\.provider \?\? checkout\.gateway_provider/)
  assert.match(migration, /'manual'/)
})
