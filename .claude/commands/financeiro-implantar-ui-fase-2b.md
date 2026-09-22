---
description: "Implementa localmente as telas demonstrativas da Fase 2B financeira, usando o design system aprovado e sem conectar ao banco."
---

# /financeiro-implantar-ui-fase-2b

## Objetivo

Criar a primeira versão visual e navegável do Financeiro para aprovação em
localhost. As telas devem usar apenas dados de demonstração claramente
identificados; não podem chamar Supabase, RPCs nem qualquer tabela.

## Fundamentos obrigatórios

- Leia integralmente `docs/design-system/DESIGN-SYSTEM.md` antes de editar.
- Reutilize apenas os primitivos em `src/components/ui/`, especialmente
  `DataTable`, `Tabs`, `PeriodSelector`, `FinancialChart`, `Card`, `Badge`,
  `Button`, `Modal`, `EmptyState` e `Spinner`.
- Sem hex literal, cor Tailwind padrão, valor arbitrário, sombra fora de modal,
  gradiente fora de botão primário, `rounded-lg` ou componente inline que
  replique primitivo existente.
- Não instale dependências.
- Não toque em migrations, RPCs, `src/lib/financeiro`, Supabase remoto ou dados
  reais.

## Correção de rotas protegidas

O `ProtectedRoute` foi projetado para renderizar `Outlet`. Corrija em
`src/App.jsx` a composição das rotas para que ele seja usado como rota-pai e
`AdminLayout` como rota filha, mantendo a proteção de sessão sem duplicar
layout. Não substitua a autenticação por mock e não altere a lógica de sessão.

As rotas administrativas financeiras devem ser:

- `/admin/financeiro` — Visão financeira;
- `/admin/financeiro/titulos` — Contas;
- `/admin/financeiro/cadastros` — Cadastros.

Remova os placeholders financeiros antigos. Preserve as rotas não financeiras.

## Navegação e layout

Atualize exclusivamente a seção Financeiro de `AdminLayout` para:

- “Visão financeira”;
- “Contas”;
- “Cadastros”.

Corrija, nessa área do layout, classes incompatíveis com o design system
aprovado (tokens inexistentes, raio e tamanhos de ícone). Use `lucide-react`
com `strokeWidth={1.75}` e tamanhos permitidos. O item ativo deve ser
compreensível sem depender apenas de cor. Não faça uma migração ampla do
dashboard ou de seções fora do Financeiro.

## Páginas demonstrativas

Crie as páginas sob um diretório coerente, por exemplo
`src/pages/financeiro/`. Centralize os dados demonstrativos em um módulo local
explícito, por exemplo `src/pages/financeiro/demoData.js`, com aviso visível:
“Dados de demonstração — nenhuma informação real está sendo exibida.”

### 1. Visão financeira

Rota: `/admin/financeiro`

Inclua:

- título “Visão financeira”, texto explicativo e aviso de demonstração;
- `PeriodSelector` controlado, inicialmente em “Mês”; o botão “Aplicar
  período” é a única ação primária da página e atualiza apenas o rótulo/estado
  demonstrativo;
- quatro cards: saldo em contas, entradas, saídas e resultado; moeda BRL e
  números tabulares;
- saldo por conta em tabela semântica;
- `FinancialChart` com uma série curta e alternativa tabular herdada do
  primitivo;
- tabela de até 10 próximos vencimentos, com tipo e estado em texto/badge;
- estados localmente demonstráveis de carregamento, vazio e erro recuperável,
  sem fingir que existe consulta real.

Em celular, os cards devem ficar em coluna e as tabelas devem rolar
horizontalmente dentro do próprio contêiner.

### 2. Contas

Rota: `/admin/financeiro/titulos`

Inclua:

- título “Contas”, aviso de demonstração e `PeriodSelector`;
- `Tabs` controladas: “A pagar” e “A receber”, com navegação por teclado;
- filtros locais de status e ordenação, com labels associados;
- `DataTable` com: descrição, categoria, contraparte, vencimento/previsão,
  valor, status e ação;
- ações contextuais “Pagar” ou “Receber” somente em título demonstrativo
  elegível. Elas abrem `Modal` de confirmação acessível;
- o modal deve mostrar título, valor, conta demonstrativa, data e o efeito da
  operação. Ao confirmar, não chame RPC, não altere dados e mostre feedback
  claro de que a integração real ocorrerá depois da aprovação visual;
- inclua estados loading, vazio, erro e sem permissão, todos explicitamente
  demonstrativos.

Não use `window.confirm`, `alert` ou botões de criar/editar.

### 3. Cadastros

Rota: `/admin/financeiro/cadastros`

Inclua:

- título “Cadastros financeiros”, aviso de demonstração;
- `Tabs`: “Contas bancárias” e “Categorias”;
- tabelas somente de leitura. Para contas: nome, instituição, tipo, saldo
  inicial e indicação textual/badge de conta principal. Para categorias: nome,
  tipo e grupo DRE;
- estados loading, vazio, erro e sem permissão demonstrativos;
- nenhum botão falso de criação, edição, ativação ou desativação.

## Acessibilidade e experiência

- Toda ação de ícone deve ter `aria-label`; ícone decorativo deve ser oculto
  para leitores de tela.
- Use labels reais em campos e foco visível em todos os controles.
- Cor nunca pode ser o único significado; badges e mensagens devem ter texto.
- Não use animação essencial; respeite a regra global de movimento reduzido.
- Preserve largura móvel sem overflow da página; apenas tabelas podem ter
  rolagem horizontal interna.
- Não renderize dados financeiros na condição de acesso negado.

## Teste e aprovação visual

1. Rode lint apenas dos arquivos alterados, `git diff --check` e build de
   produção. Relate problemas preexistentes fora do escopo separadamente.
2. Inicie o servidor local e confirme resposta HTTP 200 nas três rotas.
3. Faça inspeção desktop e móvel, incluindo:
   - rolagem de tabela em largura estreita;
   - Tabs com Tab, setas, Home e End;
   - modal com Escape, clique no overlay, foco preso e foco devolvido;
   - ausência de erro de console;
   - todos os avisos de demonstração visíveis.
4. Não conecte as telas às RPCs reais. Pare ao concluir a vitrine local para
   aprovação humana explícita.

## Relatório

```
## Relatório /financeiro-implantar-ui-fase-2b

### Telas e rotas
[arquivos, rotas e navegação]

### Design system e acessibilidade
[primitivos, tokens e interações verificadas]

### Dados e segurança
[dados demonstrativos; nenhuma chamada ao banco]

### Verificação local
[lint, build, URLs, desktop/móvel e console]

### Aguardando aprovação visual
[o que revisar em localhost]
```
