---
description: Extrai o DNA visual da landing page (pasta externa ao projeto) para servir de base ao design system
argument-hint: "<caminho absoluto da pasta da landing>"
allowed-tools: Read, Glob, Grep, Write, Bash(find:*), Bash(cat:*), Bash(ls:*), Bash(wc:*), Bash(grep:*), Bash(head:*), Bash(git status:*)
---

# /ds-landing — Extração do DNA visual da landing

A landing page **não está neste workspace**. Ela está em: `$ARGUMENTS`

Se `$ARGUMENTS` estiver vazio, pare e peça o caminho absoluto da pasta.

## Como ler arquivos de fora do workspace

O `Read` provavelmente vai recusar caminhos fora do projeto aberto. Para tudo que estiver dentro de `$ARGUMENTS`, use `Bash`:

```bash
find "$ARGUMENTS" -type f \( -name "*.jsx" -o -name "*.tsx" -o -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.json" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*"
cat "$ARGUMENTS/caminho/do/arquivo"
```

Use `Read` normalmente para arquivos **deste** projeto.

## Regra absoluta

**Não modifique, mova, delete ou crie nada dentro de `$ARGUMENTS`.** A landing existe só nesta máquina e não tem backup. Tratar como somente-leitura.

A única escrita permitida é `docs/design-system/AUDITORIA-LANDING.md`, **neste** projeto.

## Passo 1 — Identificar a stack

Leia `package.json`, e procure por `next.config.*`, `vite.config.*`, `astro.config.*`, `tailwind.config.*`, `index.html`.

Reporte de forma inequívoca:
- Framework e versão (Next / Vite+React / Astro / HTML+CSS puro / outro)
- Versão do React, se houver
- Versão do Tailwind, se houver, e onde os tokens moram (`@theme` no CSS ou `tailwind.config.js`)
- Gerenciador de pacotes (existe `package-lock.json`? `pnpm-lock.yaml`? `yarn.lock`?)
- Se há `.git` na pasta (`ls -a`)
- Tamanho total sem `node_modules` (`du -sh --exclude=node_modules`)

Isto decide se dá para unificar os dois projetos num monorepo depois. Seja preciso.

## Passo 2 — Extrair os tokens reais

Este é o objetivo do comando. Quero os valores **que já existem**, não interpretação.

### Cores
Colete **todo** valor de cor do projeto: tokens declarados, hex literais, `rgb`, `hsl`, gradientes, classes de paleta do Tailwind.
Monte uma tabela ordenada por frequência: `valor | nº de ocorrências | onde aparece | função aparente (fundo / texto / borda / destaque)`.

Depois deduza e apresente separadamente:
- Qual é a cor de fundo dominante
- Qual é a cor de destaque/marca
- Quais cores aparecem 1–2 vezes (provavelmente acidentais, não fazem parte do sistema)

### Tipografia
- Fontes carregadas: `<link>` do Google Fonts, `@import`, `@fontsource`, `next/font`, `@font-face`
- **Nome exato de cada família e os pesos realmente usados**
- Onde cada família é aplicada (títulos? corpo? só o logo?)
- Tamanhos, `letter-spacing`, `text-transform` e `line-height` de cada nível de título

Se não houver fonte customizada, diga isso explicitamente.

### Forma, profundidade e movimento
- Todos os valores de `border-radius` encontrados, com contagem
- Todas as sombras
- Todas as durações e curvas de transição/animação
- Bordas: espessuras e cores

### Textura e atmosfera
Procure especificamente por: imagem de fundo, `background-blend-mode`, `mix-blend-mode`, ruído/grão, vinheta, `backdrop-filter`, overlays com opacidade, gradientes radiais.
Descreva o que encontrar e como está implementado (arquivo de imagem? SVG inline? CSS puro?).

### Ativos
Liste imagens e SVGs em `public/`, `assets/` ou `static/`, com nome e tamanho. Marque quais parecem ser logo, ícone ou textura reaproveitável.

## Passo 3 — Comparar com o sistema

Leia `src/index.css` **deste** projeto e monte uma tabela de confronto:

| Aspecto | Landing | Sistema | Convergem? |
|---|---|---|---|

Cubra pelo menos: cor de fundo, cor de destaque, fonte de título, fonte de corpo, border-radius padrão, estilo de sombra.

Para cada divergência, diga **qual dos dois lados deveria ceder** e por quê. Regra de desempate: a landing define a marca; o sistema define a ergonomia. Cor e tipografia seguem a landing. Densidade, contraste e tamanho de alvo de clique seguem a necessidade de uso prolongado do sistema.

## Passo 4 — Viabilidade de monorepo

Com base no Passo 1, dê um veredicto direto:

- **VIÁVEL E SIMPLES** — mesma stack base, versões compatíveis
- **VIÁVEL COM AJUSTE** — dá para unificar, mas algo precisa mudar (diga exatamente o quê)
- **NÃO RECOMENDADO** — stacks incompatíveis; melhor compartilhar só o CSS de tokens

Justifique em no máximo 5 linhas, citando as versões concretas.

## Saída

Escreva `docs/design-system/AUDITORIA-LANDING.md` neste projeto, e imprima no terminal um resumo de até 30 linhas contendo obrigatoriamente:

1. Stack da landing, em uma linha
2. As 6 cores mais frequentes com hex e função
3. As famílias tipográficas com nome exato e pesos
4. Os valores de border-radius com contagem
5. O veredicto de monorepo

Este resumo é o que vai ser colado de volta na conversa de design. Ele precisa se sustentar sozinho.

## Tom

Quantitativo. Reporte o que está no código. Se algo for dedução sua, marque como `[dedução]`. Não sugira melhorias — este comando só mede.
