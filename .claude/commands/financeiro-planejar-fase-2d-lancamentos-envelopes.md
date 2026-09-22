---
description: "Planeja e inicia a Fase 2D do Financeiro: lançamentos a pagar/receber e envelopes, com checkpoints obrigatórios de segurança."
---

# /financeiro-planejar-fase-2d-lancamentos-envelopes

## Objetivo

Preparar a próxima evolução do módulo Financeiro do Garagem System: permitir que o administrador registre e administre lançamentos de contas a pagar e receber e adapte com fidelidade os **envelopes financeiros da Amora** ao contexto de uma barbearia.

Não aplicar migrations, não alterar produção, não criar dados reais, não fazer `db push`, não modificar `schema_migrations`, não fazer commit nem push nesta etapa.

## Premissas confirmadas

- A Fase 2C está publicada e auditada em produção.
- A UI de cadastros foi integrada e versionada no commit `706a69c`.
- Tabelas financeiras não possuem acesso direto do browser; toda ação deve continuar através de RPCs controladas.
- `authenticated` não pode receber permissões amplas; `anon` e `PUBLIC` devem permanecer sem `EXECUTE` financeiro.
- Todo design deve respeitar `docs/design-system/DESIGN-SYSTEM.md` antes de criar UI.

## Entregável desta etapa: decisão de produto e contrato proposto

### 1. Diagnóstico somente leitura

Antes de propor schema ou telas, inspecionar:

- migrations e RPCs financeiras já publicadas;
- estruturas de `financeiro_contas_pagar`, `financeiro_contas_receber`, `financeiro_movimentacoes`, contas bancárias e categorias;
- UI existente em `src/pages/financeiro/FinanceTitles.jsx` e `FinanceOverview.jsx`;
- primitivos e regras do design system;
- padrões de idempotência, auditoria, concorrência e ACL das Fases 2B/2C.
- o módulo financeiro real do `amora-avalia-v2`, em especial tabelas `envelopes` e `envelopes_transacoes`, `PainelEnvelopes.js` e a lógica que apura lucro diário no fuso BRT.

Localizar o repositório da Amora antes de continuar. Se ele não estiver acessível, parar e solicitar o caminho; não inferir o comportamento dos envelopes a partir de padrões genéricos. Não usar SQL Editor e não fazer escrita local ou remota nesta etapa.

### 2. Proposta de lançamentos

Definir, com base no schema real, o contrato mínimo para cada título:

- tipo: `pagar` ou `receber`;
- descrição e contraparte;
- valor total, vencimento e competência;
- categoria financeira compatível com o tipo;
- conta bancária de liquidação, quando a regra exigir;
- status inicial e transições permitidas;
- edição, cancelamento e liquidação já existentes;
- vínculo opcional com envelope;
- chave de idempotência por intenção de criação;
- controle otimista por `updated_at`, se o schema suportar;
- auditoria antes/depois e isolamento por `barbearia_id` derivado no banco.

Não duplicar a liquidação que já é responsabilidade das RPCs `financeiro_pagar_conta` e `financeiro_receber_conta`.

### 3. Proposta de envelopes — experiência Amora

A referência esperada da Amora é:

- envelopes representam a **distribuição percentual do lucro** entre finalidades como reserva, reinvestimento e sócios;
- o lucro diário é calculado no fuso BRT a partir do ledger, sem dupla contagem;
- aporte e resgate em um envelope são registrados como **par de movimentações** ligadas, preservando a rastreabilidade e o resultado financeiro;
- envelopes e suas transações não são contas bancárias paralelas nem podem permitir dinheiro fictício.

Antes de desenhar o Garagem System, confirmar no código/schema da Amora: nomenclatura, colunas, status, cálculo exato de lucro, fluxo de aporte/resgate, reversão, auditoria e comportamento da interface. Distinguir o que é específico de consignação do que é portável à barbearia.

Com essa evidência, propor a adaptação mínima para a barbearia, incluindo:

- percentuais por envelope e sua regra de soma/validação;
- apuração de lucro e período BRT;
- aportes, resgates e seus pares idempotentes de movimentações;
- saldo de cada envelope calculado ou persistido com razão auditável;
- proteção contra retirada maior que o saldo do envelope;
- relação com conta bancária e com o ledger existente;
- criação, edição, ativação/desativação e conflito de versão;
- sem acesso direto do browser às tabelas.

Não substituir essa experiência por "orçamento mensal" sem uma aprovação humana explícita para mudar o produto de referência.

### 4. Segurança e dados

Documentar explicitamente:

- novas tabelas, índices e constraints necessários;
- FKs compostas por `(barbearia_id, id)`;
- validações de valor, datas, status, categoria/tipo e conta ativa;
- quais RPCs públicas novas serão aprovadas para `authenticated`;
- que helpers internos, `anon` e `PUBLIC` continuarão sem execução;
- ausência de grants diretos em tabelas financeiras;
- estratégia de idempotência, locks e concorrência;
- quais relatórios são leitura calculada e quais são persistidos.

Também identificar riscos de migração, compatibilidade com títulos existentes e necessidade de backfill. Não presumir que os dados atuais de produção estão completos.

### 5. Design system e UX

Criar apenas uma especificação visual — nenhuma UI ainda:

- onde ficará o botão "Novo lançamento" na tela Contas;
- fluxo de formulário para pagar e receber;
- como categorias, contas e envelopes serão selecionados;
- como serão comunicados status, vencido, cancelado, erro, conflito e idempotência;
- nova área/aba de envelopes, distribuição percentual do lucro, saldo por envelope, aporte e resgate;
- estados vazio, loading, erro, sem conta e sem categoria;
- layout desktop e 360 px;
- uso exclusivo de componentes/tokens existentes ou novos primitivos aprovados primeiro na vitrine `/design-system`.

Não usar dados simulados como se fossem dados reais e não adicionar dependências sem justificar.

## Relatório exigido

Entregar `Relatório /financeiro-planejar-fase-2d-lancamentos-envelopes` com:

1. estado real encontrado e arquivos consultados;
2. regras propostas para títulos;
3. comparação e recomendação para envelopes;
4. contrato de banco/RPCs/ACLs proposto;
5. UX e impacto no design system;
6. matriz de riscos e validações locais necessárias;
7. plano dividido nos checkpoints abaixo.

## Checkpoints obrigatórios subsequentes

Após este relatório, parar e aguardar aprovação humana antes de cada uma destas etapas:

1. criar e testar localmente a migration/contrato;
2. revisar o contrato e criar commit exclusivo;
3. criar backup lógico novo, executar pré-verificação e `db push --dry-run`;
4. aplicar a migration em produção somente após autorização explícita;
5. auditar produção em modo somente leitura;
6. integrar a UI em localhost e aguardar aprovação visual;
7. criar commit exclusivo da UI; o deploy do frontend seguirá o fluxo próprio do projeto.
