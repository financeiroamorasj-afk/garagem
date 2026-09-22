---
description: "Confere pré-requisitos e executa somente o dry-run remoto do deploy de aporte avulso em envelopes (Fase 2D.1)."
---

# /financeiro-dry-run-aporte-avulso-2d-1

## Escopo

Executar exclusivamente verificações de leitura e `npx supabase db push --linked --dry-run`. Não aplicar migration, não usar SQL Editor, `migration repair`, seed, commit, push ou alterar dados, permissões ou configurações remotas.

## Pré-verificações obrigatórias

1. Confirmar CLI Supabase disponível, projeto vinculado `wzgtqduivvdfeskpmopq` e estado saudável.
2. Confirmar o commit local `aa11cf7` (`feat(financeiro): adiciona aporte avulso em envelopes`) e que o índice Git está vazio.
3. Confirmar que existe a migration:

```text
supabase/migrations/20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql
```

4. Consultar o histórico remoto somente leitura. Ele deve estar alinhado até `20260825130000` e não pode conter migrations financeiras inesperadas.
5. Confirmar o backup privado em:

```text
E:\Backups\garagem-system\pre-deploy-aporte-avulso-2d1-2026-08-27
```

Os cinco dumps devem continuar presentes e não vazios.
6. Executar `git diff --check`; alterações alheias podem permanecer no worktree, mas não podem ser staged ou incluídas nesta etapa.

## Dry-run

Executar:

```powershell
npx supabase db push --linked --dry-run
```

O único resultado aceitável deve listar exclusivamente:

```text
20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql
```

Se aparecer qualquer outra migration, projeto diferente, backup ausente, divergência de histórico ou erro, parar e relatar. Não executar o deploy real.

## Relatório obrigatório

Entregar `Relatório /financeiro-dry-run-aporte-avulso-2d-1` com:

- projeto e histórico local/remoto;
- commit e estado do índice;
- backup confirmado, sem expor hashes;
- lista exata do dry-run;
- confirmação de que nada foi aplicado;
- conclusão “pronto para deploy” ou bloqueios concretos.

Se a prévia estiver aprovada, aguardar autorização humana explícita antes de executar `npx supabase db push --linked`.
