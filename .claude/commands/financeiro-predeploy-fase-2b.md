---
description: "Prepara o pré-deploy da Fase 2B financeira: revisa o escopo, cria commit exclusivo, exige novo backup e só então apresenta a prévia remota."
---

# /financeiro-predeploy-fase-2b

## Objetivo

Preparar com segurança a publicação da migration
`20260824160000_financeiro_contrato_fase_2b.sql`, ainda ausente da produção.

A Fase 2B está aprovada localmente após auditoria humana: RPCs de resumo e
títulos, validações e idempotência de transferência. A interface continua fora
do escopo.

## Regras de segurança

- Projeto permitido: somente `wzgtqduivvdfeskpmopq` (Garagem System).
- Não use SQL Editor, `migration repair`, `db reset`, `--include-all`,
  `--include-seed` ou `db push` nesta etapa.
- Não inclua alterações alheias no commit.
- Não revele tokens, senhas, connection strings, dados de clientes ou conteúdo
  dos backups.
- O backup de `2026-08-24` é anterior à Fase 1.1 e não serve como proteção
  suficiente para este deploy. Um novo backup lógico é obrigatório.

## Etapa 1 — Pré-verificação somente leitura

1. Confirme CLI, projeto e histórico:

```powershell
npx supabase --version
npx supabase projects list
npx supabase migration list --linked
```

2. Só prossiga se:
   - o projeto vinculado for `wzgtqduivvdfeskpmopq` e estiver saudável;
   - `20260818180000`, `20260824130000`, `20260824133000`, `20260824140000` e
     `20260824150000` estiverem alinhadas local/remoto;
   - `20260824160000` estiver pendente somente no remoto;
   - não houver outra migration pendente ou divergente.

3. Calcule SHA-256 somente da migration nova e apresente apenas o resultado
   para revisão local:

```powershell
Get-FileHash supabase\migrations\20260824160000_financeiro_contrato_fase_2b.sql -Algorithm SHA256
```

4. Mostre `git status --short` e `git diff --check`. Identifique, sem alterar,
   todos os arquivos que pertencem à Fase 2B:
   - `supabase/migrations/20260824160000_financeiro_contrato_fase_2b.sql`
   - `src/lib/financeiro/api.js`
   - `src/lib/financeiro/schemas.js`
   - `supabase/tests/financeiro_fase_2b.sql`
   - `tests/financeiro-helpers.test.js`
   - `tests/financeiro-transferencia-concorrencia.test.js`
   - `package.json` e o lockfile correspondente, somente se a dependência
     `pg` tiver sido adicionada exclusivamente para o teste concorrente.

5. Pare e entregue o relatório da pré-verificação. Não faça commit ainda.

## Etapa 2 — Commit exclusivo

Somente após confirmação humana da Etapa 1:

1. Revise o diff de cada arquivo listado. Se qualquer arquivo não estiver
   presente, já estiver versionado com conteúdo não revisado ou houver outro
   arquivo necessário, pare e peça decisão; não use `git add .`.
2. Adicione explicitamente somente os arquivos aprovados. Inclua `package.json`
   e lockfile somente se o diff comprovar que servem ao teste concorrente.
3. Crie um único commit:

```text
feat(financeiro): adiciona contrato seguro da fase 2b
```

4. Mostre o hash e confirme que nenhuma outra mudança foi staged ou incluída.
5. Pare e peça confirmação para gerar o novo backup lógico.

## Etapa 3 — Novo backup lógico

Somente após confirmação humana da Etapa 2:

1. Peça uma pasta privada, fora do repositório e não sincronizada, com data e
   hora atual — por exemplo `E:\Backups\garagem-system\pre-deploy-fase-2b-YYYY-MM-DD`.
2. Use o procedimento já aprovado de `/financeiro-backup-logico` para gerar
   roles, schema, dados e histórico de migrations pelo CLI, usando `--linked`.
3. Valide presença, tamanho e SHA-256 dos dumps, sem exibir o conteúdo.
4. Registre que Storage exige backup separado se estiver em uso.
5. Pare e peça que o responsável confirme que o backup é privado e recuperável.

## Etapa 4 — Prévia remota, sem escrita

Somente após confirmação humana do backup novo:

```powershell
npx supabase db push --linked --dry-run
```

A saída aceitável deve conter exclusivamente:

```text
20260824160000_financeiro_contrato_fase_2b.sql
```

Não execute `db push` real. Informe o resultado e peça aprovação explícita
para o deploy. Se houver qualquer versão adicional, pare.

## Formato do relatório

```
## Relatório /financeiro-predeploy-fase-2b

### Pré-verificação
[projeto, histórico, hash e Git]

### Commit
[somente após aprovação]

### Backup novo
[somente após aprovação]

### Dry-run
[somente após aprovação]

### Pronto para deploy?
[sim/não e condição precisa]
```
