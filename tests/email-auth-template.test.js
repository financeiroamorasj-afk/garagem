import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('convite da equipe usa o padrão visual e o link seguro do Supabase', async () => {
  const [config, template, docs] = await Promise.all([
    readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/templates/invite.html', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operacao/EMAILS-AUTENTICACAO.md', import.meta.url), 'utf8'),
  ])

  assert.match(config, /\[auth\.email\.template\.invite\]/)
  assert.match(config, /subject = "Seu acesso ao Garagem System"/)
  assert.match(config, /content_path = "\.\/supabase\/templates\/invite\.html"/)
  assert.match(template, /https:\/\/app\.garagemsystem\.com\.br\/garagem-symbol\.png/)
  assert.match(template, /href="\{\{ \.ConfirmationURL \}\}"/)
  assert.match(template, /Criar minha senha/)
  assert.doesNotMatch(template, /sk-proj|service_role|smtp_pass/i)
  assert.match(docs, /smtp\.gmail\.com/)
  assert.match(docs, /senha de aplicativo/i)
})
