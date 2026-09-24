import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('recepção confere carrinho e cobra apenas pela RPC transacional', async () => {
  const [modal, board, api, migration] = await Promise.all([
    readFile(new URL('../src/components/ReceptionCheckoutModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/recepcao/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924180000_cobranca_recepcao.sql', import.meta.url), 'utf8'),
  ])

  assert.match(board, /Conferir e cobrar/)
  assert.match(board, /ReceptionCheckoutModal/)
  assert.match(modal, /recepcao_carrinho_salvar|salvarCarrinhoRecepcao/)
  assert.match(modal, /concluirCobrancaRecepcao/)
  assert.match(modal, /O estoque ainda não foi movimentado/)
  assert.match(api, /recepcao_cobranca_concluir/)
  assert.match(migration, /UPDATE public\.produtos SET estoque_quantidade=estoque_quantidade-v_item\.quantidade/)
  assert.match(migration, /SET status='cobrado'/)
  assert.match(migration, /SET status='concluido'/)
  assert.match(migration, /RECEPCAO_COBRANCA_CONFLITO_VERSAO/)
})

