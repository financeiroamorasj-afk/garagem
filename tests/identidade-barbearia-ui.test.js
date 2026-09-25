import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('logo da barbearia é compactado, isolado no storage e exibido no portal e modo TV', async () => {
  const [settings, api, image, tv, portal, migration, permissionsMigration] = await Promise.all([
    readFile(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/configuracoes/identidade-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clientes/imagem.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgendaTv.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260925190000_logo_barbearia.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260925190500_logo_barbearia_permissoes.sql', import.meta.url), 'utf8'),
  ])

  assert.match(settings, /Identidade da barbearia/)
  assert.match(settings, /compactarImagem\(file/)
  assert.match(settings, /maxBytes: 500 \* 1024/)
  assert.match(api, /BARBERSHOP_LOGOS_BUCKET = 'barbearias-logos'/)
  assert.match(api, /const path = `\$\{barbearia\.id\}\/logo`/)
  assert.match(api, /update\(\{ logo_url: publicUrl \}\)/)
  assert.match(image, /export async function compactarImagem/)
  assert.match(tv, /identity\?\.logo_url \|\| garagemSymbol/)
  assert.match(portal, /shop\?\.logo_url \|\| garagemSymbol/)
  assert.match(migration, /'barbearias-logos','barbearias-logos',true,614400/)
  assert.match(migration, /storage\.foldername\(name\).*get_my_barbearia_id/s)
  assert.match(migration, /get_my_role\(\) IN \('admin','master'\)/)
  assert.match(permissionsMigration, /FOR SELECT TO authenticated/)
  assert.match(permissionsMigration, /barbearias_identidade_atualizar/)
})
