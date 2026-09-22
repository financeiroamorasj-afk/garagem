---
description: "Implementa localmente o aporte avulso seguro em envelopes, sem movimentar o saldo bancário real."
---

# /financeiro-implantar-aporte-avulso-envelopes-2d-1

## Objetivo autorizado

Implementar **somente no Supabase local** a evolução 2D.1: aporte avulso em envelope.

O aporte avulso reserva parte do saldo já existente da conta bancária vinculada e aumenta o saldo lógico do envelope. Ele **não** cria saída, transferência ou ajuste em `financeiro_movimentacoes`; portanto, não altera o saldo bancário real e não gera dupla contagem. A disponibilidade passa a refletir a nova reserva.

Não conectar UI, não aplicar em produção, não alterar dados reais, não criar commit ou push. Parar após relatório para auditoria humana.

## Migration nova e aditiva

Criar uma única migration nova, posterior à `20260825130000`:

`supabase/migrations/20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql`

Não editar a migration 2D já aplicada em produção.

### Razão de envelopes

Ampliar as constraints de `financeiro_envelopes_transacoes` de forma transacional para aceitar o novo evento:

- `tipo = 'aporte_avulso'`;
- `direcao = 'credito'`;
- `distribuicao_id`, `conta_pagar_id` e `transacao_estornada_id` devem ser nulos;
- `valor > 0`, `saldo_antes >= 0` e `saldo_depois = saldo_antes + valor` continuam obrigatórios.

Preservar os eventos existentes (`distribuicao`, `resgate`, `estorno`) e os triggers append-only. Não adicionar update/delete em nenhuma razão.

### RPC pública nova

Criar exatamente uma RPC nova:

`financeiro_aportar_envelope(uuid, numeric, text, text)`

Parâmetros, nesta ordem:

1. `p_envelope_id`
2. `p_valor`
3. `p_idempotency_key`
4. `p_correlation_id DEFAULT NULL`

Contrato obrigatório:

- `SECURITY DEFINER` e `SET search_path = public, auth`;
- a barbearia vem exclusivamente de `financeiro_assert_admin()`;
- não aceitar `barbearia_id`, conta bancária ou saldo enviados pelo browser;
- envelope deve existir e estar ativo;
- valor deve ser numérico, finito, positivo e arredondado a centavos; rejeitar valor que se torna zero após o arredondamento;
- chave idempotente: `btrim`, entre 8 e 200 caracteres;
- usar a tabela interna `financeiro_idempotencia`, com operação `aportar_envelope`, payload hash SHA-256 e resposta idempotente; a mesma chave com payload diferente falha com `FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE`;
- adotar `FINANCEIRO_VALOR_INVALIDO`, `FINANCEIRO_ENVELOPE_NAO_ENCONTRADO`, `FINANCEIRO_ENVELOPE_INATIVO` e `FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE` como erros estáveis, sem detalhes SQL;
- gravar `data_brt` com `financeiro_data_brt()` no momento da operação. Não oferecer data retroativa ou futura nesta primeira versão;
- aumentar `saldo_acumulado` e `updated_at` do envelope;
- inserir uma linha append-only de `aporte_avulso` em `financeiro_envelopes_transacoes`;
- auditar o envelope antes/depois com `financeiro_auditar`, incluindo `correlation_id`;
- retornar JSON mínimo: `transacao_id`, `envelope_id`, `conta_bancaria_id`, `valor`, `saldo_antes`, `saldo_depois`, `disponivel_antes` e `idempotente`.

### Ordem de locks e disponibilidade

Evitar deadlock e corrida entre aporte, pagamento, transferência, distribuição, resgate e edição:

1. advisory lock por barbearia, operação e chave de idempotência;
2. consultar retry idempotente;
3. ler a conta atual do envelope;
4. chamar `financeiro_validar_debito_disponivel(barbearia, conta, valor)`, que bloqueia conta e envelopes da conta na ordem já aprovada;
5. bloquear e reler o envelope; se a conta tiver mudado durante a operação, falhar com conflito seguro e exigir retry, sem reservar na conta errada;
6. atualizar envelope, inserir razão e auditoria.

O aporte não pode consumir uma reserva existente nem permitir saldo disponível negativo. Ele reduz apenas a disponibilidade da conta vinculada pelo novo valor reservado.

### ACLs

- Revogar `EXECUTE` da função nova de `PUBLIC` e `anon`;
- conceder `EXECUTE` somente a `authenticated`;
- manter helpers, tabelas financeiras, idempotência e audit log sem grants diretos ao browser;
- atualizar a lista explícita de grants/revokes quando aplicável;
- após a mudança, `authenticated` executa exatamente **28** RPCs financeiras públicas; `anon` e `PUBLIC`, zero.

## Testes locais

Criar ou ampliar `supabase/tests/financeiro_fase_2d_1.sql`, sempre com `BEGIN` e `ROLLBACK`, comprovando:

- aporte de R$ 30,00 numa conta com R$ 100,00 e R$ 20,00 reservados resulta em envelope +R$ 30,00, reservado R$ 50,00 e disponível R$ 50,00;
- saldo bancário e quantidade de `financeiro_movimentacoes` não mudam;
- extrato retorna `aporte_avulso`, crédito, valor e saldo depois corretos;
- aporte acima do disponível é rejeitado sem escrita parcial;
- envelope inativo, UUID de outra barbearia, zero, negativo, não finito e valor que arredonda a zero são rejeitados;
- retry idêntico retorna idempotente e cria uma única transação;
- mesma chave com payload diferente é rejeitada;
- auditoria contém antes/depois e correlation ID;
- 28 RPCs públicas para `authenticated`; zero para `anon` e `PUBLIC`; helpers e tabelas internas fechados.

Ampliar o teste de concorrência real em `tests/financeiro-envelopes-concorrencia.test.js`:

- dois aportes distintos que, juntos, superam a disponibilidade: somente um pode confirmar;
- dois retries simultâneos da mesma intenção: uma única transação de aporte e um saldo final correto;
- nenhuma fixture persistente ao final.

Atualizar apenas as contagens de ACL esperadas nos testes 2B/2C/2D existentes, quando necessário. Não alterar comportamentos das fases anteriores.

## Validação obrigatória

- recriar/aplicar todas as migrations somente no Supabase local;
- executar todos os testes SQL diretamente com PostgreSQL e `ON_ERROR_STOP`, preservando `ROLLBACK`;
- executar a suíte JavaScript e os testes de concorrência;
- rodar `supabase db lint --local --level error`;
- lint dos arquivos alterados, `npm run build` e `git diff --check`;
- confirmar que produção não foi acessada nem alterada.

## Fora de escopo nesta etapa

- nenhum botão, modal ou wrapper de UI;
- nenhuma migração, SQL Editor, `db push`, `migration repair`, backup ou dado em produção;
- nenhum aporte que transfira dinheiro entre contas;
- nenhum ajuste manual, exclusão, edição ou estorno de aporte.

Após auditoria e deploy futuro, a UI apresentará um botão **Adicionar reserva** no card do envelope, com `CurrencyInput`, confirmação e extrato. Movimentação física para uma poupança/cofre bancário continuará sendo uma transferência bancária separada.

## Relatório final

Entregar `Relatório /financeiro-implantar-aporte-avulso-envelopes-2d-1` com migration, assinatura/ACL da RPC, semântica de disponibilidade, evidência de idempotência/concorrência, testes, arquivos alterados e confirmação de que nada remoto foi modificado. Não criar commit; aguardar auditoria humana.
