import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('portal público é mobile-first e cobre acesso, agenda, histórico, equipe e perfil', async () => {
  const [app, page, api, migration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/portal/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260923230000_portal_cliente.sql', import.meta.url), 'utf8'),
  ])
  assert.match(app, /path="\/portal\/:slug" element={<ClientPortal/)
  assert.match(page, /Portal do cliente/i)
  assert.match(page, /Sua barbearia sempre com você/)
  assert.match(page, /ENTRAR OU CRIAR CONTA/)
  assert.match(page, /o cadastro abre automaticamente/)
  assert.match(page, /Novo agendamento/i)
  assert.match(page, /Memória de cortes/i)
  assert.match(page, /Nossa equipe/i)
  assert.match(page, /Preferências pessoais/i)
  assert.match(page, /grid-cols-5/)
  assert.match(page, /setInterval\(update, 10000\)/)
  assert.match(page, /Atendimento concluído\. Seu histórico já foi atualizado\./)
  assert.match(page, /\['em_atendimento', 'aguardando_pagamento'\]/)
  assert.match(page, /item\.status === 'concluido'.*localDateKey/)
  assert.match(page, /addEventListener\('pageshow', update\)/)
  assert.match(page, /aria-label="Atualizar atendimentos"/)
  assert.match(page, /env\(safe-area-inset-top\)/)
  assert.match(page, /env\(safe-area-inset-bottom\)-1rem/)
  assert.match(page, /if \(tab !== 'historico'\) return/)
  assert.match(page, /refresh\(\)\.catch/)
  assert.match(page, /scrollIntoView\(\{ behavior: 'smooth'/)
  assert.match(page, /barber\.foto_url/)
  assert.match(page, /Primeiro disponível/)
  assert.match(page, /grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4/)
  assert.match(page, /col-span-full flex min-h-16/)
  assert.match(page, /aspect-\[4\/5\]/)
  assert.match(page, /object-\[center_28%\]/)
  assert.doesNotMatch(page, /flex snap-x gap-3 overflow-x-auto/)
  assert.match(page, /aria-pressed=\{barberId === barber\.id\}/)
  assert.match(api, /persistSession: false/)
  assert.match(api, /portal_agendamento_criar/)
  assert.match(migration, /portal_sessoes/)
  assert.match(migration, /extensions\.digest/)
  assert.match(migration, /'portal_cliente'/)
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS cpf\s/)
})
