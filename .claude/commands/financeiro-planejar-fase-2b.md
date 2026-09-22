---
description: "Especifica a Fase 2B do financeiro, revisando design system, rotas e contrato seguro de dados antes de criar telas operacionais."
---

# /financeiro-planejar-fase-2b

## Objetivo

Definir o escopo aprovado para as primeiras telas operacionais do Financeiro
da barbearia, sem alterar UI, rotas, migrations, RPCs ou dados de produção.

## Fundamentos já aprovados

- O design system em `docs/design-system/DESIGN-SYSTEM.md` é obrigatório.
- A Fase 1.1 financeira está publicada: RLS ativo, tabelas sem acesso direto
  pelo browser e RPCs privilegiadas fechadas para `anon` e `PUBLIC`.
- Leituras atualmente liberadas ao admin: `financeiro_listar_categorias()` e
  `financeiro_listar_contas_bancarias()`.
- Operações já liberadas ao admin: pagar, receber, transferir e movimentar
  crédito, sempre por RPC idempotente.

## Limite de segurança

Não sugira consulta direta pelo frontend às tabelas `financeiro_*` e não use
`service_role` no cliente. Para toda informação ainda indisponível, descreva
uma RPC de leitura mínima, com escopo por `barbearia_id` validado no banco e
`EXECUTE` somente para `authenticated`.

## Parte 1 — Revisão de arquitetura existente

Mapeie, sem mudar arquivos:

1. Rotas protegidas, `AdminLayout`, navegação financeira existente e seus
   placeholders.
2. Primitivos em `src/components/ui/`, incluindo os aprovados na Fase 2A:
   `DataTable`, `Tabs`, `PeriodSelector`, `CurrencyInput` e `FinancialChart`.
3. Cliente `src/lib/financeiro/`, contratos de RPC e helpers de período/moeda.
4. Quais dados são realmente retornados pelas seis RPCs liberadas hoje.
5. Quais dados essenciais não podem ser obtidos com segurança para cada tela.

## Parte 2 — Proposta funcional da Fase 2B

Monte uma proposta em três entregas pequenas, com ordem e dependências:

1. **Visão financeira:** saldo por conta, entradas, saídas, resultado do
   período e próximos vencimentos. Deve iniciar em estado vazio adequado se
   não houver lançamentos.
2. **Contas a pagar e a receber:** abas, filtros de período/status, tabela
   acessível e ações contextuais de pagar/receber com confirmação e chave de
   idempotência gerada no cliente. Não exibir ações para usuário sem papel
   administrativo.
3. **Cadastros financeiros:** contas bancárias e categorias; decidir
   explicitamente se entra nesta fase apenas a visualização ou também criação
   e edição, pois escrita exige RPCs novas e auditáveis.

Para cada entrega, informe:

- resultado para o dono da barbearia;
- rota proposta sob `/admin/financeiro`;
- dados/RPCs necessários e os já existentes;
- estados loading, vazio, erro e sem permissão;
- ações irreversíveis ou que exigem confirmação;
- critérios de aceite visual, responsividade e acessibilidade.

## Parte 3 — Contrato mínimo de backend a aprovar

Liste apenas as RPCs estritamente necessárias, com assinatura proposta e
resposta resumida. Priorize:

- uma RPC de resumo por período;
- uma RPC paginada de listagem de contas a pagar/receber;
- uma RPC de detalhe quando indispensável;
- RPCs de criação/edição de categorias e contas bancárias somente se os
  cadastros fizerem parte do escopo aprovado.

Cada RPC proposta deve:

- usar `SECURITY DEFINER` e `search_path` fixo;
- chamar `financeiro_assert_admin()`;
- validar intervalo de datas, paginação e ordenação com allowlist;
- retornar somente dados da barbearia do usuário;
- ter `REVOKE` de `PUBLIC`/`anon` e `GRANT EXECUTE` seletivo a
  `authenticated`;
- não expor audit log, dados de outras barbearias nem campos desnecessários.

Não escreva migration nesta fase: apresente primeiro o contrato para aprovação.

## Parte 4 — Design system e aprovação visual

Verifique cada tela contra o design system:

- tokens, tipografia, espaçamentos, bordas e estados semânticos;
- uma única ação primária por tela;
- tabela semântica e rolável horizontalmente no celular;
- valores monetários em fonte/tabulação de dados;
- gráficos acompanhados de legenda e alternativa tabular;
- foco visível, teclado, ARIA, contraste e `prefers-reduced-motion`.

Planeje uma implementação posterior somente com dados de demonstração
identificados como tal, servida em localhost para aprovação visual. A ligação
com RPCs reais só pode ocorrer após a aprovação da migration de contrato.

## Formato do relatório

```
## Relatório /financeiro-planejar-fase-2b

### Estado confirmado
[rotas, primitives e dados já disponíveis]

### Lacunas de dados e segurança
[por tela]

### Entregas propostas
[três entregas, rota, ações e critérios]

### Contrato de backend para aprovação
[RPCs mínimas, sem migration]

### Fluxo de aprovação
[contrato → migration/testes → UI localhost → aprovação visual → integração]

### Decisões necessárias
[somente escolhas que dependem do dono]
```
