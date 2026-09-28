import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../apps/adm/${path}`, import.meta.url), 'utf8')

test('ADM usa sessão SSR e mantém service role somente no servidor', async () => {
  const [pkg, adminClient, auth, proxy] = await Promise.all([
    read('package.json'),
    read('src/lib/supabase/admin.ts'),
    read('src/lib/auth.ts'),
    read('src/proxy.ts'),
  ])

  assert.match(pkg, /"@supabase\/ssr"/)
  assert.match(adminClient, /import "server-only"/)
  assert.match(adminClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(auth, /\.from\("plataforma_admins"\)/)
  assert.match(proxy, /updateSession/)
})

test('ADM lê dados reais e aplica papéis nas áreas comerciais', async () => {
  const [data, plans, subscriptions, shell] = await Promise.all([
    read('src/lib/data.ts'),
    read('src/app/(protected)/planos/page.tsx'),
    read('src/app/(protected)/assinaturas/page.tsx'),
    read('src/components/admin-shell.tsx'),
  ])

  assert.match(data, /saas_planos/)
  assert.match(data, /saas_assinaturas/)
  assert.match(data, /saas_checkouts/)
  assert.match(data, /barbearias/)
  assert.match(plans, /requirePlatformAdmin\(\["super_admin", "financeiro"\]\)/)
  assert.match(subscriptions, /requirePlatformAdmin\(\["super_admin", "financeiro"\]\)/)
  assert.match(shell, /item\.roles\.includes\(role\)/)
  assert.doesNotMatch(data, /89|179|299/)
})
