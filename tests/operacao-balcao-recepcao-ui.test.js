import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('recepção oferece venda avulsa e devolução auditada sem excluir histórico', async () => {
  const [board, saleModal, api, migration] = await Promise.all([
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ReceptionProductSaleModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/recepcao/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924190000_operacao_balcao_recepcao.sql', import.meta.url), 'utf8'),
  ])

  assert.match(board, /Venda avulsa/)
  assert.match(board, /Devolver ao barbeiro/)
  assert.match(board, /Nenhum estoque será baixado/)
  assert.match(saleModal, /Profissional responsável \(opcional\)/)
  assert.match(saleModal, /Venda direta da recepção/)
  assert.match(api, /recepcao_venda_avulsa_concluir/)
  assert.match(api, /recepcao_fila_devolver/)
  assert.match(migration, /SET status='cancelado'/)
  assert.match(migration, /SET status='em_atendimento'/)
  assert.match(migration, /CREATE TABLE public\.vendas_balcao/)
  assert.doesNotMatch(migration, /DELETE FROM public\.atendimento_pendencias/)
})

