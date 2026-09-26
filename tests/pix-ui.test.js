import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('PIX da unidade é configurável e aparece nos três fluxos de cobrança', async () => {
  const [settings, panel, cut, reception, sale, migration] = await Promise.all([
    readFile(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PixPaymentPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CutCompletionModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ReceptionCheckoutModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ReceptionProductSaleModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260925210000_configuracao_pix_barbearia.sql', import.meta.url), 'utf8'),
  ])
  assert.match(settings, /salvarConfiguracaoPix/)
  assert.match(settings, /Chave PIX/)
  assert.match(panel, /gerarPayloadPix/)
  assert.match(panel, /Copiar PIX/)
  assert.match(cut, /PixPaymentPanel/)
  assert.match(reception, /PixPaymentPanel/)
  assert.match(sale, /PixPaymentPanel/)
  assert.match(migration, /configuracoes_pix_obter/)
  assert.match(migration, /financeiro_auditar/)
  assert.match(migration, /jsonb_build_object\('configurado'/)
})
