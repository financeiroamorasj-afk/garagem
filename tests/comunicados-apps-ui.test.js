import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('sino segmenta avisos nos apps e leva à funcionalidade indicada', async () => {
  const [bell, api, admin, barber, migration] = await Promise.all([
    readFile(new URL('../src/components/AppNotificationBell.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/comunicados/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261021220000_central_avisos_apps.sql', import.meta.url), 'utf8'),
  ])

  assert.match(admin, /AppNotificationBell contexto="gestao"/)
  assert.match(barber, /AppNotificationBell contexto="barbeiro"/)
  assert.match(bell, /Atualizações e avisos/)
  assert.match(bell, /createPortal\(/)
  assert.match(bell, /fixed inset-x-3 top-\[calc\(4\.5rem\+env\(safe-area-inset-top\)\)\]/)
  assert.match(bell, /mx-auto .*max-w-\[23rem\]/)
  assert.match(bell, /document\.body/)
  assert.match(bell, /navigate\(item\.destino\)/)
  assert.match(bell, /Marcar todas como lidas/)
  assert.match(api, /app_comunicados_listar/)
  assert.match(api, /app_comunicado_marcar_lido/)
  assert.match(migration, /publico IN \('gestao','barbeiros','ambos'\)/)
  assert.match(migration, /'\/admin\/disponibilidade'/)
  assert.match(migration, /'\/barber\/disponibilidade'/)
  assert.equal((migration.match(/'2026-10-22 06:00:00-03'/g) ?? []).length, 2)
})
