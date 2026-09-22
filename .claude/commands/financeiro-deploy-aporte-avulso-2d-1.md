---
description: "Aplica exclusivamente a migration aprovada de aporte avulso em envelopes (Fase 2D.1) e confirma o histórico remoto."
---

# /financeiro-deploy-aporte-avulso-2d-1

## Autorização e escopo

O deploy foi autorizado humanamente após backup lógico confirmado e dry-run aprovado.

Aplicar exclusivamente ao projeto vinculado `wzgtqduivvdfeskpmopq`:

```text
20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql
```

Não usar SQL Editor, `migration repair`, `--include-all`, seed, comandos destrutivos, push Git ou commits. Não alterar dados reais manualmente.

## Pré-condições imediatas

1. Confirmar CLI Supabase e projeto vinculado `wzgtqduivvdfeskpmopq`.
2. Confirmar o backup privado e recuperável:

```text
E:\Backups\garagem-system\pre-deploy-aporte-avulso-2d1-2026-08-27
```

3. Confirmar que os cinco dumps existem e não estão vazios.
4. Consultar o histórico remoto. Ele deve estar alinhado até `20260825130000` e `20260827100000` deve continuar pendente exclusivamente no remoto.
5. Confirmar que a migration local existe e que o índice Git está vazio.

Se qualquer condição falhar, parar sem executar deploy.

## Deploy

Executar somente:

```powershell
npx supabase db push --linked
```

Aceitar somente a aplicação de `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql`. Se a CLI listar outra migration para aplicação, cancelar e relatar antes de qualquer continuação.

## Pós-verificação obrigatória

1. Confirmar somente leitura que `20260827100000` foi registrada no histórico remoto.
2. Executar `npx supabase db push --linked --dry-run`; o resultado deve informar que o banco remoto está atualizado ou não listar migrations pendentes.
3. Não executar aportes, pagamentos, transferências ou qualquer operação financeira real.
4. Não fazer auditoria estrutural por SQL/CLI alternativo: ela deve ocorrer separadamente via MCP Supabase somente leitura.

## Relatório obrigatório

Entregar `Relatório /financeiro-deploy-aporte-avulso-2d-1` com:

- projeto e migration efetivamente aplicada;
- estado final do histórico local/remoto;
- resultado da pós-verificação;
- aviso de cache, se houver, apenas como aviso e com confirmação posterior do histórico;
- localização do backup preservado;
- confirmação de que nenhum aporte ou outra operação financeira foi executado;
- pedido para executar a auditoria MCP somente leitura antes de conectar a UI.
