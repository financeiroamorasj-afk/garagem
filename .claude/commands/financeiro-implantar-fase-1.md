---
description: "Implementa a fundação segura do financeiro da barbearia: schema novo, RLS, RPCs atômicas e núcleo compartilhado. Não cria telas."
---

# /financeiro-implantar-fase-1

## Decisões aprovadas

- Comissão incide somente sobre **serviços**.
- O serviço reconhece receita na **conclusão do agendamento**; caixa é realizado
  somente na liquidação do recebível.
- Crédito, cupom e pacote pré-pago usam um **saldo único**, diferenciado por
  origem e motivo no razão imutável.
- Envelopes ficam para a próxima fase.
- Taxas de cartão são **despesa financeira** e também entram no cálculo da
  visão líquida de caixa, sem reduzir a receita duas vezes.
- Conciliação futura usa tolerância de **R$ 0,02** e janela de **5 dias**.

## Objetivo

Implementar exclusivamente a fundação técnica da Fase 1. Antes de alterar
qualquer tela, criar um novo módulo financeiro multi-tenant por `barbearia_id`,
com regras de acesso e operações multi-tabela atômicas no PostgreSQL.

Não reaproveite as tabelas legadas `contas_receber` e
`movimentacoes_financeiras`: elas usam `tenant_id` e não possuem as políticas
financeiras necessárias. Não as exclua, renomeie ou modifique nesta fase.

## Parte 0 — Checagens obrigatórias

1. Leia integralmente `docs/design-system/DESIGN-SYSTEM.md`, `src/index.css`,
   `src/pages/DesignSystem.jsx` e os primitivos em `src/components/ui/`.
   Registre que a Fase 1 não cria UI e preserve a especificação para a Fase 2.
2. Leia a migration baseline inteira e confirme a assinatura de
   `get_my_barbearia_id()` e `get_my_role()`.
3. Leia `src/lib/supabase.js`, a autenticação e as tabelas existentes
   (`agendamentos`, `servicos`, `profissionais`, `vendas_produtos`, `clientes`).
4. Confirme que não há `SUPABASE_SERVICE_ROLE_KEY` exposta ao frontend. Nunca
   introduza chave de serviço em `VITE_*`, no browser, em logs ou em commits.
5. Antes de escrever, mostre um plano curto dos arquivos que serão criados e
   espere a confirmação apenas se descobrir incompatibilidade material com o
   schema atual. Caso contrário, siga.

## Parte 1 — Migration nova e não destrutiva

Crie uma migration nova em `supabase/migrations/` com prefixo cronológico. Use
apenas tabelas novas com prefixo `financeiro_` para evitar colisão com legado:

- `financeiro_categorias`: `id`, `barbearia_id NOT NULL`, `nome`,
  `tipo` (`entrada|saida|ambos`), `grupo_dre`, `ativa`, timestamps;
  unicidade de nome por barbearia.
- `financeiro_contas_bancarias`: `id`, `barbearia_id NOT NULL`, `nome`,
  `instituicao`, `tipo`, `saldo_inicial`, `conta_principal`, `ativa`,
  `configuracao_repasse` JSONB, timestamps. Garanta no máximo uma conta
  principal ativa por barbearia com índice parcial.
- `financeiro_contas_pagar`: título, valor em `numeric(15,2)`, vencimento,
  competência, liquidação, status formal (`pendente|pago|estornado|cancelado`),
  categoria, conta, origem, referência externa/FITID, timestamps e vínculos
  opcionais. Não permita valores negativos.
- `financeiro_contas_receber`: bruto, taxa, líquido, previsão, liquidação,
  método de pagamento, status formal (`previsto|liquidado|estornado|cancelado`),
  conta destino, cliente, categoria, referência externa/FITID, e ligações
  opcionais a agendamento ou venda de produto. A origem de uma linha deve ser
  explícita; use constraints para impedir valor negativo.
- `financeiro_movimentacoes`: ledger imutável com `barbearia_id`, conta,
  direção (`entrada|saida`), valor, competência, liquidação, status, categoria,
  origem, `transferencia_id`, `idempotency_key`, FITID e vínculos opcionais a
  títulos, agendamento e venda. Não mantenha saldo mutável na conta como fonte
  de verdade.
- `financeiro_creditos_clientes` e `financeiro_creditos_movimentacoes`: saldo
  atual como projeção e razão imutável com motivo
  (`emissao|uso|estorno|ajuste|expiracao`), saldo antes/depois, valor, origem e
  referências. Saldo nunca pode ficar negativo.
- `financeiro_audit_log`: evento append-only com autor, request/correlation ID,
  origem, entidade, antes/depois e data. Não conceda UPDATE ou DELETE ao papel
  autenticado.

Inclua FKs para `barbearias`, `clientes`, `agendamentos`, `vendas_produtos`,
`profissionais` e entre as entidades financeiras quando aplicável. Inclua
índices por `(barbearia_id, status, data)` e índices parciais únicos para FITID
e `idempotency_key` no escopo correto. Use `numeric(15,2)` para dinheiro.

Habilite RLS em **todas** as tabelas novas. As policies devem usar
`get_my_barbearia_id()` em SELECT e `WITH CHECK` em INSERT/UPDATE. Escrita e
leitura financeira ficam restritas a `admin`/`master`; barbeiro não recebe
acesso direto ao ledger nem a títulos. Faça a migration idempotente apenas onde
isso não ocultar incompatibilidade; nunca use permissões abertas a `anon`.

## Parte 2 — RPCs transacionais

Implemente funções `SECURITY INVOKER` (não `SECURITY DEFINER` salvo justificativa
documentada), validar papel e `barbearia_id` a partir de `auth.uid()` no banco.
O chamador nunca fornece uma `barbearia_id` confiável.

Crie ao menos:

1. `financeiro_pagar_conta`: valida título pendente, idempotency key e conta;
   marca o título como pago e gera exatamente uma saída no ledger.
2. `financeiro_receber_conta`: valida recebível previsto, liquida-o e gera
   exatamente uma entrada no ledger. Taxa é registrada de modo rastreável, sem
   dupla redução da receita.
3. `financeiro_transferir`: gera par atômico entrada/saída com o mesmo
   `transferencia_id`; transferências nunca entram na DRE.
4. `financeiro_credito_movimentar`: bloqueia a linha do saldo, calcula saldo
   antes/depois, rejeita saldo negativo e grava o razão imutável.

Use locks adequados (`FOR UPDATE`) onde duas operações concorrentes poderiam
duplicar pagamento, recebimento ou crédito. Erro deve abortar toda a operação:
não implemente rollback compensatório em JavaScript. Registre operação no audit
log. Documente contrato, retorno e erros de cada RPC em comentário SQL.

## Parte 3 — Núcleo compartilhado do frontend

Crie `src/lib/financeiro/` sem regra de persistência no componente:

- `moeda.js`: normalização e formatação segura de valores; nunca use soma de
  dinheiro com `Number` sem arredondamento centralizado.
- `periodo.js`: período e competência no fuso `America/Sao_Paulo`.
- `schemas.js`: enums e validações dos payloads permitidos.
- `api.js`: funções estreitas para invocar RPCs pelo cliente Supabase, sem SQL
  montado no browser e sem aceitar `barbearia_id` vindo de props/formulários.

Não crie DRE, conciliação, envelopes, gráficos, tabelas, rotas nem telas nesta
fase. Não altere os componentes existentes de agenda, vendas ou dashboard.

## Parte 4 — Verificação

1. Rode lint e build.
2. Com Supabase local, aplique somente as migrations locais. Não aplique em
   produção, não use `db push` e não execute comandos destrutivos sem uma
   confirmação explícita e ambiente local claramente identificado.
3. Adicione testes para os helpers e um roteiro SQL/manual que comprove:
   isolamento entre duas barbearias; bloqueio de barbeiro; idempotência;
   pagamento/recebimento sem duplicar ledger; transferência com duas pontas;
   crédito sem saldo negativo; e rollback após falha induzida.
4. Mostre os arquivos alterados, os resultados de lint/build/teste e qualquer
   decisão que tenha sido necessária. Pare para revisão humana antes de criar
   a Fase 2 visual.

## Critérios de aceite

- Nenhuma tabela nova financeira usa `tenant_id`.
- Nenhuma operação sensível depende de estado apenas no frontend.
- Nenhuma escrita financeira é possível fora do escopo de `barbearia_id` do
  usuário autenticado.
- Repetir a mesma operação idempotente não duplica títulos, saldo ou ledger.
- Dinheiro usa `numeric(15,2)` no banco e regra centralizada no cliente.
- A migration é aditiva e não toca no legado.
