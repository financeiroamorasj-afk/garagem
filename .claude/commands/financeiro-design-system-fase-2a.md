---
description: "Cria e apresenta no localhost os primitivos visuais financeiros aprováveis, sem rotas de negócio ou acesso ao banco."
---

# /financeiro-design-system-fase-2a

## Objetivo

Criar somente os primitivos visuais que faltam para o módulo financeiro e
exibi-los na rota `/design-system` para revisão humana em `localhost`. Esta é
uma fase de design system, não de implementação do financeiro: não criar rotas
financeiras, chamadas Supabase, migrations, dados mockados no domínio nem
alterar componentes operacionais existentes.

## Parte 0 — Fonte de verdade visual

Antes de editar, leia integralmente:

- `docs/design-system/DESIGN-SYSTEM.md`;
- `src/index.css`;
- `src/pages/DesignSystem.jsx`;
- todos os componentes em `src/components/ui/`.

Siga estritamente tokens, tipografia, raios, espaçamentos e contrastes já
aprovados. Não use hex, cores padrão do Tailwind, sombras em elementos
estáticos, gradientes fora de botão primário/logo, valores arbitrários ou uma
nova dependência de gráficos.

## Parte 1 — Primitivos a criar

Crie em `src/components/ui/`, com APIs pequenas e documentação por JSDoc ou
comentário de exportação. Reutilize `Button`, `Input`, `Card`, `Badge`,
`Spinner` e `EmptyState` sempre que aplicável.

### 1. DataTable

- Tabela semântica (`table`, `thead`, `tbody`, `th scope="col"`) com suporte a
  cabeçalho, linhas, alinhamento numérico e ação por linha.
- Cabeçalho usa `text-label`; dinheiro, porcentagens, quantidades e datas usam
  `text-data`; conteúdo padrão usa `text-body`/`text-body-sm`.
- Superfície `surface-1`, borda `line`, sem sombra; rolagem horizontal em telas
  pequenas, sem cortar colunas silenciosamente.
- Estados de carregamento e vazio usam os primitivos existentes, sem depender
  apenas de cor para informação.
- Linhas interativas precisam de foco visível, alvo de clique adequado e
  ativação por teclado; linha decorativa não deve fingir ser botão.

### 2. Tabs

- Implementar o padrão ARIA completo: `role="tablist"`, `role="tab"`,
  `aria-selected`, `aria-controls`, `tabpanel`, setas direcionais e Home/End.
- O estado ativo usa texto/indicador além da cor; não usar rounded grandes ou
  pill. Deve funcionar por teclado e ter foco visível.
- API deve permitir que uma futura tela financeira controle a aba ativa sem
  duplicar lógica de acessibilidade.

### 3. PeriodSelector

- Controlado por props e preparado para períodos: hoje, semana, mês, trimestre,
  personalizado; não calcular nem consultar dados financeiros nesta fase.
- Ação principal usa `Button`; range customizado deve usar inputs nativos com
  labels associados ou o primitivo `Input`.
- Datas são apresentadas em português do Brasil. Não implemente calendário
  complexo nem instale biblioteca sem aprovação prévia.

### 4. CurrencyInput

- Campo controlável que recebe e devolve valor de domínio de forma explícita;
  preserve acessibilidade de label, mensagem de ajuda/erro e `aria-invalid`.
- Reutilize o acabamento de `Input`; não use máscara que altere valor ao digitar
  de forma surpreendente. A conversão monetária deve ser compatível com
  `src/lib/financeiro/moeda.js`, sem duplicar regra de cálculo.
- Exibir o prefixo `R$` como texto de apoio, não como único rótulo do campo.

### 5. FinancialChart

- Um componente de visualização leve, sem biblioteca nova: SVG ou HTML/CSS
  semântico e responsivo dentro de `Card`.
- Deve ter título, resumo textual dos dados, legenda com texto e alternativa
  em tabela/resumo para leitores de tela. Não codifique dados reais nem crie
  uma DRE nesta etapa.
- Estados positivo, atenção e negativo usam também texto/ícone; nunca apenas
  cor. Respeite `prefers-reduced-motion` e não tenha animação obrigatória.

## Parte 2 — Vitrine de revisão

Atualize apenas `src/pages/DesignSystem.jsx` para adicionar uma seção
"Financeiro" abaixo dos primitivos existentes. A vitrine deve apresentar:

- DataTable com poucos lançamentos fictícios claramente identificados como
  demonstração visual;
- Tabs navegáveis por teclado;
- PeriodSelector em estado padrão e personalizado;
- CurrencyInput normal, com ajuda e com erro;
- FinancialChart com dados de demonstração e alternativa textual.

Inclua uma breve legenda na página: "Componentes em revisão — não conectados ao
banco". Não edite `App.jsx` nem crie rota financeira.

## Parte 3 — Verificação técnica e visual

1. Execute testes, lint dos arquivos alterados e build. Diferencie qualquer
   problema preexistente de problema introduzido.
2. Inicie o servidor local com `npm run dev` e informe a URL exata. Mantenha-o
   disponível para a revisão, sem expor em rede pública.
3. Revise em desktop e largura móvel: navegação por Tab/teclado, foco,
   contraste, overflow da tabela, modo reduzido de movimento e ausência de
   erros no console.
4. Não faça commit nem avance para tela financeira enquanto não houver
   aprovação humana explícita da vitrine em `/design-system`.

## Critérios de aceite

- Os cinco primitivos aparecem e funcionam em `/design-system`.
- Nenhum valor visual viola o design system aprovado.
- Acessibilidade de tabela, abas, período e campo monetário foi verificada.
- Nenhuma migration, RPC, chamada Supabase, rota financeira ou lógica de
  domínio foi adicionada.
- Servidor local disponível para revisão visual.

## Formato do relatório

```
## Relatório /financeiro-design-system-fase-2a

### Primitivos criados
[arquivo e API curta]

### Revisão de design system e acessibilidade
[tokens/primitivos usados, teclado, contraste, responsividade]

### Validação
[testes, lint, build e URL localhost]

### Aguardando aprovação visual
[o que Rafa deve revisar na rota /design-system]
```
