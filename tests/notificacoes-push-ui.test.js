import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('web push registra dispositivo e avisa o profissional sobre agendamentos de qualquer origem', async () => {
  const [main, prompt, api, worker, migration, allAppointmentsMigration, edgeFunction, config] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PushNotificationPrompt.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/push/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261013110000_push_agenda_e_atendimento_ativo.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261020170000_notifica_todo_agendamento.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/push-appointment/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'),
  ])

  assert.match(main, /serviceWorker\.register\('\/sw\.js'\)/)
  assert.match(prompt, /avisos de qualquer novo agendamento mesmo quando o Garagem não estiver aberto/)
  assert.match(api, /pushManager\.subscribe/)
  assert.match(api, /notificacao_push_salvar/)
  assert.match(worker, /showNotification/)
  assert.match(worker, /notificationclick/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.notificacoes_push_assinaturas/)
  assert.match(migration, /net\.http_post/)
  assert.match(migration, /agendamento_portal_notificacao_push_trg/)
  assert.match(allAppointmentsMigration, /CREATE TRIGGER agendamento_notificacao_push_trg/)
  assert.match(allAppointmentsMigration, /AFTER INSERT ON public\.agendamentos/)
  assert.doesNotMatch(allAppointmentsMigration, /WHEN \(NEW\.origem='portal_cliente'\)/)
  assert.match(edgeFunction, /webpush\.sendNotification/)
  assert.match(edgeFunction, /Novo agendamento na sua agenda/)
  assert.doesNotMatch(edgeFunction, /origem !== 'portal_cliente'/)
  assert.match(config, /\[functions\.push-appointment\][\s\S]*verify_jwt = false/)
})

test('início do corte serializa por barbeiro e expõe o atendimento que bloqueia outro', async () => {
  const [migration, dashboard] = await Promise.all([
    readFile(new URL('../supabase/migrations/20261013110000_push_agenda_e_atendimento_ativo.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(v_profissional::text\|\|':atendimento-ativo',0\)\)/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.barbeiro_atendimento_ativo/)
  assert.match(dashboard, /activeAppointment\.data_hora/)
  assert.match(dashboard, /isToday \|\| isActive/)
})
