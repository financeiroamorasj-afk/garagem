import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('barbeiro confirma dinheiro ou aprovação da maquininha antes de encerrar', async () => {
  const [modal, panel, registrations, migration] = await Promise.all([
    readFile(new URL('../src/components/CutCompletionModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PaymentConfirmationPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/financeiro/FinanceRegistrations.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261019180000_destinos_pagamento_dinheiro_cartao.sql', import.meta.url), 'utf8'),
  ])

  assert.match(modal, /Confirmar dinheiro e encerrar/)
  assert.match(modal, /Confirmar cartão e encerrar/)
  assert.match(modal, /paymentConfirmed/)
  assert.match(panel, /maquininha exibiu pagamento aprovado/)
  assert.match(panel, /recebi e conferi o dinheiro/)
  assert.match(registrations, /Dinheiro no caixa/)
  assert.match(registrations, /Débito e crédito/)
  assert.match(registrations, /presetType: 'caixa'/)
  assert.match(registrations, /presetType: 'cartao'/)
  assert.match(migration, /tipo='caixa'/)
  assert.match(migration, /tipo='cartao'/)
  assert.match(migration, /financeiro_direcionar_movimento_checkout_trigger/)
})
