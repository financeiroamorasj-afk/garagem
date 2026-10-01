import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('barbeiro pode adicionar, trocar e apagar a foto da memória ativa', async () => {
  const [component, viewer, admin, portal, portalApi, edgeFunction, privateMigration] = await Promise.all([
    readFile(new URL('../src/components/LastCutSummary.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CutPhotoViewer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminClients.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/portal/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/portal-cut-photo/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261001120000_fotos_portal_e_materiais_padrao.sql', import.meta.url), 'utf8'),
  ])
  const api = await readFile(new URL('../src/lib/clientes/cortes-api.js', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../supabase/migrations/20260929130000_atendimento_real_e_fotos.sql', import.meta.url), 'utf8')

  assert.match(component, /Adicionar foto/)
  assert.match(component, /Trocar foto/)
  assert.match(component, /Apagar foto/)
  assert.match(api, /cliente_corte_foto_atualizar/)
  assert.match(api, /cliente_corte_foto_remover/)
  assert.match(migration, /bucket_id='cortes-clientes'/)
  assert.match(migration, /v_corte\.profissional_id<>v_profissional/)
  assert.match(viewer, /Visualização ampliada da foto do corte/)
  assert.match(viewer, /Ampliar/)
  assert.match(component, /CutPhotoViewer/)
  assert.match(admin, /CutPhotoViewer/)
  assert.match(portal, /PortalCutPhoto/)
  assert.match(portalApi, /portal-cut-photo/)
  assert.match(edgeFunction, /createSignedUrl\(path, 300\)/)
  assert.match(privateMigration, /portal_corte_foto_path/)
  assert.match(privateMigration, /v_sessao\.cliente_id/)
})

