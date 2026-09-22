import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mensagemErroTitulo } from '../src/lib/financeiro/titulos-ui.js'

test('API de títulos manuais usa somente RPCs auditadas', () => {
  const source = fs.readFileSync(new URL('../src/lib/financeiro/api.js', import.meta.url), 'utf8')
  assert.match(source, /financeiro_criar_titulo_manual/)
  assert.match(source, /financeiro_editar_titulo_manual/)
  assert.match(source, /financeiro_cancelar_titulo_manual/)
  assert.doesNotMatch(source, /from\(['"]financeiro_contas_(pagar|receber)['"]\)/)
})

test('erros operacionais dos títulos não expõem detalhes do banco', () => {
  assert.equal(
    mensagemErroTitulo({ message: 'FINANCEIRO_TITULO_COM_RESERVA internal context' }).message,
    'Estorne o resgate do envelope antes de alterar este título.',
  )
  assert.equal(mensagemErroTitulo({ message: 'syntax error at SQL line 42' }).message, 'Não foi possível concluir a operação. Tente novamente.')
})
