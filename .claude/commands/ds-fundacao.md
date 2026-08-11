---
description: Implementa a fundação do design system Garagem — tokens, fontes, textura e componentes primitivos
argument-hint: "[opcional: --dry-run para só listar o plano]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm install:*), Bash(npm run build:*), Bash(npm ls:*), Bash(git status:*), Bash(git diff:*)
---

# /ds-fundacao — Fundação do Design System

Implementa a **camada base** do design system: tokens, fontes, textura e primitivos.
Este comando **não migra telas existentes** — isso é trabalho do `/ds-migrar`.

## Pré-requisitos — pare se algum falhar

1. `docs/design-system/DESIGN-SYSTEM.md` existe e está preenchido. **Ele é a especificação. Você não inventa valores.**
   Se não existir, pare e diga: "Falta o DESIGN-SYSTEM.md aprovado. Rode /ds-audit primeiro e aprove as decisões."
2. `git status` está limpo (ou o usuário confirmou que quer prosseguir sujo).
3. Se `$ARGUMENTS` contiver `--dry-run`: apresente o plano completo com os diffs pretendidos e **não escreva nada**.

## Princípio de execução

Trabalhe em **fases**. Ao fim de cada fase: rode `npm run build`, confirme que passa, e faça um resumo de 3 linhas antes de seguir. Se o build quebrar, **conserte antes de avançar** — nunca acumule duas fases quebradas.

Nada de refatoração oportunista. Se um arquivo não está no escopo da fase, não toque nele.

---

## Fase 1 — Resolver a fonte única de verdade

1. Confirme a versão do Tailwind com `npm ls tailwindcss`.
2. Se for v4: **`src/index.css` com `@theme` é a única fonte de tokens.**
   - Verifique se algum arquivo importa `tailwind.config.js` via `@config`. Se não importar, o config está morto.
   - Mova qualquer token útil do config para o `@theme` e **delete `tailwind.config.js`**.
   - Confirme que `@tailwindcss/postcss` está no `postcss.config.js`.
3. Se for v3: faça o inverso — o config manda, e o `@theme` sai.
4. Rode o build e confirme que as classes de cor continuam funcionando.

## Fase 2 — Tokens

Escreva **todos** os tokens da seção "Tokens" do `DESIGN-SYSTEM.md` no `@theme` de `src/index.css`.

Regras inegociáveis:
- **Aliases de compatibilidade são obrigatórios.** Todo nome de token que já existe no código (`copper`, `copper-light`, `gold-aged`, `industrial-dark`) precisa continuar resolvendo para um valor válido. A migração é aditiva; nenhuma tela pode quebrar nesta fase.
- Agrupe com comentários CSS por categoria: superfície, marca, material, texto, semântica, borda, sombra, movimento.
- Nenhum valor inventado. Se um valor não estiver na spec, pare e pergunte.

Ao final, mostre o `@theme` completo resultante no terminal.

## Fase 3 — Tipografia

1. Instale as fontes definidas na spec **via `@fontsource`** (self-hosted, sem chamada externa).
   - Antes de instalar, confirme que o pacote existe: `npm view <pacote> version`.
   - Se o pacote variável não existir, use os pesos estáticos que a spec pede.
   - Se o npm falhar, **pare e reporte** — não caia silenciosamente para `<link>` do Google Fonts sem avisar.
2. Importe as fontes no topo de `src/index.css`.
3. Registre `--font-display` e `--font-sans` no `@theme`.
4. Aplique a fonte base no `body` e ative `font-variant-numeric: tabular-nums` na classe utilitária de números que a spec definir.
5. Verifique que os glifos acentuados do português (ã, ç, õ, é, ú) estão no subset carregado.

## Fase 4 — Textura e atmosfera

Implemente o que a spec descrever para grão, vinheta e brilho de lâmpada, como **utilitários CSS reutilizáveis**, não como estilos inline.

Restrições:
- Grão precisa ser SVG inline em `background-image` (data URI) — nenhum arquivo de imagem, nenhum request extra.
- Nada de textura pode ficar acima da camada de conteúdo nem capturar cliques: sempre `pointer-events: none`.
- Textura tem que ser opcional por classe. Não force no `body`.
- Respeite `@media (prefers-reduced-motion: reduce)`: qualquer animação de brilho é desativada.

## Fase 5 — Primitivos

Crie os componentes em `src/components/ui/`, um arquivo por componente, **exatamente na ordem abaixo**:

1. `Button.jsx` — variantes e tamanhos conforme a spec
2. `Input.jsx` — com label, ícone opcional, estado de erro e texto de ajuda
3. `Card.jsx` — com subcomponentes de header e body
4. `Badge.jsx` — variantes semânticas
5. `Modal.jsx` — overlay, foco preso dentro do modal, fechar com Escape
6. `Label.jsx`, `Spinner.jsx`, `EmptyState.jsx`

Cada componente precisa obrigatoriamente ter:
- Apenas classes de token. **Zero hex literal, zero classe de paleta padrão do Tailwind, zero valor arbitrário.**
- Todos os estados da spec: default, hover, active, focus-visible, disabled, loading.
- `focus-visible` com anel visível — nunca `outline: none` sem substituto.
- `...props` repassado e `className` aceito para composição (mesclado, não sobrescrito).
- Semântica correta: `<button type>`, `<label htmlFor>`, `aria-invalid`, `aria-busy`, `role="dialog"` + `aria-modal`.
- Um bloco de comentário no topo com o uso básico.

Não crie barrel file (`index.js`) — imports diretos.

## Fase 6 — Vitrine

Crie `src/pages/DesignSystem.jsx` e registre a rota `/design-system` no `App.jsx`.

A página mostra, sobre o fundo real do app: a paleta completa com os hex, a escala tipográfica, todos os primitivos em todos os estados e tamanhos lado a lado, e as amostras de textura. É a página que vamos usar para revisar visualmente antes de migrar qualquer tela.

## Fase 7 — Fechamento

1. `npm run build` — precisa passar.
2. `npm run lint` — sem erros novos.
3. Escreva `docs/design-system/IMPLEMENTACAO.md` com: o que foi criado, o que foi alterado, quais aliases de compatibilidade existem e quando poderão ser removidos, e o que ficou pendente.
4. Imprima no terminal um diff resumido (arquivos criados / alterados / deletados) e as instruções para ver `/design-system` no navegador.

## Não faça

- Não toque em `src/pages/Dashboard.jsx`, `AdminDashboard.jsx`, `Login.jsx` ou em qualquer componente existente fora de `src/components/ui/`. A única exceção é adicionar a rota em `App.jsx`.
- Não mexa em lógica de negócio, Supabase, queries ou estado.
- Não instale biblioteca de UI (shadcn, MUI, Radix, headless) sem perguntar antes.
- Não "melhore" nada que não esteja na spec.
