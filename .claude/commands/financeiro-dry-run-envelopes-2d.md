---
description: "Confere pré-requisitos e executa somente o dry-run remoto do deploy de envelopes Fase 2D."
---

# /financeiro-dry-run-envelopes-2d

## Escopo

Executar exclusivamente verificações e `npx supabase db push --linked --dry-run`. Não aplicar migration, não usar SQL Editor, `migration repair`, seed, commit, push ou alterar dados/remoto.

## Pré-verificações obrigatórias

1. Confirmar CLI Supabase disponível, projeto vinculado `wzgtqduivvdfeskpmopq` e estado saudável.
2. Confirmar commit local `9271580` e que o índice Git está vazio.
3. Confirmar que existe a migration:

```text
supabase/migrations/20260825130000_financeiro_envelopes_fase_2d.sql
```

4. Consultar o histórico remoto somente leitura. Ele deve estar alinhado até `20260825120000` e não pode conter migration financeira inesperada.
5. Confirmar o backup privado em:

```text
E:\Backups\garagem-system\pre-deploy-envelopes-2d-2026-08-26
```

Os cinco dumps devem continuar presentes e não vazios.
6. Executar `git diff --check`; alterações alheias podem permanecer no worktree, mas não podem ser staged ou incluídas nesta etapa.

## Dry-run

Executar:

```powershell
npx supabase db push --linked --dry-run
```

O resultado aceitável deve listar exclusivamente:

```text
20260825130000_financeiro_envelopes_fase_2d.sql
```

Se aparecer qualquer outra migration, divergência de histórico, projeto diferente, backup ausente ou erro de segurança, parar e relatar. Não executar o deploy real.

## Relatório obrigatório

Entregar `Relatório /financeiro-dry-run-envelopes-2d` com:

- projeto e histórico local/remoto;
- commit e estado do índice;
- backup confirmado, sem expor hashes;
- lista exata do dry-run;
- confirmação de que nada foi aplicado;
- conclusão “pronto para deploy” ou bloqueios concretos.

Ao terminar com sucesso, aguardar autorização humana explícita antes de sugerir ou executar `npx supabase db push --linked`.

