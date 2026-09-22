---
tags: [funcionalidade, financeiro, envelopes]
---
# Envelopes

Os envelopes no Garagem System seguem o **Modelo B**: um envelope Ã© um *saldo lÃ³gico* (reserva), e nÃ£o uma conta bancÃ¡ria fÃ­sica separada.

## Como funciona
- Uma conta bancÃ¡ria possui um "saldo bancÃ¡rio real" (apurado pelo ledger) e um "saldo disponÃ­vel".
- **Saldo disponÃ­vel** = (Saldo bancÃ¡rio) - (Soma das reservas/envelopes vinculadas).
- O dinheiro real *sÃ³ sai da conta bancÃ¡ria* no momento de pagar uma conta real ou no resgate. Resgates debita o envelope e devolve a disponibilidade de caixa.

## Regras
1. **IdempotÃªncia:** Toda distribuiÃ§Ã£o e resgate Ã© idempotente via payload (para nÃ£o haver double-submit).
2. **Locks e ConcorrÃªncia:** ModificaÃ§Ãµes de saldo e movimentaÃ§Ã£o usam locks de linha/advisory locks.
3. **DistribuiÃ§Ã£o DiÃ¡ria:** A distribuiÃ§Ã£o inicial Ã© pensada para ser feita com base num fechamento diÃ¡rio, baseando-se no caixa operacional lÃ­quido realizado (no fuso horÃ¡rio America/Sao_Paulo).
4. Os percentuais de distribuiÃ§Ã£o somados podem atingir de 0% atÃ© 100%.

## Salvaguardas
- **Saldo nÃ£o negativo** garantido direto no banco de dados e atravÃ©s de RPC transacional.
