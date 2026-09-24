import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('recepção usa dados reais, login individual e não expõe visão financeira', async () => {
  const [app, page, settings, api, edge, migration, leastPrivilege, login] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/ReceptionUsersPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/recepcao/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/create-receptionist/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924160000_recepcao_usuarios_leitura.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924161000_recepcao_minimo_privilegio.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(app, /RECEPTION_ROLES = \['recepcao'\]/)
  assert.match(page, /listarAgendaRecepcao/)
  assert.match(page, /listarDisponibilidadeOperacional/)
  assert.match(page, /buscarClientesRecepcao/)
  assert.doesNotMatch(page, /MOCK_|Math\.random|saldo bancário|comissão|envelope/i)
  assert.match(settings, /criarUsuarioRecepcao/)
  assert.match(api, /functions\.invoke\('create-receptionist'/)
  assert.match(edge, /inviteUserByEmail/)
  assert.match(edge, /role: 'recepcao'/)
  assert.match(edge, /barbearia_modulos/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.profiles FROM anon, authenticated/)
  assert.match(migration, /recepcao_assert_operador/)
  assert.match(leastPrivilege, /DROP POLICY IF EXISTS "Users can select from same barbearia" ON public\.clientes/)
  assert.doesNotMatch(leastPrivilege, /'recepcao'\)/)
  assert.match(login, /profile\.ativo === false/)
})
