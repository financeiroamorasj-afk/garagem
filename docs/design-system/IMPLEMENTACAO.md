# Implementação — Fundação do Design System

> Executado por `/ds-fundacao` em 2026-08-10, a partir de `docs/design-system/DESIGN-SYSTEM.md` v1.1.
> Este documento registra o que foi feito. Para telas existentes migrarem para os tokens, ver `/ds-migrar` — nada em `src/pages/Dashboard.jsx`, `AdminDashboard.jsx`, `Login.jsx` ou componentes fora de `src/components/ui/` foi tocado aqui, exceto a rota nova em `App.jsx`.

## O que foi criado

| Arquivo | Conteúdo |
|---|---|
| `src/components/ui/Button.jsx` | 4 variantes × 3 tamanhos, loading, disabled |
| `src/components/ui/Input.jsx` | label obrigatório, ícone opcional, erro, texto de ajuda |
| `src/components/ui/Card.jsx` | `Card`, `Card.Header`, `Card.Body`, `Card.Metric` |
| `src/components/ui/Badge.jsx` | 5 variantes semânticas |
| `src/components/ui/Modal.jsx` | overlay, foco preso, `Escape`, portal, scroll lock |
| `src/components/ui/Label.jsx` | label autônomo no estilo `label` |
| `src/components/ui/Spinner.jsx` | 16/24px, respeita `prefers-reduced-motion` |
| `src/components/ui/EmptyState.jsx` | com vinheta opcional |
| `src/pages/DesignSystem.jsx` | vitrine em `/design-system` — paleta, escala tipográfica, os 8 primitivos em todos os estados, amostras de atmosfera |
| `docs/design-system/IMPLEMENTACAO.md` | este arquivo |

## O que foi alterado

| Arquivo | Mudança |
|---|---|
| `src/index.css` | reescrito — `@theme` completo (tokens de superfície, marca, texto, borda, semântica, forma, sombra, movimento, tipografia), base do `body`, escala tipográfica e utilitários de atmosfera via `@utility`, `@media (prefers-reduced-motion: reduce)` |
| `src/main.jsx` | +6 linhas — imports de `@fontsource` (ver nota técnica abaixo) |
| `src/App.jsx` | +2 linhas — import de `DesignSystem` e rota `/design-system` |
| `package.json` / `package-lock.json` | +3 dependências: `@fontsource/fraunces`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono` (5.3.0) |
| `tailwind.config.js` | **deletado** — morto, não importado via `@config`, duplicava valores já no `@theme` |

## Nota técnica: fontes importadas em `main.jsx`, não em `index.css`

A spec (Fase 3) pedia import das fontes no topo do `index.css`. Ao implementar assim, o build passava mas os arquivos `.woff2` não eram copiados para `dist/` — ficavam com `url()` relativo quebrado (`./files/xxx.woff2`), 404 em produção. Causa: o Tailwind v4 processa `@import` dentro do arquivo com seu próprio motor (Lightning CSS), que não faz o rebase dos `url()` relativos de um pacote em `node_modules`. Mover os imports para `src/main.jsx` (import JS puro) resolve — passa pelo pipeline padrão de assets do Vite, que hasheia e copia os 42 arquivos de fonte corretamente. Confirmado via build (`find dist -iname "*.woff*"` antes/depois).

## Tokens adicionados além da lista literal da spec

Durante a Fase 5, três valores prescritos pela spec não tinham mecanismo de token no Tailwind v4 e foram tokenizados para não precisar de valor arbitrário no componente:

| Token | Valor | Namespace v4 | Usado em |
|---|---|---|---|
| `--tracking-button` | `0.02em` | `--tracking-*` → `tracking-button` | `Button` (letter-spacing, spec 9.1) |
| `--container-modal` | `560px` | `--container-*` → `max-w-modal` | `Modal` (largura máxima, spec 9.5) |

Um terceiro valor (`filter: brightness(1.12)`/`brightness(0.94)` nos estados hover/active do Button) **não tem namespace `@theme` no Tailwind v4** — brightness é utilitário funcional de escala fixa (0/50/75/90/95/100/105/110/125/150/200), sem ponto de extensão. Usei valor arbitrário (`brightness-[1.12]`, `brightness-[0.94]`) porque não havia alternativa tokenizável; documentado aqui em vez de silenciado.

## Aliases de compatibilidade

```
--color-industrial-dark: #050505   (alias de surface-0, valor literal — ver nota abaixo)
--color-copper, --color-copper-light, --color-gold-aged   (tokens reais, nomes preservados)
```

`--color-industrial-dark` usa o hex literal, não `var(--color-surface-0)`: indireção via `var()` quebra o modificador de opacidade do Tailwind v4 (`bg-industrial-dark/50` compila para `color-mix()`, que não atravessa uma segunda variável). Confirmado no build: `bg-success/12` gera corretamente `color-mix(in oklab, var(--color-success) 12%, transparent)` com fallback hex — o mesmo padrão vale para o alias.

**Quando remover:** 19 arquivos fora de `src/components/ui/` ainda referenciam `copper`, `gold-aged` ou `industrial-dark` diretamente (`grep -rl "industrial-dark\|copper\|gold-aged" src` menos os 5 arquivos criados nesta fundação). Os aliases ficam até o `/ds-migrar` passar por todos e o grep voltar vazio — só `--color-industrial-dark` é alias de verdade; `copper`/`copper-light`/`gold-aged` são os tokens reais, não saem nunca.

## Pendências para `/ds-migrar`

- 19 arquivos ainda usam os nomes de cor sem o sistema de tokens completo (só tinham `industrial-dark`/`copper`/`gold-aged` antes; agora também precisam adotar `surface-1`/`surface-2`, `warm-white`, `steel`, `line`, `line-strong`, os primitivos, etc.). Seguir o mapa de migração (`DESIGN-SYSTEM.md` seção 10).
- `Login.jsx` usa `rounded` sem sufixo — resolve para o `--radius` default da v4 (coincide com 4px hoje, mas não está de fato ligado ao token `--radius-md`). Trocar por `rounded-sm`/`rounded-md` explícito.
- `window.confirm()` em `AdminDashboard` — vira `<Modal>` de confirmação (já implementado aqui) numa migração posterior.
- Existe um `Modal.jsx` em `src/components/` (fora de `ui/`) que é o modal antigo, não tokenizado — não foi tocado. `/ds-migrar` decide se substitui pelo `src/components/ui/Modal.jsx` novo.
- Ativo órfão `galeria-corte-degrade.jpg` na landing (fora deste repo) — já registrado em `DESIGN-SYSTEM.md` seção 11, sem ação aqui.

## Verificação

- `npm run build` — passa, 42 arquivos de fonte corretamente hasheados em `dist/assets/`.
- `npm run lint` — 9 erros / 1 warning, todos pré-existentes em arquivos não tocados por esta fundação (`AdminAppointmentModal.jsx`, `BarberModal.jsx`, `QuickAppointmentModal.jsx`, `ServiceProductModal.jsx`, `TimeGrid.jsx`, `AdminDashboard.jsx`, `Dashboard.jsx`, `ReceptionBoard.jsx`). Zero erros nos arquivos criados/alterados.
- `/design-system` testado no navegador (Chrome headless + Playwright): fontes carregando (Fraunces/Space Grotesk/JetBrains Mono visualmente distintos), cores resolvendo, Modal abre/fecha com `Escape` e devolve foco, zero erro de console.
