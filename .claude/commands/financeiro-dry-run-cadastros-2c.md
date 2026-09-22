---
description: "Executa somente a pré-verificação e o dry-run remoto da migration de cadastros Fase 2C; não aplica nada."
---

# /financeiro-dry-run-cadastros-2c

## Objetivo

Confirmar que o deploy remoto da Fase 2C aplicaria exclusivamente
`20260825120000_financeiro_cadastros_fase_2c.sql` no projeto Garagem System.

Este comando é estritamente de leitura/prévia. É proibido executar `db push`
sem `--dry-run`, SQL Editor, `migration repair`, `db reset`, `--include-all` ou
`--include-seed`.

## Contexto aprovado

- Commit financeiro: `0973368943a951e0325dce83fdda395dba13ca15`.
- Backup lógico novo: `E:\Backups\garagem-system\pre-deploy-cadastros-2c-2026-08-25`.
- Projeto permitido: `wzgtqduivvdfeskpmopq`.

## Execução

1. Confirme que o backup continua presente e que o diretório é privado, sem
   abrir ou exibir conteúdo dos dumps.
2. Execute somente:

```powershell
npx supabase projects list
npx supabase migration list --linked
Get-FileHash supabase\migrations\20260825120000_financeiro_cadastros_fase_2c.sql -Algorithm SHA256
```

3. Pare se o projeto vinculado não for `wzgtqduivvdfeskpmopq`, se alguma
   migration até `20260824160000` estiver divergente, ou se existir outra
   migration financeira pendente.
4. Se a única pendência remota for `20260825120000`, execute exclusivamente:

```powershell
npx supabase db push --linked --dry-run
```

5. Não prossiga para `npx supabase db push --linked` em hipótese alguma.

## Saída aceitável

O dry-run deve listar somente:

```text
20260825120000_financeiro_cadastros_fase_2c.sql
```

Qualquer outra versão, erro ou divergência bloqueia o deploy e deve ser
reportada sem tentativa de correção remota.

## Relatório

```
## Relatório /financeiro-dry-run-cadastros-2c

### Projeto e histórico
[ref confirmado e migrations alinhadas]

### Backup confirmado
[somente destino e presença]

### Dry-run — NÃO APLICADO
[versions/nome listados]

### Pronto para deploy?
[sim/não; se sim, aguardar aprovação humana para db push]
```
