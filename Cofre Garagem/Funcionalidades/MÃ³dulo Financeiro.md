---
tags: [funcionalidade, financeiro]
---
# MÃ³dulo Financeiro e Ledger

Este documento centraliza as regras de negÃ³cio operacionais que governam o financeiro do Garagem System.

## 1. FundaÃ§Ã£o e SeguranÃ§a
- **Isolamento de Dados:** Cada barbearia enxerga apenas seus dados atravÃ©s do isolamento por arbearia_id associado ao RLS (Row Level Security). O acesso administrativo Ã© delimitado por rotinas dmin/master.
- **Auditoria e Ledger:** Todas as operaÃ§Ãµes financeiras sÃ£o idempotentes. Existe um Ledger financeiro, e a rastreabilidade/auditoria Ã© aplicada e armazenada.

## 2. OperaÃ§Ãµes de TÃ­tulos e Contas
- O sistema gerencia contas bancÃ¡rias e categorias (criaÃ§Ã£o, ediÃ§Ã£o e ativaÃ§Ã£o).
- Regras de integridade rÃ­gidas impedem apagamento acidental ou uso indevido de contas desativadas.
- GeraÃ§Ã£o de relatÃ³rios com:
  - Resumo por perÃ­odo
  - Saldo por conta
  - Resultado diÃ¡rio
  - PrÃ³ximos vencimentos.
- O sistema permite listagem e liquidaÃ§Ã£o completa de tÃ­tulos (a pagar e a receber).

## 3. PendÃªncias Integrativas Mapeadas
- **Fonte de Verdade do Faturamento:** Necessidade de cravar se a geraÃ§Ã£o de tÃ­tulo financeiro ocorre na conclusÃ£o do atendimento ou na tela de fechamento da venda. A idempotÃªncia e geraÃ§Ã£o Ãºnica sÃ£o cruciais.
- **Comissionamento:** Fechar cÃ¡lculo de comissÃµes por profissional, evitando dupla contagem no fechamento de caixa.
- **Estornos:** Tratar adequadamente como cancelamentos afetam as operaÃ§Ãµes financeiras (auditoria antes e depois).
