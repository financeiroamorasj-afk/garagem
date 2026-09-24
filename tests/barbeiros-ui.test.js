import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { homeRouteForRole } from '../src/lib/auth/homeRoute.js'
import { mensagemErroBarbeiro } from '../src/lib/barbeiros/ui.js'

test('direciona cada papel para sua experiência inicial', () => {
  assert.equal(homeRouteForRole('admin'), '/admin/dashboard')
  assert.equal(homeRouteForRole('master'), '/admin/dashboard')
  assert.equal(homeRouteForRole('barbeiro'), '/barber/dashboard')
  assert.equal(homeRouteForRole('recepcao'), '/reception/board')
  assert.equal(homeRouteForRole('reception'), '/reception/board')
})

test('mapeia erros de cadastro de barbeiro sem expor detalhes internos', () => {
  assert.match(mensagemErroBarbeiro({ message: 'BARBEIROS_EMAIL_EM_USO' }).message, /e-mail/i)
  assert.match(mensagemErroBarbeiro({ message: 'BARBEIROS_CONFLITO_VERSAO' }).message, /outra sessão/i)
  assert.equal(mensagemErroBarbeiro({ message: 'BARBEIROS_CONFLITO_VERSAO' }).conflict, true)
  assert.doesNotMatch(mensagemErroBarbeiro({ message: 'SQL segredo interno' }).message, /SQL segredo interno/)
})

test('cadastro cria acesso somente pela função protegida e a rota não é mais provisória', async () => {
  const api = await readFile(new URL('../src/lib/barbeiros/api.js', import.meta.url), 'utf8')
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const edge = await readFile(new URL('../supabase/functions/create-barber/index.ts', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../supabase/migrations/20260923150000_barbeiros_acesso_agenda.sql', import.meta.url), 'utf8')
  const commissionMigration = await readFile(new URL('../supabase/migrations/20260924130000_comissao_produtos_barbeiro.sql', import.meta.url), 'utf8')
  const frontend = `${api}\n${app}`

  assert.match(api, /functions\.invoke\(['"]create-barber/)
  assert.doesNotMatch(frontend, /SERVICE_ROLE/)
  assert.match(app, /path="barbeiros" element={<AdminBarbers/)
  assert.match(edge, /getUser\(accessToken\)/)
  assert.match(edge, /adminProfile\?\.role !== 'admin'/)
  assert.match(edge, /inviteUserByEmail/)
  assert.match(migration, /profissionais_user_id_unique/)
  assert.match(migration, /GRANT EXECUTE.*authenticated/)
  assert.match(migration, /REVOKE ALL.*PUBLIC, anon/)
  assert.match(api, /p_comissao_produtos_percentual/)
  assert.match(edge, /comissao_produtos_percentual/)
  assert.match(commissionMigration, /vendas_produtos_comissao_padrao_trg/)
})
