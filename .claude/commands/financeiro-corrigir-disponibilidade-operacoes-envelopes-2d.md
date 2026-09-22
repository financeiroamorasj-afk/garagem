---
description: "Impede pagamentos e transferências de consumirem reservas de envelopes, somente no contrato local da Fase 2D."
---

# /financeiro-corrigir-disponibilidade-operacoes-envelopes-2d

## Escopo

Corrigir exclusivamente a migration local ainda não publicada `20260825130000_financeiro_envelopes_fase_2d.sql` e seus testes. Não criar migration adicional, UI, commit, push, backup, operação remota ou dados reais.

## Bloqueador

O contrato já calcula `saldo_disponivel = saldo_bancario - saldo_reservado`, mas `financeiro_pagar_conta` e `financeiro_transferir` ainda podem debitar a conta usando o saldo bancário integral.

Exemplo que deve passar a ser impossível: conta com R$ 100,00 e envelope reservado de R$ 90,00; pagamento ou transferência de R$ 100,00 não pode ser concluído porque consumiria reserva e deixaria disponibilidade negativa.

## Correção obrigatória

1. Criar helper interno fechado que, para uma conta da própria barbearia:

- bloqueie de forma estável a linha da conta bancária e os envelopes necessários;
- calcule saldo bancário efetivado menos todas as reservas com saldo daquela conta, independentemente de atividade;
- valide que o débito solicitado não deixa disponibilidade negativa;
- retorne erro estável `FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE` sem revelar dados de outro tenant.

2. Aplicar esse helper em:

- `financeiro_pagar_conta`, antes de criar a saída bancária;
- `financeiro_transferir`, para a conta de origem antes de criar suas duas pontas;
- qualquer outra RPC pública existente que crie saída efetivada de conta bancária, caso a auditoria local encontre uma.

3. Preservar as regras existentes:

- recebimentos não são bloqueados por reservas;
- pagamento com resgate de envelope continua exigindo a conta vinculada e deve considerar a reserva já liberada pelo resgate;
- distribuição e resgate continuam sem `financeiro_movimentacoes`;
- transferências permanecem excluídas do lucro distribuível;
- não alterar assinaturas públicas, ACLs ou idempotência existente sem justificativa e teste.

4. Concorrência:

- definir uma ordem global de locks para contas e envelopes;
- distribuição, resgate, pagamento e transferência não podem permitir disponibilidade negativa sob chamadas simultâneas;
- não usar bloqueio apenas no frontend ou cálculo anterior ao lock.

## Testes locais obrigatórios

Adicionar testes transacionais e concorrentes que provem:

- pagamento comum é bloqueado quando excede o saldo disponível, mesmo havendo saldo bancário suficiente;
- transferência de origem é bloqueada pelo mesmo motivo;
- resgate reduz a reserva e permite pagar o título pela conta vinculada;
- depois do pagamento, disponibilidade permanece correta;
- duas saídas concorrentes não conseguem consumir a mesma disponibilidade;
- outra barbearia não pode influenciar saldo/reserva;
- retries idempotentes continuam respondendo sem criar nova saída;
- `anon`, `PUBLIC`, helpers e tabelas continuam fechados, e a ACL pública mantém somente as 27 RPCs aprovadas para `authenticated`.

Reaplicar o conjunto do zero somente no Supabase local e executar testes SQL, teste de concorrência, testes JavaScript, lint dos arquivos alterados, build e `git diff --check`.

## Relatório

Entregar `Relatório /financeiro-corrigir-disponibilidade-operacoes-envelopes-2d` com as funções revisadas, ordem de locks, testes de pagamento/transferência concorrentes e confirmação de que nada foi aplicado em produção. Parar para auditoria humana antes de commit.

