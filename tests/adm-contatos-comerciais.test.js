import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('funil comercial mantém prospects separados dos tenants e protegido pelo ADM', async () => {
  const [migration, data, actions] = await Promise.all([
    read('../supabase/migrations/20261013170000_funil_contatos_comerciais.sql'),
    read('../apps/adm/src/lib/commercial-contacts.ts'),
    read('../apps/adm/src/app/(protected)/contatos/actions.ts'),
  ])

  for (const table of ['saas_contatos_comerciais', 'saas_contatos_interacoes']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}`))
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }
  assert.match(migration, /REVOKE ALL ON TABLE public\.saas_contatos_comerciais FROM PUBLIC,anon,authenticated/)
  assert.match(migration, /GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public\.saas_contatos_comerciais TO service_role/)
  assert.match(migration, /FOREIGN KEY \(checkout_id,produto_id\) REFERENCES public\.saas_checkouts/)
  assert.match(migration, /FOREIGN KEY \(assinatura_id,produto_id\) REFERENCES public\.saas_assinaturas/)
  assert.match(data, /requirePlatformAdmin\(\["super_admin"\]\)/)
  assert.match(actions, /revalidatePath\("\/contatos"\)/)
})

test('interação atualiza histórico e acompanhamento de forma transacional', async () => {
  const [migration, data] = await Promise.all([
    read('../supabase/migrations/20261013170000_funil_contatos_comerciais.sql'),
    read('../apps/adm/src/lib/commercial-contacts.ts'),
  ])

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.saas_contato_registrar_interacao/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /INSERT INTO public\.saas_contatos_interacoes/)
  assert.match(migration, /UPDATE public\.saas_contatos_comerciais/)
  assert.match(data, /\.rpc\("saas_contato_registrar_interacao"/)
  assert.match(data, /CONTATO_MOTIVO_PERDA_OBRIGATORIO/)
  assert.match(data, /CONTATO_CONVERSAO_EXIGE_VINCULO/)
})

test('interface oferece funil, atalhos de canal, retorno e conversão vinculada', async () => {
  const [shell, board, detail, form] = await Promise.all([
    read('../apps/adm/src/components/admin-shell.tsx'),
    read('../apps/adm/src/app/(protected)/contatos/contact-board.tsx'),
    read('../apps/adm/src/app/(protected)/contatos/[id]/page.tsx'),
    read('../apps/adm/src/app/(protected)/contatos/interaction-form.tsx'),
  ])

  assert.match(shell, /href: "\/contatos"/)
  assert.match(shell, /roles: \["super_admin"\]/)
  assert.match(board, /https:\/\/wa\.me\//)
  assert.match(board, /https:\/\/instagram\.com\//)
  assert.match(board, /próxima ação/i)
  assert.match(detail, /Linha do tempo/)
  assert.match(detail, /Converter contato/)
  assert.match(form, /Registrar interação/)
  assert.match(form, /motivo_perda/)
})
