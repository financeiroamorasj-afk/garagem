---
description: Auditoria read-only do design system do Garagem — inventário de tokens, componentes e inconsistências visuais
argument-hint: "[opcional: pasta para focar, ex: src/pages]"
allowed-tools: Read, Glob, Grep, Write
---

# /ds-audit — Auditoria do Design System

Você é auditor de design system. Sua missão é **diagnosticar, nunca corrigir**.

## Regra absoluta

**NÃO edite, refatore, formate ou delete nenhum arquivo de código.**
A única escrita permitida em todo este comando é criar/sobrescrever
`docs/design-system/AUDITORIA.md`. Qualquer outra escrita é violação do comando.

Se você identificar um bug óbvio, **anote no relatório** — não conserte.

## Escopo

Alvo: `$ARGUMENTS` (se vazio, audite todo o `src/` + `index.html` + configs de estilo).

Ignore: `node_modules/`, `dist/`, `build/`, `.git/`, `package-lock.json`, `*.svg`, `public/`.

## Passo 1 — Mapear a base de estilo

Leia integralmente:
- `src/index.css` (bloco `@theme`)
- `tailwind.config.js`
- `postcss.config.js`
- `package.json`
- `index.html`

Determine e registre:
- Qual versão do Tailwind está instalada (v3 usa `tailwind.config.js`; v4 usa `@theme` no CSS).
- **Se existirem as duas fontes de verdade**, marque como conflito CRÍTICO e diga qual está de fato sendo aplicada.
- Quais fontes estão carregadas (`<link>`, `@import`, `@fontsource`) e quais são realmente usadas no código. Se não houver nenhuma, registre "fonte do sistema — nenhuma fonte de marca definida".

## Passo 2 — Inventário de arquivos

Liste todos os `.jsx`/`.tsx` em `src/`, classificando cada um como `page`, `component`, `layout`, `lib` ou `hook`.
Para cada arquivo registre: caminho, número de linhas, e uma frase sobre a função dele na UI.

## Passo 3 — Coleta de evidências

Use `Grep` e reporte **contagem + arquivo + linha** para cada item. Não estime: conte.

### 3.1 Cores hardcoded
- Hex literais em className ou style: `#[0-9a-fA-F]{3,8}`
- `rgb(`, `rgba(`, `hsl(`
- Classes de paleta padrão do Tailwind que não são token do projeto:
  `gray-`, `slate-`, `zinc-`, `neutral-`, `stone-`, `emerald-`, `green-`, `red-`, `blue-`, `amber-`, `yellow-`
- Agrupe por valor. Ex.: `#1a1a1a` — 14 ocorrências em 3 arquivos.

### 3.2 Border radius
Conte separadamente cada variante encontrada: `rounded`, `rounded-sm/md/lg/xl/2xl/3xl/full`, `rounded-[...]`, e `borderRadius` inline em `style={{}}`.
Monte uma tabela **valor → nº de ocorrências → arquivos**. Este é o achado mais importante do relatório.

### 3.3 Espaçamento e sombra
- Valores arbitrários: `p-[`, `m-[`, `gap-[`, `w-[`, `h-[`, `text-[`
- Sombras: `shadow-`, `shadow-[`, `drop-shadow`
- Liste cada valor arbitrário único encontrado.

### 3.4 Tipografia
- Tamanhos usados: `text-xs` até `text-9xl` e `text-[...]` — conte cada um.
- Pesos: `font-medium/bold/black/extrabold` — conte cada um.
- Tracking e transform: `tracking-`, `uppercase`, `italic`.
- Sinalize qualquer tamanho **abaixo de 11px** (`text-[9px]`, `text-[10px]`) como risco de legibilidade.

### 3.5 Movimento
- `transition-`, `duration-`, `animate-`, `hover:scale`, `group-hover:scale`, `ease-`
- Liste durações distintas encontradas.

### 3.6 Ícones
- Todos os imports de `lucide-react` e os tamanhos passados via `size={}`.
- Liste os tamanhos distintos e sinalize se há mais de 3.

## Passo 4 — Elementos repetidos sem componente

Procure por marcações de UI **duplicadas em 2+ arquivos** que não existem como componente compartilhado. Foque em:
botão, card, input, label, modal, badge/pill, tabela, header, tab, estado vazio, spinner de loading.

Para cada um, informe:
- Quantas variantes visuais diferentes do mesmo elemento existem
- A className completa de cada variante e onde ela está
- Um veredicto: "extrair como componente" ou "manter inline"

Exemplo do formato esperado:

```
BOTÃO PRIMÁRIO — 4 variantes visuais, 0 componente
  Login.jsx:63       gradiente cobre→dourado, rounded, uppercase, hover:scale
  Dashboard.jsx:41   cobre 10% + borda, rounded, uppercase
  AdminDashboard.jsx:88  cobre sólido, rounded-full, font-black
  → EXTRAIR
```

## Passo 5 — Contraste (WCAG AA)

Para cada par cor-de-texto/fundo que aparecer em 3+ lugares, calcule a razão de contraste real e classifique:
- Texto < 18px precisa de **4.5:1**
- Texto ≥ 18px ou bold ≥ 14px precisa de **3:1**

Dê atenção especial a `text-gray-500`, `text-gray-600`, `text-gray-700`, `text-gray-800` e `text-copper` sobre fundos escuros. Mostre o cálculo em uma tabela com veredicto PASSA/FALHA.

## Passo 6 — Leitura de layout

Sem julgar estética, descreva objetivamente para cada página:
- A estrutura (sidebar? header? kanban? grid? tabela?)
- Densidade da informação (espaçoso / equilibrado / apertado)
- Como o usuário navega entre as áreas

Isto serve para decidirmos depois se o layout muda ou só a pele.

## Saída

Escreva o relatório completo em `docs/design-system/AUDITORIA.md` (crie a pasta se preciso) e **imprima também no terminal** um resumo executivo de no máximo 40 linhas.

Estrutura do arquivo:

```markdown
# Auditoria de Design System — Garagem System
Data: {data} · Commit: {hash curto se disponível}

## Resumo executivo
- Arquivos analisados: X
- Tokens definidos: X | Valores hardcoded: X
- Variantes de border-radius em uso: X
- Componentes duplicados sem abstração: X
- Falhas de contraste WCAG AA: X
- **Nota de consistência: X/100** (justifique o número em 2 linhas)

## 1. Base de estilo
## 2. Inventário de arquivos
## 3. Tokens vs. hardcoded
### 3.1 Cores | 3.2 Radius | 3.3 Espaçamento e sombra | 3.4 Tipografia | 3.5 Movimento | 3.6 Ícones
## 4. Componentes duplicados
## 5. Contraste
## 6. Layout por página
## 7. Os 10 problemas mais caros
Ordenados por (impacto visual × nº de ocorrências). Para cada um: o problema, onde está, e o custo estimado de correção em arquivos tocados.

## 8. Perguntas em aberto
Coisas que você não conseguiu determinar só lendo o código e que precisam de decisão humana.
```

## Tom

Direto e quantitativo. Sem elogios, sem "ótimo trabalho", sem recomendações de solução — este comando só mede. As soluções são decididas depois, fora daqui.
