import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mensagemErroCadastro } from '../src/lib/financeiro/cadastros-ui.js'

test('mapeia erros financeiros conhecidos sem expor detalhes internos', () => {
  const cases = [
    ['FINANCEIRO_NOME_ATIVO_EM_USO', 'Já existe'],
    ['FINANCEIRO_CONFLITO_VERSAO', 'outra sessão'],
    ['FINANCEIRO_CATEGORIA_COM_HISTORICO', 'possui histórico'],
    ['FINANCEIRO_ULTIMA_CONTA_ATIVA', 'última conta'],
    ['FINANCEIRO_SUBSTITUTA_INVALIDA', 'substituta'],
    ['FINANCEIRO_CADASTRO_NAO_ENCONTRADO', 'não foi encontrado'],
  ]
  for (const [code, expected] of cases) assert.match(mensagemErroCadastro({ message: code }).message, new RegExp(expected, 'i'))
  assert.equal(mensagemErroCadastro({ message: 'FINANCEIRO_CONFLITO_VERSAO' }).conflict, true)
  assert.match(mensagemErroCadastro({ code: '42501', message: 'permission denied' }).message, /permissão administrativa/)
  assert.doesNotMatch(mensagemErroCadastro({ message: 'SQL segredo interno' }).message, /SQL segredo interno/)
})

test('frontend financeiro usa somente RPCs e preserva idempotência por intenção', async () => {
  const page = await readFile(new URL('../src/pages/financeiro/FinanceRegistrations.jsx', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/lib/financeiro/api.js', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /\.from\(['"]financeiro_/)
  assert.doesNotMatch(api, /\.from\(['"]financeiro_/)
  assert.match(page, /createIntentRef\.current = crypto\.randomUUID\(\)/)
  assert.match(page, /idempotencyKey: createIntentRef\.current/)
  assert.match(page, /expectedUpdatedAt: modal\.row\.updated_at/)
  assert.doesNotMatch(page, /Ainda não salva|integração pendente|modo de prévia/i)
})
