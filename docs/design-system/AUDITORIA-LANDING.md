# Auditoria do DNA visual — Landing Page Garagem System

Fonte: `C:\Users\Ruch\Desktop\LANDING PAGE GARAGEM` (somente leitura, sem `.git`, sem backup).
Data da auditoria: 2026-08-10.

---

## 1. Stack

| Aspecto | Valor |
|---|---|
| Framework | Nenhum — HTML + CSS + JS puro (`index.html`, `css/style.css`, `js/main.js`) |
| React | Não há |
| Tailwind | Não há |
| Bundler / build | Nenhum. Sem `package.json`, sem `node_modules`. Bibliotecas (`gsap.min.js`, `ScrollTrigger.min.js`, `lenis.min.js`) estão vendorizadas em `js/vendor/`, carregadas via `<script>` direto |
| Gerenciador de pacotes | Nenhum (não existe `package.json`, `package-lock.json`, `pnpm-lock.yaml` nem `yarn.lock`) |
| `.git` | Não existe. Pasta sem controle de versão e sem backup |
| Tamanho total (sem `node_modules`, que não existe) | 16M |

---

## 2. Cores

### Tabela de frequência (todas declaradas como custom properties em `:root`, `css/style.css:7-15`)

| Token / valor | Ocorrências¹ | Onde aparece | Função aparente |
|---|---|---|---|
| `--line` = `rgba(242,236,224,0.12)` | 13 usos | bordas de cards, divisores de grid, borda de botão ghost | linha/divisor estrutural |
| `--copper` = `#c1793f` | 11 usos | eyebrow, hover de links, borda de destaque (`.plano--destaque`), gradiente de botão | cor de destaque/marca (primária) |
| `--graphite` = `#0e0d0c` | 8 usos | fundo de `.dor`, `.perfis`, `.depoimentos` (seções "zebra") | fundo alternativo/seção |
| `--warm-white` = `#f2ece0` | 8 usos | `h1`/`h2`/`h3`, texto de `.dor__lista p`, logo | texto principal sobre fundo escuro |
| `--black` = `#050505` | 5 usos | `body` background, base de gradientes | fundo dominante |
| `--steel` = `#8b877d` | 4 usos | `p` (parágrafo padrão), `.nav__links a`, `.barbearia__aviso` | texto secundário/muted |
| `--gold-aged` = `#a68a52` | 3 usos | `.eyebrow--light`, segunda cor do gradiente de botão, `.perfil-card__tag` | cor de destaque secundária |
| `--graphite-2` = `#17150f` | 2 usos | fundo de `.pilar__shot`, ponto do gradiente radial do CTA final | fundo de card / profundidade |
| `--copper-dim` = `#8a5426` | 0 usos reais | declarada em `:root` mas nunca referenciada em nenhuma regra | **token morto** |

Literais soltos fora do `:root` (não tokenizados): `rgba(5,5,5,0.85)` (gradiente do nav, equivalente a `--black`), `rgba(0,0,0,0.7)` (text-shadow), `rgba(193,121,63,0.08)` (equivalente a `--copper` com opacidade, no fundo de `.plano--destaque`).

¹ Contagem de `var(--token)`, excluindo a linha de declaração em `:root`.

### Deduções

- **Fundo dominante:** `--black` (`#050505`), aplicado no `body`. As seções alternam com `--graphite` (`#0e0d0c`) formando um padrão "zebra" sutil — ambos quase-pretos, a diferença é de ~2% de luminosidade.
- **Cor de destaque/marca:** `--copper` (`#c1793f`), reforçada por `--gold-aged` (`#a68a52`) como par — o botão principal usa gradiente `copper → gold-aged`.
- **Cores acidentais (1-2 ocorrências, prováveis não-sistema):** `--copper-dim` (0 usos reais — token morto, provavelmente substituído por `--copper` em algum refactor) e, em menor grau, `--graphite-2` (2 usos, mas claramente intencional para profundidade de cards, não acidental).

---

## 3. Tipografia

Carregamento: `<link>` do Google Fonts em `index.html:11` — `Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700`, `Space+Grotesk:wght@400;500;600;700`, `JetBrains+Mono:wght@400;500`.

| Família | Pesos carregados | Pesos realmente usados no CSS | Onde é aplicada |
|---|---|---|---|
| **Fraunces** (`--font-display`) | 400, 500, 600, 700 (variável, `opsz` 9-144) | 500 (`h1`), 600 (`h2`, `h3`, `.nav__logo`, `.depoimento p` em itálico) | Títulos (`h1`/`h2`/`h3`), logo do nav, citação de depoimento |
| **Space Grotesk** (`--font-body`) | 400, 500, 600, 700 | 400 (padrão do `body`), 600 (`.btn`) | Corpo de texto geral, botões |
| **JetBrains Mono** (`--font-mono`) | 400, 500 | 400 (padrão, nenhum peso explícito nas regras) | `.eyebrow`, links do nav, `.hero__sub`, `.dor__num`, `.perfil-card__tag`, `cite` de depoimento, rodapé — sempre em uppercase/tracked, função de "label técnico" |

Detalhes por nível de título:
- `h1`: `clamp(2.6rem, 6vw, 5.2rem)`, peso 500, `line-height: 1.08`
- `h2`: `clamp(1.9rem, 4vw, 3.1rem)`, peso 600 (herdado), `max-width: 720px`
- `h3`: `1.35rem`, peso 600
- `.eyebrow` (label mono): `12px`, `letter-spacing: 0.16em`, `text-transform: uppercase`
- `letter-spacing` também aparece em `.nav__links` (`0.06em`), `.dor__num`/`.perfil-card__tag` (`0.1em`), `.hero__sub` (`0.04em`), `.btn` (`0.02em`)
- `line-height` só é setado explicitamente em `body` (`1.5`) e em `h1,h2,h3` (`1.08`)

---

## 4. Forma, profundidade e movimento

### Border-radius (todas ocorrências no arquivo)
| Valor | Ocorrências | Onde |
|---|---|---|
| `4px` | 4 | `.pilar__shot`, `.galeria__item`, `.depoimento`, `.plano` |
| `2px` | 2 | `.btn`, `.perfil-card__tag` |

### Sombras
- **Não há `box-shadow` em nenhum lugar do arquivo.** O sistema visual é inteiramente flat, sem elevação por sombra.
- Único uso de sombra: `text-shadow: 0 2px 24px rgba(0,0,0,0.7)` em `.hero__text--end` (`css/style.css:187`), para legibilidade de texto sobre o vídeo do hero.
- `filter: brightness(1.12)` no hover do botão sólido — não é sombra, é ajuste de brilho.

### Transições e animações
| Duração / curva | Onde |
|---|---|
| `0.3s var(--ease)` | `.btn` (hover geral) |
| `0.2s` (sem easing custom) | `.nav__links a` (hover de cor) |
| `1s var(--ease)` | `.galeria__item` (`clip-path`, reveal) |
| `1.2s var(--ease)` | `.galeria__item img` (`transform: scale`, hover) |
| `1.8s infinite ease-in-out` | `@keyframes scrollcue` (indicador de scroll do hero) |

Curva custom: `--ease: cubic-bezier(0.16, 1, 0.3, 1)` (perfil "ease-out expo"), usada em 3 das 5 transições — é a curva de assinatura do projeto.

### Bordas
- Espessura padrão: `1px`. Cor padrão: `var(--line)` (`rgba(242,236,224,0.12)`), usada em cards (`.pilar__shot`, `.depoimento`, `.plano`) e no botão ghost (estado default: `1px solid transparent`).
- Exceção de cor: `.plano--destaque` usa `border-color: var(--copper)` para destacar o plano principal.

---

## 5. Textura e atmosfera

- **Sem** ruído/grão, **sem** `mix-blend-mode`, **sem** `background-blend-mode`, **sem** vinheta em CSS puro.
- `backdrop-filter: blur(6px)` no `.nav` (`css/style.css:108`) — efeito de vidro fosco atrás do menu fixo.
- Gradientes usados para atmosfera (não como textura de fundo estática):
  - `.nav`: `linear-gradient(to bottom, rgba(5,5,5,0.85), transparent)` — fade do menu para transparente
  - `.btn--solid`: `linear-gradient(135deg, var(--copper), var(--gold-aged))` — botão principal
  - `.plano--destaque`: `linear-gradient(160deg, rgba(193,121,63,0.08), transparent)` — leve tingimento de cobre no card em destaque
  - `.cta-final`: `radial-gradient(ellipse at center, var(--graphite-2), var(--black))` — vinheta radial de fundo na seção final
- **O elemento de atmosfera dominante não é CSS — é uma sequência de 120 frames JPEG** (`assets/frames/frame_0001.jpg` … `frame_0120.jpg`, ~8.8M no total) desenhada em `<canvas>` e sincronizada ao scroll via GSAP `ScrollTrigger` (`js/main.js`). O comentário no código indica origem: `ffmpeg -i video.mp4 -vf fps=24`, 15fps × 8s. Há também um `.mp4` fonte (`assets/video/hero-caderno-tablet.mp4`, 4M) que **não é usado diretamente via `<video>`** — não há tag `<video>` no HTML; ele parece ser o material bruto do qual os frames foram extraídos.
- Reveal de galeria via `clip-path: circle(0% → 75%)` (`css/style.css:325-329`) — técnica de "íris" no scroll-into-view, não é textura, mas é uma assinatura de movimento do projeto.
- Smooth scroll via Lenis + easing customizado (`duration: 1.1`, easing exponencial em `js/main.js`).

---

## 6. Ativos

| Arquivo | Tamanho | Papel |
|---|---|---|
| `assets/frames/frame_0001.jpg` … `frame_0120.jpg` | ~89KB cada, 8.8M total | Sequência de animação do hero (canvas scroll-driven) |
| `assets/video/hero-caderno-tablet.mp4` | 4.0M | Vídeo-fonte dos frames acima; não referenciado no HTML |
| `assets/img/hero-maquina.jpg` | 99K | Fallback estático do hero (usado por JS se os frames não carregarem) |
| `assets/img/placeholder-screenshot.png` | 5.9K | Placeholder reaproveitado 4× na seção "O sistema" — **não é print real do produto** (comentário no HTML confirma) |
| `assets/img/barbeiro-corte.jpg` | 255K | Galeria — conceitual, gerado por IA |
| `assets/img/galeria-*.jpg` (7 arquivos: aperto-de-mao, bancada, cadeira, casa-cheia, espelho, navalha, toalha-quente) | 210K–405K cada | Galeria — conceituais, gerados por IA (aviso explícito no HTML) |
| `assets/img/galeria-corte-degrade.jpg` | 213K | **Órfão** — existe no diretório mas não é referenciado em nenhum lugar do `index.html` `[dedução: sobra de iteração anterior]` |
| `js/vendor/gsap.min.js`, `ScrollTrigger.min.js`, `lenis.min.js` | 72K, 43K, 13K | Bibliotecas vendorizadas, não são ativos visuais |

Não há logo em arquivo (SVG/PNG): o logo é texto puro (`Garagem` + `<span>System</span>` em cobre), sem nenhum ícone associado. Não há favicon declarado no `<head>`. Não há ícones (SVG sprite ou fonte de ícones) no projeto.

---

## 7. Comparação com o sistema (`src/index.css`)

O `src/index.css` deste projeto tem 7 linhas: apenas um bloco `@theme` do Tailwind v4 com 4 cores. Não define tipografia, radius ou sombra centralmente — esses aspectos, se existirem, estão espalhados em classes Tailwind dentro dos componentes, fora do escopo deste arquivo. A comparação abaixo reflete só o que está de fato declarado.

| Aspecto | Landing | Sistema (`src/index.css`) | Convergem? |
|---|---|---|---|
| Cor de fundo | `--black` `#050505` (quase preto puro) | `--color-industrial-dark` `#121212` | Parcial — mesma família (dark near-black), hex diferente |
| Cor de destaque | `--copper` `#c1793f` + `--gold-aged` `#a68a52` (par cobre/ouro) | `--color-copper` `#b87333`, `--color-copper-light` `#da8a47`, `--color-gold-aged` `#c5b358` | Parcial — mesmo conceito (cobre + ouro), nenhum hex é igual |
| Fonte de título | Fraunces (serif display, pesos 500/600) | Não definida — sem `@font-face`/import, cai no default do Tailwind (sans do sistema operacional) | Não |
| Fonte de corpo | Space Grotesk | Não definida — mesmo default | Não |
| Border-radius padrão | 4px predominante (2px em botões/tags) | Não definido centralmente | Indeterminado |
| Estilo de sombra | Nenhum `box-shadow` (flat, só bordas `1px` + 1 `text-shadow` pontual) | Não definido centralmente | Indeterminado |

### Quem deve ceder

Regra de desempate do comando: cor e tipografia seguem a landing; densidade, contraste e alvo de clique seguem o sistema.

- **Cor de fundo e cor de destaque:** o sistema deve adotar os hex exatos da landing (`#050505`/`#0e0d0c` de fundo, `#c1793f`/`#a68a52` de destaque) em vez dos valores próprios atuais — hoje divergem em todos os pares, mesmo com conceito igual.
- **Tipografia:** o sistema precisa importar Fraunces + Space Grotesk (e opcionalmente JetBrains Mono para labels) — hoje não tem nenhuma fonte customizada, então diverge 100%.
- **Border-radius e sombra:** sem token central no sistema hoje para comparar. `[dedução]` provavelmente convém adotar os mesmos valores da landing (4px/2px, sem box-shadow) como ponto de partida, ajustando apenas se a densidade de UI do sistema (telas de uso prolongado, mais compactas) exigir alvos de clique maiores que os botões da landing.

---

## 8. Viabilidade de monorepo

**VIÁVEL COM AJUSTE.**

A landing não tem `package.json`, bundler nem framework — é HTML/CSS/JS estático com bibliotecas vendorizadas manualmente. O sistema é Vite 7 + React 19 + Tailwind 4. Para unificar:
1. Introduzir tooling de build do lado da landing (mínimo: um `package.json` e tratá-la como um segundo "app" estático dentro do monorepo, ex. `apps/landing/` servido como está, sem virar React), **ou**
2. Portar a landing para Vite/React para compartilhar 100% do pipeline — viável porque a lógica (canvas + GSAP ScrollTrigger + Lenis) é vanilla JS, portável para um componente React sem reescrita profunda, mas é trabalho real, não é "mover pasta".

Em qualquer caminho, o que se compartilha sem atrito hoje é só o CSS de tokens (cores/fontes/radius) — não há acoplamento de bundler para resolver ali.

---

*Documento gerado por auditoria automatizada em 2026-08-10. Nenhum arquivo dentro de `LANDING PAGE GARAGEM` foi modificado.*
