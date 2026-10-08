import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('recepção usa dados reais, login individual e não expõe visão financeira', async () => {
  const [app, page, settings, report, teamLink, protectedRoute, api, edge, migration, leastPrivilege, accessMigration, login, barber] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/ReceptionUsersPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminReceptionReport.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/reception/ReceptionTeamLink.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ProtectedRoute.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/recepcao/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/create-receptionist/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924160000_recepcao_usuarios_leitura.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924161000_recepcao_minimo_privilegio.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261008150000_recepcao_acessos_equipe.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(app, /accessRpc="recepcao_acesso_operador_verificar"/)
  assert.match(page, /listarAgendaRecepcao/)
  assert.match(page, /listarDisponibilidadeOperacional/)
  assert.match(page, /buscarClientesRecepcao/)
  assert.doesNotMatch(page, /MOCK_|Math\.random|saldo bancário|comissão|envelope/i)
  assert.match(settings, /criarUsuarioRecepcao/)
  assert.match(settings, /definirAcessoRecepcaoBarbeiro/)
  assert.match(settings, /Remover acesso/)
  assert.match(settings, /<ReceptionTeamLink \/>/)
  assert.match(report, /Relatório da recepção/)
  assert.match(report, /<ReceptionTeamLink \/>/)
  assert.match(teamLink, /https:\/\/app\.garagemsystem\.com\.br\/reception\/board/)
  assert.match(teamLink, /navigator\.clipboard\.writeText\(url\)/)
  assert.match(protectedRoute, /state=\{\{ from:/)
  assert.match(login, /requestedRoute === '\/reception\/board'/)
  assert.match(login, /recepcao_acesso_operador_verificar/)
  assert.match(barber, /canAccessReception && <Button/)
  assert.match(api, /functions\.invoke\('create-receptionist'/)
  assert.match(edge, /inviteUserByEmail/)
  assert.match(edge, /role: 'recepcao'/)
  assert.match(edge, /barbearia_modulos/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.profiles FROM anon, authenticated/)
  assert.match(migration, /recepcao_assert_operador/)
  assert.match(accessMigration, /CREATE TABLE public\.recepcao_acessos_barbeiro/)
  assert.match(accessMigration, /CREATE OR REPLACE FUNCTION public\.recepcao_acesso_operador_verificar/)
  assert.match(leastPrivilege, /DROP POLICY IF EXISTS "Users can select from same barbearia" ON public\.clientes/)
  assert.doesNotMatch(leastPrivilege, /'recepcao'\)/)
  assert.match(login, /profile\.ativo === false/)
})
