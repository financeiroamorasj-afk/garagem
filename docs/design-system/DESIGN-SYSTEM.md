# Design System — Garagem System

> **Status:** aprovado · **Versão:** 1.1 · **Data:** 2026-08-10
> **Mudança na 1.1:** nomes de token de texto e de fundo semântico ajustados para evitar colisão de utilitário no Tailwind v4 (`text-primary`→`warm-white`, `text-secondary`→`steel`, `text-accent` removido em favor de `text-copper`, `-bg` removido em favor do modificador `/12`). Valores e usos não mudaram, só os nomes. Revisado durante o dry-run do `/ds-fundacao`, antes de qualquer implementação.
> **Origem:** valores extraídos de `docs/design-system/AUDITORIA-LANDING.md`. Nada aqui é invenção — cada cor, fonte, raio e curva vem do CSS da landing page, exceto o que está marcado como `[derivado]`.

Este documento é a **lei**. Os comandos `/ds-fundacao` e `/ds-migrar` implementam exatamente o que está escrito aqui e nada além. Se algo necessário não estiver especificado, o comando **para e pergunta** — não improvisa.

---

## 0. Princípios

1. **A landing define a marca. O sistema define a ergonomia.** Cor e tipografia vêm da landing sem negociação. Densidade, contraste, tamanho de alvo de clique e estados de interação são resolvidos pela necessidade de uso prolongado.
2. **Flat por padrão.** A landing não tem uma única `box-shadow`. Profundidade vem de borda de 1px e de mudança de superfície. A única exceção autorizada é overlay (seção 7).
3. **Todo valor é token.** Nenhum hex literal, nenhuma classe de paleta padrão do Tailwind, nenhum valor arbitrário em componente.
4. **Contraste é requisito, não preferência.** WCAG AA é o piso: 4.5:1 para texto abaixo de 18px, 3:1 para texto grande e para bordas de controle.

### Mudança de tom esperada

Adotar os hex da landing altera o valor de três tokens já existentes no sistema. Os **nomes permanecem**, então nenhuma classe precisa ser reescrita, mas a aparência muda no primeiro build:

| Token | Antes | Depois |
|---|---|---|
| `copper` | `#b87333` | `#c1793f` |
| `gold-aged` | `#c5b358` | `#a68a52` |
| `industrial-dark` | `#121212` | `#050505` |

Isso é intencional e é o ponto central desta versão.

---

## 1. Cores

### 1.1 Superfícies

| Token | Valor | Uso | Origem |
|---|---|---|---|
| `--color-surface-0` | `#050505` | Fundo da aplicação | landing `--black` |
| `--color-surface-1` | `#0e0d0c` | Card, painel, sidebar, header | landing `--graphite` |
| `--color-surface-2` | `#17150f` | Input, hover de linha, superfície elevada em fluxo | landing `--graphite-2` |
| `--color-surface-3` | `#221e17` | Modal, dropdown, popover, toast | `[derivado]` — continuação da rampa |

A diferença entre `surface-0` e `surface-1` é de ~2% de luminosidade. Isso é deliberado: a separação é lida pela borda, não pelo salto de cor.

### 1.2 Marca

| Token | Valor | Uso | Origem |
|---|---|---|---|
| `--color-copper` | `#c1793f` | Destaque primário, ação principal, foco, ícone ativo | landing `--copper` |
| `--color-copper-light` | `#d08f56` | Hover de cobre | `[derivado]` |
| `--color-gold-aged` | `#a68a52` | Destaque secundário; par do cobre em gradiente | landing `--gold-aged` |

**Gradiente de marca:** `linear-gradient(135deg, #c1793f, #a68a52)`. Ângulo fixo de 135deg, exatamente como na landing. Uso exclusivo do botão primário e do logo. Nunca em fundo de área grande, nunca em card, nunca em header.

`copper-dim` (`#8a5426`) da landing foi **descartado** — token morto, zero usos.

### 1.3 Texto

| Token | Valor | Contraste sobre `surface-0` | Uso |
|---|---|---|---|
| `--color-warm-white` | `#f2ece0` | 17.3:1 | Títulos, valores, texto principal |
| `--color-steel` | `#8b877d` | 5.7:1 | Descrição, meta, coluna secundária de tabela |

Destaque de texto (link, label ativo, número em destaque) usa o token de marca diretamente — `--color-copper` / classe `text-copper`. Não existe um `--color-text-accent` dedicado.

Os nomes de texto são os da própria landing (`--warm-white`, `--steel`), não `text-primary`/`text-secondary`. No Tailwind v4, `--color-X` gera as classes `text-X`/`bg-X`/`border-X`; um token chamado `--color-text-primary` produziria `text-text-primary`, não `text-primary`.

**Não existe um terceiro nível de texto.** A auditoria do sistema encontrou `text-gray-500`, `600`, `700` e `800` usados como texto — todos reprovam em contraste. Estão **proibidos**. Se algo parece precisar de um cinza mais apagado que `text-steel`, a resposta é reduzir o peso ou o tamanho, não a luminosidade.

### 1.4 Bordas

| Token | Valor | Contraste | Uso |
|---|---|---|---|
| `--color-line` | `rgba(242,236,224,0.12)` | 1.3:1 | Divisor decorativo, separador de card, borda de tabela |
| `--color-line-strong` | `rgba(242,236,224,0.40)` | 3.4:1 | `[derivado]` — borda de input, checkbox, e todo controle interativo |

A landing só tinha `--line`, o que basta para conteúdo estático. Um controle de formulário precisa de contorno perceptível: por isso `--color-line-strong`, e é obrigatório em qualquer elemento onde o usuário digita ou clica dentro da borda.

### 1.5 Semânticas

A landing não tem cores de estado — um site institucional não precisa. Todas são `[derivado]`, escolhidas dentro da temperatura da paleta (nada de verde-néon ou vermelho puro) e verificadas contra `surface-0`.

| Token | Valor | Contraste | Uso |
|---|---|---|---|
| `--color-success` | `#7ba05b` | 6.8:1 | Confirmado, pago, em dia |
| `--color-warning` | `#d9a03f` | 8.8:1 | Atenção, estoque baixo, pendente |
| `--color-danger` | `#d4614a` | 5.4:1 | Erro, exclusão, atraso |
| `--color-info` | `#7e9aaf` | 6.9:1 | Neutro informativo |

Para fundo de badge e banner, use o modificador de opacidade do Tailwind v4 sobre o próprio token — `bg-success/12`, `bg-warning/12`, `bg-danger/12`, `bg-info/12`. Não existe token `-bg` dedicado: `--color-success-bg` geraria a classe colidida `bg-success-bg`.

**Regra de uso:** cor nunca é o único portador de significado. Todo estado semântico traz também texto ou ícone.

### 1.6 Aliases de compatibilidade

Obrigatórios. O código atual referencia estes nomes em centenas de lugares e a migração precisa ser aditiva.

```
--color-industrial-dark : alias de surface-0, valor literal #050505 (não var())
--color-copper          : token real (nome preservado)
--color-copper-light    : token real (nome preservado)
--color-gold-aged       : token real (nome preservado)
```

O alias usa o hex literal, não `var(--color-surface-0)`: o modificador de opacidade do Tailwind v4 (`bg-industrial-dark/50`) compila para `color-mix()`, e a indireção de `var()` quebra isso.

Os aliases só podem ser removidos quando `/ds-migrar` tiver passado por todos os arquivos e o grep por eles retornar vazio.

---

## 2. Tipografia

Três famílias, carregadas via `@fontsource` (self-hosted). Subset latin + latin-ext — os acentos do português são obrigatórios.

| Papel | Família | Pesos | Onde |
|---|---|---|---|
| Display | **Fraunces** | 500, 600 | Título de página e de seção **apenas** |
| Corpo/UI | **Space Grotesk** | 400, 600 | Todo o resto da interface |
| Dado/Label | **JetBrains Mono** | 400, 500 | Label, valor monetário, horário, código, tag |

### Restrição do Fraunces

Fraunces é serif variável de alta personalidade. Na landing funciona porque cada título respira. Num sistema de gestão, ele **não entra** em: botão, label de input, cabeçalho de tabela, célula, badge, item de menu, breadcrumb, tab, tooltip. Se houver dúvida, a resposta é Space Grotesk.

### Escala

| Token | Tamanho | Família | Peso | Espaçamento | Uso |
|---|---|---|---|---|---|
| `display` | 32px | Fraunces | 600 | `-0.01em` | Título de página |
| `h1` | 24px | Fraunces | 600 | `-0.01em` | Título de seção |
| `h2` | 20px | Fraunces | 600 | normal | Subseção, título de modal |
| `h3` | 16px | Space Grotesk | 600 | normal | Título de card |
| `body` | 14px | Space Grotesk | 400 | normal | Padrão da interface |
| `body-sm` | 13px | Space Grotesk | 400 | normal | Texto de apoio |
| `data` | 13px | JetBrains Mono | 400 | normal | Dinheiro, horário, quantidade |
| `data-lg` | 24px | JetBrains Mono | 500 | normal | Número de destaque em card de métrica |
| `label` | 11px | JetBrains Mono | 500 | `0.14em` | Label, tag, eyebrow — sempre `uppercase` |

`line-height`: 1.5 no corpo, 1.15 em títulos, 1.4 em `data`.

**Piso absoluto: 11px.** A auditoria encontrou `text-[9px]` e `text-[10px]` no `AdminDashboard`. Ambos sobem para `label`.

**Números:** tudo que for moeda, horário, quantidade ou percentual usa `data` com `font-variant-numeric: tabular-nums`. Sem isso os valores dançam ao atualizar em tempo real.

`uppercase` só em `label` e em botão. Nunca em parágrafo, nunca em nome de pessoa, nunca em nome de serviço.

---

## 3. Espaçamento

Base 4. Escala: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`.

Valores fixos, sem exceção:

| Contexto | Valor |
|---|---|
| Padding interno de card | 24px |
| Padding de modal | 24px (32px no desktop) |
| Gap entre cards em grid | 16px |
| Gap entre seções | 32px |
| Padding de célula de tabela | 12px vertical, 16px horizontal |
| Gap entre label e campo | 8px |
| Margem lateral de página | 24px |

A auditoria encontrou padding de card variando entre 24, 32 e 40px no mesmo arquivo. Passa a ser 24 em todos.

---

## 4. Forma

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `2px` | Botão, input, tag, badge, checkbox |
| `--radius-md` | `4px` | Card, modal, imagem, painel, dropdown |
| `--radius-full` | `9999px` | **Somente avatar e indicador circular de status** |

Estes são os dois únicos valores que existem na landing, e a proporção também: 2px no que é interativo, 4px no que é contêiner.

**Proibido:** `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-[2.5rem]`, `borderRadius` inline. A auditoria encontrou todos eles. Botão arredondado em pílula e card com 24px de raio são a maior distância entre o sistema atual e a landing.

Espessura de borda: sempre `1px`. Não existe 2px.

---

## 5. Elevação

Flat é o padrão. Card, painel, header, sidebar e tabela **não têm sombra** — a separação vem de `surface-1` sobre `surface-0` mais `1px solid var(--color-line)`.

Única exceção, para o que flutua sobre o conteúdo:

```
--shadow-overlay: 0 16px 48px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
```

Autorizado apenas em: modal, dropdown, popover, toast, tooltip. Em nenhuma outra situação.

`shadow-xl`, `shadow-2xl` e `shadow-[0_0_15px_rgba(...)]` encontrados na auditoria saem todos.

---

## 6. Movimento

Curva única, herdada da landing: `--ease-brand: cubic-bezier(0.16, 1, 0.3, 1)` → utilitária `ease-brand`. O sufixo evita colisão com os `--ease-in` / `--ease-out` nativos da v4.

| Token | Duração | Classe no JSX | Uso |
|---|---|---|---|
| `--dur-fast` | `120ms` | `duration-100` | Cor, opacidade, borda |
| `--dur-base` | `200ms` | `duration-200` | Transformação, abertura de menu |
| `--dur-slow` | `400ms` | `duration-400` | Entrada de modal, transição de página |

O Tailwind v4 **não tem namespace de duração** — as variáveis acima existem para uso em CSS puro, e no JSX usa-se a classe numérica correspondente.

Utilitárias customizadas (escala tipográfica, atmosfera) devem ser declaradas com a diretiva `@utility`, não dentro de `@layer utilities` — só assim compõem com variantes como `hover:` e `md:`.

**Proibido:** `hover:scale-*`, `group-hover:scale-*` e qualquer duração acima de 400ms. A auditoria encontrou `scale-[1.02]` e `scale-110`. Botão de sistema não cresce ao passar o mouse — ele clareia. Use `filter: brightness(1.12)`, como a landing faz.

Obrigatório:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Atmosfera

A landing **não usa grão nem ruído**. Não introduza. Os dois recursos atmosféricos dela são:

1. **Vinheta radial** — `radial-gradient(ellipse at center, var(--color-surface-2), var(--color-surface-0))`. Utilitário opcional, aplicado em tela de login e estado vazio. Nunca em tela de trabalho.
2. **`backdrop-filter: blur(6px)`** — em header fixo sobre conteúdo rolável, junto com `linear-gradient(to bottom, rgba(5,5,5,0.85), transparent)`.

Qualquer camada decorativa recebe `pointer-events: none` e fica abaixo do conteúdo.

---

## 8. Ícones

`lucide-react`, `strokeWidth={1.75}`.

| Tamanho | Uso |
|---|---|
| 14px | Dentro de badge ou texto pequeno |
| 16px | Botão, item de menu, campo |
| 20px | Header, card de métrica, ação principal |

Nenhum outro tamanho. Ícone sozinho num botão exige `aria-label`. Ícone decorativo ao lado de texto recebe `aria-hidden="true"`.

---

## 9. Componentes

### Campos monetários

Todo valor monetário editável usa exclusivamente `src/components/ui/CurrencyInput.jsx`.
O componente recebe e devolve número em reais por `onValueChange` e interpreta a
digitação como centavos: `500` → `R$ 5,00` e `50000` → `R$ 500,00`. O valor
vazio devolve `null`, enquanto `0` continua sendo zero explícito. Valores
negativos são bloqueados por padrão e exigem `allowNegative`, reservado a
fluxos como saldo inicial de conta. Valores somente exibidos continuam usando
`formatarBRL`.

Todos em `src/components/ui/`. Todo componente aceita `className` (mesclado, não sobrescrito) e repassa `...props`. Todo elemento focável tem `focus-visible` com anel de 2px em `--color-copper` e offset de 2px. `outline: none` sem substituto é proibido.

### 9.1 Button

Tamanhos: `sm` (32px de altura, padding 8/12, texto 13px) · `md` (40px, 12/20, 14px) · `lg` (48px, 16/24, 14px). Raio `sm`. Fonte Space Grotesk 600, `uppercase`, `letter-spacing: 0.02em`.

| Variante | Fundo | Texto | Borda | Uso |
|---|---|---|---|---|
| `primary` | gradiente de marca 135deg | `#050505` | nenhuma | Uma por tela. A ação principal |
| `secondary` | transparente | `--color-copper` | 1px `--color-copper` | Ação de apoio |
| `ghost` | transparente | `--color-steel` | 1px transparent | Ação terciária, ícone |
| `danger` | transparente | `--color-danger` | 1px `--color-danger` | Exclusão, cancelamento |

Estados: `hover` → `filter: brightness(1.12)` no primary, fundo a 8% de opacidade nos demais · `active` → `brightness(0.94)`, sem deslocamento · `disabled` → `opacity: 0.4`, `cursor: not-allowed`, sem hover · `loading` → spinner de 16px no lugar do texto, largura preservada, `aria-busy="true"`, botão desabilitado.

### 9.2 Input

Altura 40px. Fundo `surface-2`. Borda 1px `--color-line-strong`. Raio `sm`. Texto `body` em `text-warm-white`. Placeholder em `text-steel`.

Foco: borda `--color-copper` mais anel de 2px. Erro: borda `--color-danger`, `aria-invalid="true"`, mensagem abaixo em `body-sm` na cor `danger`. Desabilitado: `opacity: 0.4`.

Label acima, sempre, no estilo `label`, ligada por `htmlFor`/`id`. Ícone opcional à esquerda com 16px, `text-steel`, que passa a `copper` quando o campo recebe foco. Texto de ajuda abaixo em `body-sm`/`text-steel`.

### 9.3 Card

Fundo `surface-1`, borda 1px `--color-line`, raio `md`, padding 24px, sem sombra. Hover, quando o card for clicável: borda passa a `--color-line-strong`. Nada mais muda.

Subcomponentes: `Card.Header` (título `h3` + ação à direita, com divisor de 1px abaixo) e `Card.Body`.

**Card de métrica** é uma variante: label em `label`/`text-steel` no topo, valor em `data-lg`/`text-warm-white` abaixo, variação opcional como badge semântico. Sem ícone dentro de caixa colorida.

### 9.4 Badge

Altura 20px, padding 2/8, raio `sm`, texto `label`. Variantes `neutral` (fundo `surface-2`, texto `text-steel`), `success`, `warning`, `danger`, `info` — cada uma com `bg-{variante}/12` (modificador de opacidade, não token `-bg`) e o texto na cor cheia.

### 9.5 Modal

Overlay `rgba(5,5,5,0.8)`. Painel em `surface-3`, raio `md`, `--shadow-overlay`, largura máxima 560px, padding 24px.

Obrigatório: foco preso dentro do painel, foco devolvido ao gatilho ao fechar, `Escape` fecha, clique no overlay fecha, `role="dialog"` com `aria-modal="true"` e `aria-labelledby` apontando para o título. Scroll do body bloqueado enquanto aberto.

Título em `h2`. Rodapé com ações alinhadas à direita, `secondary` antes de `primary`.

### 9.6 Label, Spinner, EmptyState

**Label** — `label` em `text-steel`, `uppercase`, `htmlFor` obrigatório.

**Spinner** — anel de 2px em `--color-copper`, tamanhos 16 e 24. Respeita `prefers-reduced-motion`.

**EmptyState** — centralizado, vinheta opcional ao fundo, ícone de 20px em `text-steel`, título em `h3`, descrição em `body`/`text-steel`, um botão `primary`. Sem ilustração, sem emoji.

---

## 10. Mapa de migração

Referência direta para o `/ds-migrar`.

| Encontrado no código atual | Substituir por |
|---|---|
| `bg-[#121212]`, `bg-industrial-dark` | `bg-surface-0` |
| `bg-[#1a1a1a]`, `bg-[#161616]` | `bg-surface-1` |
| `border-gray-800`, `border-gray-800/50` | `border-line` |
| `text-gray-500`, `text-gray-600` | `text-steel` |
| `text-gray-700`, `text-gray-800` (texto ou ícone) | `text-steel` |
| `text-white` | `text-warm-white` |
| `text-emerald-500`, `bg-emerald-500/10` | `text-success`, `bg-success/12` |
| `text-red-400`, `border-red-900/50` | `text-danger`, `border-danger` |
| `rounded-2xl`, `rounded-3xl`, `rounded-[2.5rem]` | `rounded-md` |
| `rounded-full` em botão ou tag | `rounded-sm` |
| `style={{borderRadius:'25px'}}` | `rounded-sm` |
| `rounded` sem sufixo (ex. `Login.jsx`) | `rounded-sm` ou `rounded-md`, explícito — sem sufixo resolve para o `--radius` default da v4, não para o token do sistema, mesmo coincidindo hoje |
| `shadow-xl`, `shadow-2xl`, `shadow-[0_0_15px_...]` | remover |
| `hover:scale-[1.02]`, `group-hover:scale-110` | remover |
| `text-[9px]`, `text-[10px]` | `text-label` |
| `font-black`, `font-extrabold` | `font-semibold` (600) |
| `tracking-tighter` | remover |
| Botão inline | `<Button>` |
| Input inline | `<Input>` |
| Card inline | `<Card>` |

---

## 11. Pendências

Fora do escopo desta versão, registradas para depois:

- **Monorepo** — adiado. A landing é HTML/CSS/JS sem build; unificar exige tooling ou porte para React. Por ora os tokens são copiados manualmente. Quando houver `packages/brand`, este documento vira a fonte do `tokens.css`.
- **`window.confirm()`** para exclusão, em `AdminDashboard`. Vira `Modal` de confirmação numa etapa posterior.
- **Modo claro** — não existe e não está planejado.
- **Tokens de gráfico** — quando entrar biblioteca de gráficos, a paleta categórica precisa ser definida aqui antes. Para o Mapa da barbearia, resolvido na seção 13.
- **`galeria-corte-degrade.jpg`** — ativo órfão na landing, sem referência. Verificar se pode ser removido.

---

## 12. Scrollbars

As scrollbars globais e das regiões internas roláveis têm 8px. O trilho usa `surface-0`; o polegar usa `line-strong` com borda de 2px em `surface-0`. Em hover e interação, o polegar passa a `copper`. No Firefox, usar `scrollbar-width: thin` e `scrollbar-color: line-strong surface-0`.

Não usar sombra, gradiente nem formato pill. A página não pode produzir rolagem horizontal; componentes largos devem conter a própria rolagem.

---

## 13. Mapa da barbearia (radar)

> Aprovado por Rafa em 23/09/2026 a partir do mockup do radar. Resolve, para esta tela, a pendência "Tokens de gráfico" da seção 11. Implementação: `src/pages/MapaBarbearia.jsx`, geometria em `src/lib/mapa/geometria.js`.

### 13.1 Paleta categórica dos núcleos `[derivado]`

Cada núcleo do radar tem uma cor de identidade, tirada da temperatura da marca (metais e materiais de barbearia). Cor de núcleo nunca comunica estado: o estado é sempre `--color-danger` (alerta) mais texto.

| Token | Valor | Núcleo |
|---|---|---|
| `--color-mapa-cobre` | `#c1793f` | Contas (igual a `copper`) |
| `--color-mapa-latao` | `#c9a45c` | Categorias |
| `--color-mapa-patina` | `#6f9a8d` | Cofres (envelopes) |
| `--color-mapa-oliva` | `#9aa66a` | Comissões |
| `--color-mapa-aco` | `#7f95a8` | Equipe |
| `--color-mapa-ameixa` | `#a07c96` | Clientes |
| `--color-mapa-osso` | `#cfc2a8` | Agenda |

### 13.2 Estrutura do radar `[derivado]`

| Token | Valor | Uso |
|---|---|---|
| `--color-mapa-grade` | `#2a2419` | Matriz de pontos vazia |
| `--color-mapa-trilho` | `#2b251b` | Anéis e divisórias |
| `--color-mapa-trilho-forte` | `#3d3629` | Anel de acessos, marcas maiores |
| `--color-mapa-faixa` | `#110e0a` | Fundo da faixa de itens |
| `--color-mapa-painel` | `#0a0908` | Painel lateral do mapa |
| `--color-mapa-texto` | `#e6dfd2` | Rótulos dentro do SVG |
| `--color-mapa-alerta-suave` | `#e8998a` | Texto de alerta sobre fundo escuro do radar |
| `--color-mapa-lancamento-suave` | `#e8c27a` | Data do lançamento em foco |

O anel de lançamentos usa `--color-warning`; os alertas, `--color-danger`. Os valores são espelhados em `src/lib/mapa/tokens.js` porque o SVG precisa deles literais; `tests/mapa-modelo.test.js` falha se os dois divergirem.

### 13.3 Exceções autorizadas — só nesta tela

- **Brilho:** filtro `feGaussianBlur` (desvio 2,5) nos núcleos, no centro e no item em foco. Continua proibido em qualquer outro componente.
- **Movimento contínuo:** varredura do radar (16 s), anel tracejado do centro (60 s) e pulsos de alerta (1,8–2 s). A varredura e os pulsos somem com `prefers-reduced-motion`; o anel do centro continua girando por ser lento (60 s por volta). Transições de interface continuam limitadas a 400 ms.
- **Ícones próprios:** bigode (Clientes) e poste de barbeiro (centro) em `src/components/mapa/IconeMapa.jsx`, na mesma grade 24×24 e traço do `lucide-react`. Os demais núcleos usam lucide: `Landmark`, `Tag`, `Vault`, `HandCoins`, `Scissors`, `CalendarDays`.
- **Tamanhos no SVG:** rótulos radiais e de núcleo usam 7,5–9,5 unidades do viewBox (948 unidades de largura). Numa tela comum isso fica entre ~7 e ~10px, abaixo do piso de 11px da seção 2. É uma exceção consciente, igual ao Mapa da casa: o mesmo texto aparece sempre no painel lateral em tamanho normal, então o radar nunca é o único lugar onde uma informação pode ser lida.
