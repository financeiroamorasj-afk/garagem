import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('painéis mostram disponibilidade e conclusão registra memória com foto compactada', async () => {
  const [barber, admin, availability, completion, image, cutApi, migration, availabilityMigration, extendedMigration] = await Promise.all([
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AvailabilityOverview.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CutCompletionModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clientes/imagem.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clientes/cortes-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923210000_memoria_cortes.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923211000_disponibilidade_operacional.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923212000_disponibilidade_calendario_extenso.sql', import.meta.url), 'utf8'),
  ])

  assert.match(admin, /Disponibilidade e conflitos da equipe/)
  assert.match(barber, /Minha disponibilidade/)
  assert.match(barber, /CutCompletionModal/)
  assert.match(barber, /LastCutSummary/)
  assert.match(availability, /Folga/)
  assert.match(availability, /conflito/)
  assert.match(completion, /Preferências permanentes do cliente/)
  assert.match(completion, /Foto do resultado/)
  assert.match(image, /image\/webp/)
  assert.match(image, /maxBytes = 800 \* 1024/)
  assert.match(cutApi, /barbeiro_atendimento_concluir/)
  assert.match(migration, /file_size_limit=EXCLUDED\.file_size_limit/)
  assert.match(migration, /cliente_cortes_um_ativo_idx/)
  assert.match(availabilityMigration, /Fora da disponibilidade/)
  assert.match(availabilityMigration, /Choque entre atendimentos/)
  assert.match(extendedMigration, /p_data_final-p_data_inicial>62/)
})
