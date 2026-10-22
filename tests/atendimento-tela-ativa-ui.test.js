import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('atendimento ativo mantém a tela ligada e recupera o bloqueio ao voltar', async () => {
  const [dashboard, hook] = await Promise.all([
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useScreenWakeLock.js', import.meta.url), 'utf8'),
  ])
  assert.match(dashboard, /useScreenWakeLock\(Boolean\(activeAppointment\)\)/)
  assert.match(dashboard, /Tela mantida ativa/)
  assert.match(hook, /navigator\.wakeLock\.request\('screen'\)/)
  assert.match(hook, /visibilitychange/)
  assert.match(hook, /sentinel\.release\(\)/)
})
