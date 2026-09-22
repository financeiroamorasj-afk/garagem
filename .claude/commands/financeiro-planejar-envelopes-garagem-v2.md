---
description: "Especifica o contrato seguro dos envelopes Modelo B no Garagem usando a referência Rebip já registrada localmente."
---

# /financeiro-planejar-envelopes-garagem-v2

## Fonte de verdade já disponível

Leia obrigatoriamente `docs/financeiro/REFERENCIA-ENVELOPES-REBIP.md`. Esse arquivo registra o relatório humano de auditoria do Rebip/Amora e é suficiente para esta etapa. Não procure o repositório Rebip, não exija o comando `/financeiro-ler-envelopes-rebip` e não declare esse pré-requisito ausente.

## Tarefa

Faça somente leitura do Garagem System e entregue o `Relatório /financeiro-planejar-envelopes-garagem-v2`.

Inspecione as migrations financeiras publicadas, as RPCs de títulos/pagamento/recebimento/transferência, tabelas do ledger, idempotência, auditoria, período BRT e a tela financeira atual.

Especifique, sem criar migration, código, teste, commit, dado ou alteração remota:

1. o modelo de dados de envelopes lógicos persistidos e sua razão de transações;
2. checks de saldo não negativo, FKs compostas, RLS e zero grants diretos;
3. percentuais, distribuição/aporte, resgate vinculado a conta a pagar e como impedir dupla contagem;
4. locks, idempotência, versão otimista, auditoria e ACLs seletivas;
5. pelo menos duas fórmulas possíveis de lucro distribuível para barbearia, sempre em `America/Sao_Paulo`, excluindo transferências e outros fluxos que não sejam resultado operacional;
6. a fórmula recomendada, marcada como decisão humana obrigatória antes de implementar;
7. compatibilidade com títulos e ledger existentes, riscos e matriz completa de testes SQL locais.

Não copie os defeitos do Rebip: prevenção de saldo só no frontend, ausência de idempotência, autenticação inconsistente, BRT duplicado ou regra percentual somente visual.

Ao final, pare e aguarde aprovação humana. Nenhuma implementação é autorizada nesta tarefa.

