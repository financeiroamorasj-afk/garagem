---
description: "Implementa e valida somente no Supabase local o contrato seguro de envelopes Fase 2D, sem UI ou produção."
---

# /financeiro-implantar-contrato-envelopes-fase-2d

## Decisões de produto aprovadas

Leia `docs/financeiro/REFERENCIA-ENVELOPES-REBIP.md` integralmente. As decisões finais são obrigatórias:

- envelope é reserva lógica vinculada a uma conta bancária;
- distribuição reduz o saldo **disponível**, nunca o saldo bancário real e nunca cria `financeiro_movimentacoes`;
- resgate devolve disponibilidade à conta vinculada; pagar o título continua sendo a única saída bancária;
- lucro distribuível é caixa operacional líquido realizado, em `America/Sao_Paulo`;
- percentuais ativos somam entre 0% e 100%; distribuição diária é manual;
- resíduo fica não distribuído; não há ajustes manuais nesta versão.

## Objetivo

Criar a migration aditiva do contrato de envelopes e seus testes, aplicando-a **somente no Supabase local**. Não criar UI, rota, componentes, dados reais, commit, push, backup, dry-run remoto ou deploy.

## Requisitos de modelagem

1. Criar `financeiro_envelopes` com `barbearia_id`, conta bancária vinculada por FK composta, nome normalizado, finalidade, percentual opcional, ativo, `saldo_acumulado numeric(15,2) NOT NULL DEFAULT 0 CHECK (saldo_acumulado >= 0)`, timestamps, PK e chave candidata `(barbearia_id,id)`.

2. Criar razão append-only `financeiro_envelopes_transacoes` para `distribuicao`, `resgate` e `estorno`. Valores estritamente positivos, direção inequívoca, saldo antes/depois não negativos, correlação, autor, idempotência/hash e FKs compostas. Proibir por constraints combinações indevidas de origem. Não incluir tipo `ajuste` nesta versão.

3. Criar cabeçalho imutável de distribuição diária, com período BRT, versão de fórmula, base distribuível, percentual total, valor distribuído, idempotência, payload hash, autor, correlação e unicidade que impeça repetir o mesmo fechamento diário da mesma fórmula/barbearia.

4. Não gravar distribuição/resgate em `financeiro_movimentacoes`. Expor por RPC de leitura o saldo bancário, reservado e disponível por conta, onde `disponível = saldo bancário do ledger - reservas ativas vinculadas`. Validar que reserva nunca excede disponibilidade no momento de distribuir.

5. Estender o contrato de contas a pagar apenas se necessário para ligar de forma composta um único resgate ao título. Resgate deve aceitar somente título manual pendente, da mesma barbearia, e impedir segundo resgate ativo. O pagamento deve ocorrer pela conta vinculada ao envelope quando houver resgate, ou a RPC deve rejeitar a liquidação; nunca permita pagar por outra conta silenciosamente.

6. Definir a Fórmula A canônica a partir do ledger efetivado no intervalo BRT diário: entradas operacionais efetivadas menos taxas efetivadas e pagamentos operacionais efetivados. Excluir transferências, créditos de clientes, estornos, ajustes e qualquer fluxo de envelope. Use uma única função/helper interno para fronteiras BRT; não duplique cálculo de timezone.

## RPCs e segurança

Implementar somente as RPCs públicas necessárias, com nomes coerentes ao padrão existente:

- cadastro/listagem de envelopes;
- simulação de distribuição diária sem escrita;
- distribuição diária idempotente;
- resgate idempotente para título pendente;
- estorno append-only do resgate, quando o título ainda permitir;
- leitura de transações do envelope e saldos disponíveis por conta.

Todas as escritas devem usar `financeiro_assert_admin()`, `SECURITY DEFINER`, `search_path = public, auth`, `financeiro_idempotencia`, hash de payload, audit log e locks. Revogar previamente `PUBLIC`, `anon` e `authenticated`; conceder apenas as RPCs públicas a `authenticated`. Helpers internos, tabelas, razão, idempotência e audit log devem continuar fechados ao browser.

Use lock consultivo por barbearia/operação/chave e `FOR UPDATE` em envelopes/títulos, em ordem estável, para impedir duas distribuições ou resgates concorrentes. Não aceitar `barbearia_id`, saldo, autor ou timestamps do frontend.

## Testes obrigatórios, apenas locais

Criar testes SQL transacionais e teste de concorrência com duas conexões PostgreSQL reais para comprovar:

- tenant cruzado, anon, acesso direto e helpers internos negados;
- saldo bancário real inalterado por distribuição/resgate;
- saldo disponível reduzido/restaurado corretamente;
- distribuição não supera disponibilidade, não repete o dia e trata resíduo;
- percentuais inválidos/acima de 100% rejeitados;
- fórmula exclui transferências, créditos, estornos e transações de envelope;
- retry idêntico é idempotente e payload divergente falha;
- dois resgates concorrentes não excedem saldo;
- título pago/cancelado/não manual ou já vinculado é rejeitado;
- pagamento após resgate usa a conta vinculada e gera uma única saída bancária;
- estorno correto, segundo estorno negado;
- auditoria, BRT em virada UTC e FKs compostas.

Rode migrations do zero apenas no stack local. Fixtures devem terminar em `ROLLBACK` ou limpeza garantida.

## Validação e relatório

Executar testes financeiros, lint dos arquivos alterados, `git diff --check` e build. Não mascarar falhas preexistentes.

Entregar `Relatório /financeiro-implantar-contrato-envelopes-fase-2d` com migration criada, assinaturas RPC, ACL final, evidência dos testes e concorrência, arquivos alterados e confirmação explícita de que nada foi aplicado em produção, nenhum dado real foi criado e nenhum commit foi feito.

Ao terminar, parar para revisão humana antes de qualquer pré-deploy.

