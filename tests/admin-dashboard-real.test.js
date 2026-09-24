import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('painel administrativo usa agenda, equipe e financeiro reais sem valores demonstrativos', async () => {
  const page = await readFile(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')

  assert.match(page, /obterResumoPeriodo/)
  assert.match(page, /listarAgendaAdminPeriodo/)
  assert.match(page, /listarBarbeiros/)
  assert.match(page, /DADOS REAIS DA BARBEARIA/)
  assert.doesNotMatch(page, /8\.450|2\.150|Dener|teamPayouts|mock/i)
})
