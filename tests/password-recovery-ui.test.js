import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('login oferece recuperação segura e reutiliza a definição de senha', async () => {
  const [app, login, forgot, setPassword, config, template] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ForgotPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/SetPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/templates/recovery.html', import.meta.url), 'utf8'),
  ])

  assert.match(app, /path="\/esqueci-senha" element={<ForgotPassword/)
  assert.match(login, /Esqueci minha senha/)
  assert.match(forgot, /resetPasswordForEmail/)
  assert.match(forgot, /new URL\('\/definir-senha'/)
  assert.doesNotMatch(forgot, /usuário não encontrado|e-mail não cadastrado/i)
  assert.match(setPassword, /RECUPERAÇÃO DE ACESSO/)
  assert.match(setPassword, /PASSWORD_RECOVERY/)
  assert.match(config, /\[auth\.email\.template\.recovery\]/)
  assert.match(template, /href="\{\{ \.ConfirmationURL \}\}"/)
})
