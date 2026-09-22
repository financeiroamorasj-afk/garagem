---
description: "Versiona, protege e prepara o deploy da migration de cadastros financeiros Fase 2C, com backup e dry-run obrigatórios."
---

# /financeiro-predeploy-cadastros-fase-2c

## Objetivo

Preparar o deploy seguro da migration
`20260825120000_financeiro_cadastros_fase_2c.sql` para o projeto Garagem
System. Não publique nada neste comando: ele deve parar após o `dry-run` e
aguardar aprovação humana explícita.

Projeto permitido: `wzgtqduivvdfeskpmopq`.

## Regras

- Não use SQL Editor, `migration repair`, `db reset`, `--include-all` ou
  `--include-seed`.
- Não exponha token, senha, connection string, dados de clientes ou conteúdo
  dos dumps.
- Não faça commit de alterações alheias já existentes no worktree.
- Não execute `db push --linked` nesta fase; somente `--dry-run`.
- Pare se a CLI estiver vinculada a qualquer projeto diferente do ref acima.

## Etapa 1 — Revisão e commit exclusivo

1. Confira `git status --short`, `git diff --check` e o diff dos arquivos
   financeiros alterados. Preserve tudo que não pertença à Fase 2C.
2. A revisão deve conter somente o conjunto necessário ao contrato:
   - `supabase/migrations/20260825120000_financeiro_cadastros_fase_2c.sql`;
   - `supabase/tests/financeiro_fase_2c.sql`;
   - `tests/financeiro-cadastros-concorrencia.test.js`;
   - `src/lib/financeiro/api.js`;
   - `src/lib/financeiro/schemas.js`;
   - `tests/financeiro-helpers.test.js`;
   - `supabase/tests/financeiro_fase_2b.sql`, somente se a mudança for o
     ajuste de ACL de 15 para 17 RPCs.
3. Se houver qualquer arquivo adicional, pare e informe. Não use `git add .`.
4. Após apresentar o conjunto, peça confirmação para criar o commit. Com a
   confirmação, use apenas:

```powershell
git add -- supabase/migrations/20260825120000_financeiro_cadastros_fase_2c.sql supabase/tests/financeiro_fase_2c.sql tests/financeiro-cadastros-concorrencia.test.js src/lib/financeiro/api.js src/lib/financeiro/schemas.js tests/financeiro-helpers.test.js supabase/tests/financeiro_fase_2b.sql
git commit -m "feat(financeiro): adiciona cadastros seguros fase 2c"
```

5. Confirme que o índice ficou vazio após o commit e reporte hash/assunto do
commit, sem fazer push para Git remoto nesta etapa.

## Etapa 2 — Backup lógico novo

Após confirmação humana, peça uma pasta privada, fora do repositório e sem
sincronização. Ela deve ser nova, por exemplo:

`E:\Backups\garagem-system\pre-deploy-cadastros-2c-2026-08-25`

Use exclusivamente o fluxo de `/financeiro-backup-logico` para gerar os dumps
de roles, schema, dados e histórico. Não reutilize ou sobrescreva backups
anteriores. Valide presença, tamanho não nulo e SHA-256 sem publicar hashes,
dados ou credenciais. Pare e peça confirmação de que a pasta está privada e
recuperável.

## Etapa 3 — Pré-verificação remota, somente leitura

Execute:

```powershell
npx supabase projects list
npx supabase migration list --linked
Get-FileHash supabase\migrations\20260825120000_financeiro_cadastros_fase_2c.sql -Algorithm SHA256
```

Confirme:

- o projeto é `wzgtqduivvdfeskpmopq`;
- migrations até `20260824160000` estão alinhadas local/remoto;
- somente `20260825120000` está pendente no remoto;
- nenhuma migration financeira inesperada aparece.

Se houver divergência, pare sem executar `dry-run`.

## Etapa 4 — Dry-run obrigatório

Após confirmação humana de backup e pré-verificação, execute somente:

```powershell
npx supabase db push --linked --dry-run
```

A saída aceitável contém exclusivamente
`20260825120000_financeiro_cadastros_fase_2c.sql`.

Pare após o dry-run. Informe versões/nomes esperados, backup utilizado e
commit criado. Peça uma aprovação explícita separada para o deploy real. Não
execute `db push --linked` até receber essa aprovação.

## Formato do relatório

```
## Relatório /financeiro-predeploy-cadastros-fase-2c

### Commit
[hash, arquivos estritamente incluídos e índice vazio]

### Backup lógico
[destino privado e cobertura, sem segredos]

### Estado remoto
[projeto, histórico e pendência]

### Dry-run — NÃO APLICADO
[somente a migration 20260825120000]

### Próximo checkpoint
[aprovação humana explícita para db push]
```
