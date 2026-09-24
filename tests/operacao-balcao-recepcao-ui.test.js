import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('recepção oferece venda vinculada, histórico, estorno e relatório gerencial', async () => {
  const [board, saleModal, salesHistory, adminReport, app, navigation, api, migration, refundMigration, reportMigration] = await Promise.all([
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ReceptionProductSaleModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ReceptionSalesHistory.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminReceptionReport.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/recepcao/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924190000_operacao_balcao_recepcao.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924200000_estorno_vendas_balcao.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924210000_cliente_relatorio_recepcao.sql', import.meta.url), 'utf8'),
  ])

  assert.match(board, /Venda avulsa/)
  assert.match(board, /Devolver ao barbeiro/)
  assert.match(board, /Nenhum estoque será baixado/)
  assert.match(saleModal, /Profissional responsável \(opcional\)/)
  assert.match(saleModal, /Venda direta da recepção/)
  assert.match(saleModal, /CLIENTE \(OPCIONAL\)/)
  assert.match(saleModal, /buscarClientesRecepcao/)
  assert.match(salesHistory, /Vendas avulsas recentes/)
  assert.match(salesHistory, /Estornar venda/)
  assert.match(board, /Esta operação fica registrada e não apaga o histórico da venda/)
  assert.match(api, /recepcao_venda_avulsa_concluir/)
  assert.match(api, /recepcao_venda_avulsa_concluir_cliente/)
  assert.match(api, /admin_recepcao_resumo/)
  assert.match(api, /recepcao_vendas_balcao_listar/)
  assert.match(api, /recepcao_venda_avulsa_estornar/)
  assert.match(api, /recepcao_fila_devolver/)
  assert.match(migration, /SET status='cancelado'/)
  assert.match(migration, /SET status='em_atendimento'/)
  assert.match(migration, /CREATE TABLE public\.vendas_balcao/)
  assert.doesNotMatch(migration, /DELETE FROM public\.atendimento_pendencias/)
  assert.match(refundMigration, /SET status='estornado'/)
  assert.match(refundMigration, /SET status='cancelada'/)
  assert.match(refundMigration, /tipo,quantidade/)
  assert.doesNotMatch(refundMigration, /DELETE FROM public\.vendas_balcao/)
  assert.match(adminReport, /Desempenho por operador/)
  assert.match(adminReport, /Valor estornado/)
  assert.match(app, /path="recepcao"/)
  assert.match(navigation, /\/admin\/recepcao/)
  assert.match(reportMigration, /ADD COLUMN cliente_id uuid/)
  assert.match(reportMigration, /CREATE OR REPLACE FUNCTION public\.admin_recepcao_resumo/)
  assert.match(reportMigration, /public\.recepcao_assert_admin\(\)/)
})

