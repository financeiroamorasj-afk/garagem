---
description: "Audita em modo somente leitura o aporte avulso em envelopes após o deploy da Fase 2D.1."
---

# /financeiro-auditar-aporte-avulso-2d-1

## Execução obrigatória

Usar exclusivamente MCP Supabase em modo somente leitura no projeto `wzgtqduivvdfeskpmopq`. Executar somente `SELECT` e consultas aos catálogos PostgreSQL.

Não usar CLI de banco, SQL Editor, RPCs mutáveis, migrations, inserts, updates, deletes, seeds ou qualquer outro canal de escrita. Se o MCP não estiver disponível, parar e relatar o bloqueio; não substituir por outro meio.

## Histórico

Confirmar:

- as nove migrations locais correspondem às nove versões remotas;
- `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql` está registrada;
- não existem migrations financeiras pendentes ou inesperadas.

## Estrutura e integridade do aporte

Auditar exclusivamente por catálogo:

1. `financeiro_envelopes_transacoes` aceita `aporte_avulso` somente como crédito, com `valor > 0`, sem distribuição, conta a pagar ou estorno, e com `saldo_depois = saldo_antes + valor`.
2. Os triggers append-only de transações e distribuições estão presentes e habilitados.
3. RLS permanece habilitado em envelopes, distribuições, transações, idempotência e audit log.
4. Não há grants diretos dessas tabelas para `authenticated`, `anon` ou `PUBLIC`.
5. FKs compostas, constraints de unicidade e isolamento por `barbearia_id` preservam o contrato anterior.

## RPC, permissões e segurança

Confirmar a assinatura exata:

```text
financeiro_aportar_envelope(uuid, numeric, text, text)
```

Ela deve ser `SECURITY DEFINER`, usar `search_path = public, auth` e ter `EXECUTE` somente para `authenticated`.

Confirmar também:

- exatamente 28 RPCs financeiras públicas executáveis por `authenticated`, incluindo as 10 de envelopes e `financeiro_aportar_envelope`;
- zero execuções financeiras para `anon` e `PUBLIC`;
- helpers internos, administrativos e de envelopes fechados para browser;
- a separação aprovada permanece válida: `financeiro_data_brt(timestamptz)` e o trigger `financeiro_envelope_imutavel()` podem permanecer `SECURITY INVOKER` porque são internos, sem grants externos e com `search_path` fixo; não classificá-los como falha por isso.

## Disponibilidade e semântica

Inspecionar a definição da RPC e helpers relacionados para confirmar que o aporte:

- deriva o tenant exclusivamente de `financeiro_assert_admin()`;
- exige envelope ativo e valor positivo finito arredondado a centavos;
- usa idempotência interna com hash e rejeita payload divergente;
- valida disponibilidade por `financeiro_validar_debito_disponivel` antes de reservar;
- aumenta somente a reserva/saldo lógico do envelope;
- não grava em `financeiro_movimentacoes` e não altera saldo bancário real;
- registra razão append-only e audit log;
- não permite que disponibilidade fique negativa por corrida ou escrita direta.

## Critério de liberação

Liberar a UI do botão **Adicionar reserva** somente se todas as verificações passarem. Caso qualquer item esteja ausente, inseguro ou inconclusivo, manter a UI bloqueada e listar o bloqueador sem executar correções.

## Relatório obrigatório

Entregar `Auditoria /financeiro-auditar-aporte-avulso-2d-1` contendo:

- projeto, histórico e confirmação de leitura exclusiva;
- tabelas/RLS/grants/constraints/triggers;
- tabela separando RPCs públicas e helpers internos;
- contagem de ACLs para `authenticated`, `anon` e `PUBLIC`;
- resultado do contrato de disponibilidade e aporte;
- conclusão explícita “UI pode avançar” ou “UI bloqueada”, com motivo;
- confirmação expressa de que nenhuma escrita foi realizada.
