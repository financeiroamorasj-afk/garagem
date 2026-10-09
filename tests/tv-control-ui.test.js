import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('link da TV abre em nova aba, pode ser copiado e informa a necessidade de tela visível', async () => {
  const panel = await readFile(new URL('../src/components/tv/TvControlPanel.jsx', import.meta.url), 'utf8')
  assert.match(panel, /const tvUrl = `\$\{window\.location\.origin\}\/tv`/)
  assert.match(panel, /navigator\.clipboard\.writeText\(tvUrl\)/)
  assert.match(panel, /href=\{tvUrl\} target="_blank" rel="noopener noreferrer"/)
  assert.match(panel, /to="\/admin\/agenda\/tv" target="_blank"/)
  assert.match(panel, /navegador pode pausar vídeos em abas ocultas/)
})

test('barbeiro só vê a aba TV quando autorizado e recebe estado vazio específico', async () => {
  const [dashboard, panel, api] = await Promise.all([
    readFile(new URL('../src/pages/BarberDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/tv/TvControlPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/tv/api.js', import.meta.url), 'utf8'),
  ])
  assert.match(dashboard, /const sections = canControlTv \? SECTIONS : SECTIONS\.filter/)
  assert.match(dashboard, /window\.addEventListener\('focus', checkTv\)/)
  assert.match(api, /TV_SEM_PERMISSAO/)
  assert.match(panel, /Sua permissão para controlar vídeos está ativa\. O dono ainda precisa conectar uma TV/)
  assert.doesNotMatch(panel, /Nenhuma TV conectada ou sua conta ainda não foi habilitada/)
})

test('prévia não desmonta o player em falha temporária da agenda', async () => {
  const preview = await readFile(new URL('../src/pages/AdminAgendaTv.jsx', import.meta.url), 'utf8')
  assert.match(preview, /loading && team\.length === 0/)
  assert.doesNotMatch(preview, /!error && \(\s*<div className=\{`relative grid/)
})
