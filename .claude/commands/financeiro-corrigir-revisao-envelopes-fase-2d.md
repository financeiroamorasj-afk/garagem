---
description: "Corrige os bloqueadores encontrados na revisão dos envelopes Fase 2D, somente no Supabase local."
---

# /financeiro-corrigir-revisao-envelopes-fase-2d

## Escopo autorizado

Corrigir a migration ainda não publicada `supabase/migrations/20260825130000_financeiro_envelopes_fase_2d.sql` e seus testes locais. Não criar uma migration adicional, não alterar UI, não acessar produção, não executar `db push`, não criar dados reais, commit ou push.

## Bloqueadores a corrigir

### 1. Desativação não pode liberar reserva

Hoje a disponibilidade soma apenas envelopes ativos. Desativar um envelope com saldo torna sua reserva disponível sem resgate, o que viola o Modelo B.

Implementar uma regra de banco explícita:

- envelope com `saldo_acumulado > 0` não pode ser desativado;
- a RPC deve retornar erro estável, por exemplo `FINANCEIRO_ENVELOPE_COM_SALDO`;
- `financeiro_saldos_disponiveis_contas` deve contabilizar toda reserva com saldo, independentemente de atividade, como defesa adicional;
- envelopes sem saldo podem ser desativados e reativados dentro da regra percentual;
- o frontend nunca deve poder alterar `ativa` diretamente.

### 2. Troca de conta não pode deslocar uma reserva

Hoje a edição permite trocar `conta_bancaria_id` mesmo com saldo acumulado, deslocando disponibilidade entre contas sem transferência real.

Implementar:

- se o envelope tiver `saldo_acumulado > 0`, rejeitar mudança de conta com erro estável, por exemplo `FINANCEIRO_CONTA_ENVELOPE_COM_SALDO`;
- edição de nome, finalidade e percentual continua permitida, sujeita à versão e ao teto percentual;
- troca de conta só é permitida quando o saldo for zero;
- não introduzir transferência automática, ajuste ou mutação direta de saldo nesta fase.

### 3. Fonte de disponibilidade da distribuição

Formalizar e validar a decisão de produto aprovada:

- lucro diário é uma base global de sugestão, calculada pela Fórmula A;
- cada envelope é financiado exclusivamente pela sua **própria conta bancária vinculada**;
- para distribuir, a disponibilidade atual dessa conta deve comportar a soma dos valores de todos os envelopes ativos ligados a ela;
- o usuário deve transferir dinheiro pelo fluxo existente entre contas antes de distribuir para envelopes vinculados a outra conta;
- distribuição não cria `financeiro_movimentacoes`, não move banco e não gera saída artificial;
- nenhuma conta pode ficar com saldo disponível negativo após a distribuição.

Corrigir a implementação para agregar os itens por `conta_bancaria_id` antes da validação. A mensagem de erro deve identificar que a disponibilidade da conta vinculada é insuficiente, sem expor dados de outro tenant.

## Testes obrigatórios

Ampliar `supabase/tests/financeiro_fase_2d.sql` e, se útil, o teste de concorrência, comprovando em transação com rollback:

- tentativa de desativar envelope com saldo falha e o saldo continua reservado/disponibilidade inalterada;
- envelope sem saldo pode ser desativado;
- tentativa de trocar conta de envelope com saldo falha e não altera a disponibilidade de nenhuma conta;
- envelope sem saldo pode trocar de conta;
- distribuição com dois envelopes na mesma conta verifica soma agregada;
- distribuição para envelope em conta sem disponibilidade falha mesmo se outra conta possuir saldo;
- transferência real prévia entre contas pelo fluxo existente torna a distribuição possível, sem entrar no lucro distribuível;
- saldo bancário real continua inalterado por distribuir/resgatar;
- ACL final continua restrita: somente RPCs públicas aprovadas para `authenticated`, nenhuma para `anon`/`PUBLIC`, helpers e tabelas fechados;
- ajustar qualquer contagem de RPC existente de modo consistente (esperado: 27 RPCs públicas financeiras, se nenhuma assinatura adicional for criada).

## Validação local

Reaplicar do zero apenas no Supabase local e rodar os testes SQL financeiros, concorrência, suíte JavaScript, lint dos arquivos modificados, build e `git diff --check`. Relatar separadamente falhas globais preexistentes.

## Relatório

Entregar `Relatório /financeiro-corrigir-revisao-envelopes-fase-2d` com os erros estáveis adotados, as mudanças de contrato, evidência dos testes de saldo/disponibilidade/tenant/ACL e confirmação de que nenhuma alteração ocorreu fora do ambiente local. Parar para nova auditoria humana antes de commit ou pré-deploy.

