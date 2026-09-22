---
description: "Revalida em modo somente leitura a segurança pós-deploy dos envelopes, distinguindo RPCs públicas de helpers internos."
---

# /financeiro-auditar-envelopes-2d-v2

## Execução

Usar exclusivamente MCP Supabase somente leitura no projeto `wzgtqduivvdfeskpmopq`. Executar apenas `SELECT` e consultas ao catálogo. Nenhuma escrita, RPC mutável, CLI de banco ou SQL Editor é autorizada.

## Critério de segurança correto

Classificar funções por papel:

1. **RPCs públicas e funções que atravessam a barreira de privilégios**: devem ser `SECURITY DEFINER`, com `search_path = public, auth`, ACL seletiva a `authenticated` e sem `EXECUTE` para `anon`/`PUBLIC`.
2. **Helpers internos sem acesso direto a tabelas protegidas**: podem ser `SECURITY INVOKER` quando estiverem fechados para `authenticated`, `anon` e `PUBLIC`, tiverem `search_path` fixo e só forem chamados por funções/triggers controlados.

Em particular, `financeiro_data_brt(timestamptz)` é helper determinístico de data e `financeiro_envelope_imutavel()` é função de trigger append-only. Não exigir `SECURITY DEFINER` delas apenas por serem helpers; trocar para definer sem necessidade ampliaria privilégios em vez de protegê-los.

## Verificações

- migration `20260825130000` registrada e histórico alinhado;
- três tabelas de envelope, RLS, grants, checks, FKs compostas, unicidades e triggers;
- 27 RPCs públicas financeiras: `SECURITY DEFINER`, `search_path` correto, `authenticated` somente;
- `anon` e `PUBLIC`: zero execuções financeiras;
- helpers administrativos e internos: fechados;
- `financeiro_data_brt` e `financeiro_envelope_imutavel`: fechados, `search_path` fixo, sem grants e uso limitado ao contrato interno;
- distribuição/resgate sem ledger bancário, disponibilidade protegida e pagamento/transferência usando o helper de débito disponível.

## Relatório

Entregar `Auditoria /financeiro-auditar-envelopes-2d-v2` com uma tabela separando RPCs públicas e helpers internos, e concluir se a UI pode avançar. Confirmar expressamente que nenhuma escrita foi realizada.

