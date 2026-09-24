import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('configurações administra ativação e rota da recepção exige módulo liberado', async () => {
  const [app, page, reception, gate, api, migration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ReceptionBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ModuleGate.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/configuracoes/modulos-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260924150000_modulos_assinatura.sql', import.meta.url), 'utf8'),
  ])

  assert.match(app, /path="configuracoes" element={<AdminSettings/)
  assert.match(app, /ModuleGate modulo="recepcao"/)
  assert.match(page, /Módulos da assinatura/)
  assert.match(page, /Contratação necessária/)
  assert.doesNotMatch(reception, /MOCK_|Math\.random|Lucas Silva/)
  assert.match(reception, /Nenhum dado demonstrativo é exibido/)
  assert.match(gate, /verificarAcessoModulo/)
  assert.match(api, /configuracoes_modulos_listar/)
  assert.match(api, /configuracoes_modulo_definir_ativo/)
  assert.match(api, /modulo_acesso_verificar/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.barbearia_modulos FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /MODULO_NAO_CONTRATADO/)
})
