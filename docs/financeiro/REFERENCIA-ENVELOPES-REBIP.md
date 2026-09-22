# Referência de envelopes — Rebip/Amora

> Fonte: relatório de auditoria somente leitura fornecido pelo responsável do projeto em 25/08/2026. Este documento não substitui uma nova auditoria do Rebip; ele preserva as conclusões aprovadas para orientar a adaptação no Garagem System.

## Modelo de produto

O Rebip usa o **Modelo B**: um envelope é um saldo lógico, não uma conta bancária. O dinheiro efetivo sai somente no aporte/distribuição. Um resgate interno de envelope para pagamento de uma conta não pode criar uma segunda movimentação bancária, pois duplicaria a saída.

O módulo encontrado no Rebip está tecnicamente completo, mas nunca foi usado em produção: havia sete envelopes e saldo zero. Ele vivia somente na branch `feat/envelopes-diagnostico-schema`.

## Estrutura e comportamento encontrados

- `envelopes.saldo_acumulado` é persistido, não recalculado.
- `envelopes_transacoes.valor` exige valor estritamente positivo.
- Os tipos de transação incluem distribuição e fechamento de ciclo, além dos fluxos de aporte/resgate.
- A sugestão de distribuição usa um cálculo diário de lucro, distinto do DRE mensal.
- A experiência considera finalidades como reserva, reinvestimento e sócios.
- A regra de 100% existia como sugestão de UI; o endpoint que movimentava valores não a impunha.

## Limitações do Rebip que não devem ser portadas

- Não há `CHECK` de saldo não negativo no banco; a prevenção existe apenas na aplicação.
- Distribuir e resgatar não têm idempotência, permitindo double-submit.
- Há cobertura inconsistente de autenticação entre endpoints.
- Existem duas abordagens para cálculo de BRT no mesmo módulo.
- O fechamento ainda lê a coluna legada `conta_vinculada_id` em vez de `conta_destino_id`.

## Portabilidade para o Garagem

Portar o núcleo conceitual: saldo lógico persistido, razão de transações, teto de saldo, distribuição/aporte e resgate vinculado a conta a pagar, sempre evitando dupla contagem.

Não portar cálculo de lucro baseado em CPV de mercadorias, consignação, Curadoria, paleta visual ou o legado `movimentar.js`. A fórmula de lucro distribuível deverá ser definida a partir do ledger da barbearia, no fuso `America/Sao_Paulo`.

## Salvaguardas obrigatórias no Garagem

- saldo não negativo garantido no banco e em RPC transacional;
- idempotência com hash de payload em qualquer aporte, distribuição, resgate ou ajuste;
- locks de linha/advisory locks para concorrência;
- autenticação administrativa uniforme por `financeiro_assert_admin()`;
- `SECURITY DEFINER`, `search_path` fixo, ACLs seletivas e nenhum grant direto às tabelas;
- auditoria antes/depois e correlação;
- FKs compostas por barbearia;
- uma única implementação canônica de período BRT;
- regra de percentual imposta no banco, se for adotada pelo produto.

## Decisões aprovadas para o Garagem System

- Envelope é uma reserva lógica vinculada a uma conta bancária.
- Distribuição não cria `financeiro_movimentacoes` e não reduz o saldo bancário real; ela reduz somente o saldo disponível da conta vinculada e credita o razão do envelope.
- Saldo disponível da conta = saldo bancário apurado pelo ledger menos a soma das reservas ativas vinculadas à conta.
- Resgate debita o envelope e devolve disponibilidade à sua conta vinculada. O pagamento posterior continua sendo a única saída bancária do título.
- Quando o dinheiro estiver fisicamente em outra conta de liquidez/poupança, a transferência real entre contas será registrada pelo fluxo já existente e continuará fora do resultado operacional.
- Lucro distribuível: Fórmula A, caixa operacional líquido realizado em `America/Sao_Paulo`.
- Percentuais ativos podem somar de 0% até 100%.
- Distribuição é manual e diária em BRT na primeira versão.
- Resíduos de arredondamento não são distribuídos automaticamente.
- Ajustes manuais não serão oferecidos na primeira versão.
