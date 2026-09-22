---
description: "Especifica o contrato seguro dos envelopes Modelo B para o Garagem System, sem escrever migration ou alterar dados."
---

# /financeiro-planejar-contrato-envelopes-fase-2d

## Objetivo

Produzir a especificação técnica final para adaptar os envelopes do Rebip/Amora ao Garagem System, usando o **Modelo B**: envelope é saldo lógico persistido e auditável, não conta bancária.

Esta etapa é somente leitura e especificação. Não criar arquivos de aplicação, migrations, testes, commits, dados locais/remotos, backups ou deploys.

## Referência obrigatória

Use `docs/financeiro/REFERENCIA-ENVELOPES-REBIP.md` como referência de produto. Ele preserva o relatório aprovado `/financeiro-ler-envelopes-rebip`; não exija que o repositório Rebip esteja aberto nesta execução.

- distribuição percentual de lucro para envelopes;
- aporte/distribuição como movimentação financeira real conforme a regra definida;
- resgate interno de envelope para título a pagar sem criar uma segunda saída bancária;
- transações próprias de envelope com rastreabilidade.

Não portar defeitos conhecidos da Amora: prevenção de saldo apenas na aplicação, ausência de idempotência, autenticação inconsistente, duplicidade de cálculo BRT, uso de colunas legadas e regra de 100% apenas visual.

## Leitura obrigatória no Garagem

Inspecionar, sem escrita:

- migrations financeiras até `20260825120000`;
- funções de pagar, receber, transferir, resumo e títulos;
- `financeiro_movimentacoes`, contas a pagar/receber, contas bancárias, categorias, audit log e idempotência;
- helpers de moeda e período BRT;
- ACLs, RLS, FKs compostas e padrão de locks das Fases 2B e 2C;
- tela `FinanceTitles.jsx` e design system apenas para antecipar dependências, sem criar UI.

## Contrato a especificar

### A. Cadastro de envelopes

Definir o schema aditivo mínimo para envelopes lógicos:

- identificação, `barbearia_id`, nome normalizado, finalidade e ativo;
- percentual de distribuição e/ou regra explícita equivalente;
- saldo acumulado persistido com `CHECK (saldo_acumulado >= 0)`;
- versão `updated_at`, timestamps, PK e chave candidata `(barbearia_id, id)`;
- índices, RLS, zero grants diretos e FK composta em toda referência entre tenants.

Informar se o percentual deve somar exatamente 100%, até 100% ou se existe envelope sem percentual. A recomendação deve levar em conta o fluxo real da Amora e a operação de uma barbearia.

### B. Razão de envelopes

Definir uma tabela imutável de transações com:

- envelope, barbearia, tipo (`distribuicao`/`aporte`, `resgate`, `ajuste`, `estorno` se necessário);
- valor estritamente positivo, direção econômica, saldo anterior/depois;
- correlação/idempotência, usuário e data BRT;
- vínculo opcional e exclusivo com título/manual ou movimentação que explique a origem;
- constraints/FKs compostas e unicidade que impeçam dupla aplicação;
- audit log complementar, sem dados sensíveis no browser.

O saldo deverá ser atualizado exclusivamente pela RPC transacional que escreve o razão, usando `FOR UPDATE` ou lock equivalente. Não aceitar cálculo ou saldo enviado pelo frontend.

### C. Lucro distribuível e BRT

Não assumir a fórmula da Amora, pois seu lucro diário depende de CPV e consignação, que não existem na barbearia.

Propor pelo menos duas fórmulas aplicáveis ao ledger real do Garagem, distinguindo com precisão:

- recebimentos brutos, taxas e entradas líquidas;
- pagamentos de despesas;
- transferências internas;
- créditos de clientes;
- títulos previstos/pendentes versus efetivamente liquidados;
- competência versus caixa;
- timezone `America/Sao_Paulo`.

Indicar uma recomendação provisória, mas marcar a fórmula como **decisão humana obrigatória** antes da migration. A distribuição não pode ser implementada sem a fórmula aprovada.

### D. Fluxos transacionais

Especificar pré/pós-condições e efeito no ledger para:

1. criar, editar, ativar e desativar envelope;
2. distribuir lucro/aportar por percentual;
3. aporte manual, se fizer sentido;
4. resgatar um envelope para uma conta a pagar pendente;
5. estornar distribuição ou resgate;
6. impedir resgate acima do saldo e corrida entre dois resgates;
7. comportamento se o título for cancelado, pago ou estornado.

Nunca permitir que resgate gere uma segunda saída bancária além da liquidação do título. Explicar como essa garantia será imposta no banco.

### E. RPCs e ACL

Listar assinaturas, entradas, resposta e erros estáveis das RPCs propostas. Todas devem:

- derivar a barbearia por `financeiro_assert_admin()`;
- usar `SECURITY DEFINER` e `search_path` fixo;
- validar papel, estado, origem, valores, tenant e versões;
- revogar `PUBLIC`, `anon` e `authenticated` antes de conceder somente as RPCs públicas a `authenticated`;
- manter helpers internos fechados;
- usar idempotência com hash de payload em toda operação de criação/movimento;
- usar lock por envelope e/ou título para concorrência.

### F. Testes e UX futura

Definir testes SQL locais para ACL, RLS, idempotência, saldo, corrida de resgates, tenant cruzado, dupla contagem, BRT e estorno. Definir também os estados visuais futuros, sem criar UI ainda.

## Relatório obrigatório

Entregar `Relatório /financeiro-planejar-contrato-envelopes-fase-2d` contendo:

1. modelo de dados e relações propostos;
2. fórmula(s) de lucro distribuível e decisão humana pendente;
3. regras de percentual, saldo e resgate;
4. fluxos de movimentação sem dupla contagem;
5. RPCs, ACLs, erros e concorrência;
6. compatibilidade com dados/títulos atuais;
7. matriz de riscos e testes locais;
8. quais decisões precisam de aprovação antes de uma migration;
9. confirmação de que nenhuma mudança foi feita.

## Encerramento obrigatório

Pare após o relatório. Não crie migration enquanto a fórmula de lucro distribuível e a regra percentual não receberem aprovação humana explícita.
