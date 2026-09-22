---
description: "Audita em modo somente leitura o deploy de envelopes Fase 2D no Supabase remoto."
---

# /financeiro-auditar-envelopes-2d

## Segurança da execução

Usar exclusivamente MCP Supabase configurado em modo leitura para o projeto `wzgtqduivvdfeskpmopq`. Executar apenas consultas `SELECT`/catálogo. Não usar SQL Editor, DDL, DML, RPC mutável, CLI de escrita ou dados de teste.

## Verificações obrigatórias

1. Histórico

- confirmar `20260825130000_financeiro_envelopes_fase_2d` registrado;
- confirmar nenhuma migration financeira pendente ou inesperada.

2. Estrutura e integridade

- confirmar `financeiro_envelopes`, `financeiro_envelopes_distribuicoes` e `financeiro_envelopes_transacoes`;
- RLS ativo em todas e nenhum grant direto de tabela para `anon`, `authenticated` ou `PUBLIC`;
- checks de saldo acumulado/saldos de razão não negativos, valor positivo, tipos/direções e referências de origem;
- FKs compostas por `barbearia_id` para conta, envelope, distribuição, título e estorno;
- unicidade de nome ativo, distribuição diária, idempotência e estorno;
- triggers append-only presentes para distribuição e transações;
- `envelope_resgate_transacao_id` em contas a pagar e seu índice único.

3. Disponibilidade e proteção de reservas

Ler as definições das funções para confirmar:

- distribuição e resgate não inserem em `financeiro_movimentacoes`;
- saldo disponível considera todas as reservas com saldo, inclusive inativas caso existam registros legados;
- pagamento e transferência chamam o helper interno de débito disponível;
- helper bloqueia conta e envelopes antes de validar saldo;
- pagamento de título resgatado exige a conta vinculada ao envelope;
- helper de lucro exclui transferência, crédito de cliente, estorno, ajuste e envelope;
- período BRT usa `America/Sao_Paulo` de forma canônica.

4. RPCs e ACLs

- listar as 27 RPCs financeiras públicas esperadas em `authenticated`, incluindo as 10 de envelopes;
- `anon` e `PUBLIC`: nenhuma RPC financeira executável;
- helpers `financeiro_assert_admin`, `financeiro_auditar`, helpers de envelope e funções internas: fechados para `authenticated`;
- todas as funções financeiras relevantes: `SECURITY DEFINER` e `search_path` fixo em `public, auth`.

## Relatório obrigatório

Entregar `Auditoria /financeiro-auditar-envelopes-2d` contendo projeto confirmado, histórico, estrutura, ACLs, proteções de disponibilidade, discrepâncias encontradas e confirmação explícita de que nenhuma escrita foi realizada.

## Critério de bloqueio

Bloquear a UI caso qualquer ACL esteja exposta, tabela tenha grant direto, função não tenha proteção esperada, migration não esteja registrada ou o saldo disponível possa ignorar reservas.

