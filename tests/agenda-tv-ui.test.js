import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('modo TV é administrativo, somente leitura, responsivo e protege dados do cliente', async () => {
  const [app, agenda, tv] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgenda.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminAgendaTv.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(app, /path="\/admin\/agenda\/tv" element={<AdminAgendaTv/)
  assert.match(agenda, /Modo TV/)
  assert.match(agenda, /navigate\('\/admin\/agenda\/tv'\)/)
  assert.match(tv, /resolveAdminAccess/)
  assert.match(tv, /listarAgendaAdminPeriodo\(date, date\)/)
  assert.match(tv, /listarBarbeiros\(\{ incluirInativos: false \}\)/)
  assert.match(tv, /nomeClienteProtegido/)
  assert.match(tv, /AUTO_REFRESH_MS = 60_000/)
  assert.match(tv, /PAGE_ROTATION_MS = 15_000/)
  assert.match(tv, /requestFullscreen/)
  assert.match(tv, /postgres_changes/)
  assert.match(tv, /youtubeEmbedUrl/)
  assert.match(tv, /Agenda com YouTube/)
  assert.match(tv, /listType|videoseries/)
  assert.match(tv, /allow="autoplay; encrypted-media; picture-in-picture"/)
  assert.doesNotMatch(tv, /cliente_telefone|valor_final|cpf/i)
  assert.doesNotMatch(tv, /AddAppointmentModal|WalkInModal|mudarStatusAgendamento/)
})
