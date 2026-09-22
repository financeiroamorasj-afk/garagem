---
description: "Corrige navegação administrativa, gráfico vazio e rolagem da Fase 2B, sem banco nem cadastros operacionais."
---

# /financeiro-corrigir-ui-navegacao-fase-2b

## Objetivo

Corrigir os problemas aprovados na revisão visual:

- Dashboard não pode abrir menus internos de equipe, serviços, estoque ou
  configurações;
- links “Barbeiros” e “Configurações” não podem redirecionar ao dashboard;
- “Resultado diário” não pode desenhar barras de R$ 0,00 nem causar overflow;
- a barra de rolagem deve pertencer visualmente ao design system;
- cadastros financeiros permanecem somente leitura até a fase de RPCs de
  escrita aprovada.

Não criar migrations, RPCs, formulários de cadastro, dados de demonstração,
operações financeiras ou alterações em produção.

## Design system — regra para scrollbar

O design system ainda não descreve scrollbar. Registre antes de implementar
uma pequena adição no documento, usando apenas tokens existentes:

- espessura 8px;
- track em `surface-0`;
- thumb em `line-strong`, com `border: 2px solid surface-0` para manter a
  separação flat;
- hover/focus do thumb em `copper`;
- em Firefox, `scrollbar-color` equivalente;
- nunca usar sombra, gradiente ou raio em pílula.

Essa regra vale para rolagem vertical geral e contêineres com rolagem interna.
Não aplique scrollbar horizontal à página. Preserve a rolagem horizontal
somente dentro de tabelas e, quando necessária, dentro do gráfico.

## 1. Dashboard

Revise `AdminDashboard.jsx` e sua rota. O Dashboard deve exibir somente a
visão geral administrativa; remova a navegação interna que alterna
“Equipe & payouts”, “Serviços”, “Estoque & produtos” e “Configurações”, bem
como qualquer conteúdo condicionado por essas abas.

Não descarte ou migre funcionalidades para outro lugar nesta etapa: apenas
pare de expor os menus internos no Dashboard. Preserve as ações da visão geral
que já funcionam e não introduza botões falsos.

## 2. Rotas administrativas sem destino

Crie rotas protegidas reais para:

- `/admin/barbeiros`;
- `/admin/configuracoes`.

Elas devem exibir uma página neutra de módulo em preparação, usando
`EmptyState`, título claro e sem ação primária. Não podem redirecionar ao
Dashboard, revelar conteúdo financeiro ou simular funcionalidades ainda não
construídas.

Mantenha os links correspondentes no `AdminLayout` apontando para essas rotas.
Confirme que o link Dashboard continua exclusivamente em `/admin/dashboard`.

## 3. Visão financeira sem movimentações

Em `FinanceOverview.jsx`:

- trate série inteiramente zerada como estado vazio financeiro, mesmo que a
  RPC retorne os dias do período;
- nesse caso, não renderize barras, rótulos repetidos de R$ 0,00 nem legenda;
- mostre um `Card`/`EmptyState` acessível com “Sem movimentações no período” e
  explicação curta;
- quando houver movimentos, mantenha `FinancialChart`, mas proteja seu corpo
  em contêiner com rolagem horizontal própria para períodos longos, sem causar
  overflow no `body` ou cortar conteúdo fora do card;
- a alternativa tabular acessível do gráfico deve continuar disponível.

## 4. Cadastros financeiros

Mantenha a tela sem botões de criar/editar. Ajuste a mensagem de estado vazio
para informar claramente que contas e categorias poderão ser cadastradas após
a próxima etapa segura — sem sugerir que existe um botão indisponível.

## Acessibilidade e responsividade

- Use somente tokens e primitivos aprovados; não introduza hex ou classes de
  paleta padrão.
- Títulos de página e estados vazios devem ter hierarquia semântica.
- Preserve foco visível e labels; links de navegação ativos devem ter texto e
  borda/estado além de cor.
- Em largura móvel, não pode haver rolagem horizontal do documento. Teste em
  pelo menos 360px; apenas tabela/gráfico podem rolar internamente.
- Não altere a autenticação ou o controle por papel real implantado na etapa
  anterior.

## Verificação

1. Rode lint apenas dos arquivos alterados, testes existentes, build e
   `git diff --check`.
2. Suba localhost e confirme HTTP 200 para Dashboard, Barbeiros,
   Configurações e as três rotas financeiras.
3. Valide manualmente desktop e 360px:
   - Dashboard sem menus internos de equipe/serviços/estoque/configurações;
   - Barbeiros e Configurações não redirecionam ao Dashboard;
   - resultado diário vazio não cria overflow;
   - gráfico com dados não sai do card;
   - scrollbar segue a nova regra;
   - console sem erros.
4. Não faça commit. Pare aguardando aprovação visual humana.

## Relatório

```
## Relatório /financeiro-corrigir-ui-navegacao-fase-2b

### Correções
[dashboard, rotas, gráfico, scrollbar e estados vazios]

### Design system
[adição documentada e tokens usados]

### Verificação local
[testes, build, URLs e desktop/móvel]

### Fora do escopo
[sem banco, RPCs, cadastros operacionais ou produção]

### Aguardando aprovação visual
[itens para o Rafa validar]
```
