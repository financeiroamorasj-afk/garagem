import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('barbeiro envia parte técnica e recepção acompanha fila real', async () => {
  const [modal, barber, reception, cutApi, receptionApi, agendaUi, adminAgenda, clientPortal, migration, realtimeMigration] = await Promise.all([
    readFile(new URL('../src/components/CutCompletionModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clientes/cortes-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/recepcao/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/agenda/ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924170000_fila_recepcao.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924171000_fila_recepcao_realtime.sql', import.meta.url), 'utf8'),
  ])

  assert.match(modal, /verificarAcessoModulo\('recepcao'\)/)
  assert.match(modal, /Enviar para cobrança/)
  assert.match(modal, /Nenhum estoque, comissão ou lançamento financeiro será movimentado agora/)
  assert.match(cutApi, /barbeiro_atendimento_enviar_recepcao/)
  assert.match(barber, /Atendimento enviado para cobrança na recepção/)
  assert.match(receptionApi, /recepcao_fila_listar/)
  assert.match(reception, /Aguardando cobrança/)
  assert.match(reception, /atendimento_pendencias/)
  assert.match(agendaUi, /aguardando_pagamento/)
  assert.match(adminAgenda, /aguardando_pagamento/)
  assert.match(clientPortal, /aguardando_pagamento: 'Aguardando pagamento'/)
  assert.match(migration, /CHECKOUT_USAR_RECEPCAO/)
  assert.match(migration, /UPDATE public\.agendamentos SET status='aguardando_pagamento'/)
  assert.match(realtimeMigration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.atendimento_pendencias/)
  assert.doesNotMatch(migration, /UPDATE public\.produtos SET estoque_quantidade=estoque_quantidade-/)
})
