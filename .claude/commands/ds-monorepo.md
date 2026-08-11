---
description: Consolida a landing page e o sistema num monorepo com tokens compartilhados — dry-run por padrão
argument-hint: "<caminho absoluto da landing> [--executar]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*), Bash(cp:*), Bash(mkdir:*), Bash(ls:*), Bash(find:*), Bash(cat:*), Bash(du:*), Bash(npm:*)
---

# /ds-monorepo — Consolidação em monorepo

Une a landing (`$ARGUMENTS`) e este sistema num único repositório com tokens compartilhados.

## Modo de operação

**Sem a flag `--executar`, este comando é dry-run.** Ele apresenta o plano completo, com os comandos exatos que rodaria e os arquivos que criaria, e **não escreve absolutamente nada**. É o modo padrão e deve ser sempre o primeiro a rodar.

Só execute de fato se `$ARGUMENTS` contiver `--executar`.

## Portões de segurança — pare se qualquer um falhar

1. **Backup da landing.** A pasta em `$ARGUMENTS` existe só nesta máquina. Antes de qualquer coisa:
   ```bash
   cp -r "<landing>" "<landing>.backup-$(date +%Y%m%d-%H%M%S)"
   ```
   Confirme que o backup existe e tem o mesmo número de arquivos. **Sem backup confirmado, não prossiga.**

2. **Git limpo neste projeto.** Se `git status --porcelain` retornar algo, pare e peça commit ou stash.

3. **Branch dedicada.** `git checkout -b chore/monorepo`. Nunca faça isso na branch principal.

4. **A landing tem `.git` próprio?** Verifique com `ls -a`.
   - Se **não tiver**: copie a pasta normalmente (histórico não existe, nada a preservar).
   - Se **tiver**: pare e avise. Copiar por cima descarta o histórico. Nesse caso o caminho correto é `git subtree add`, e você deve pedir confirmação explícita antes.

5. **Compatibilidade.** Leia `docs/design-system/AUDITORIA-LANDING.md`. Se o veredicto de monorepo for "NÃO RECOMENDADO", pare e explique. Se o arquivo não existir, pare e mande rodar `/ds-landing` antes.

## Estrutura alvo

```
garagem/
├── apps/
│   ├── landing/
│   └── system/
├── packages/
│   └── brand/
│       ├── package.json
│       ├── tokens.css
│       └── texture.css
├── docs/design-system/
├── package.json          ← workspaces
└── .gitignore
```

## Fase 1 — Mover o sistema

Use `git mv` para tudo, **nunca** `mv` — o histórico precisa sobreviver.

Vão para `apps/system/`: `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `postcss.config.js`, `eslint.config.js`, `.env*`, `tailwind.config.js` se ainda existir.

Ficam na raiz: `docs/`, `.git/`, `.gitignore`, `README.md`, `.claude/`.

Depois de mover:
- Confira se algum caminho quebrou: imports com `../`, `index.html` apontando para `/src/main.jsx`, referências em `vite.config.js`
- Rode `npm install` e `npm run build` dentro de `apps/system` e confirme que passa
- **Commit isolado desta fase**, antes de tocar na landing

## Fase 2 — Trazer a landing

```bash
mkdir -p apps/landing
cp -r "<landing>/." apps/landing/
rm -rf apps/landing/node_modules apps/landing/dist apps/landing/.git
```

Depois:
- Confira se veio `.env` com segredo. Se veio, garanta que está no `.gitignore` antes do primeiro `git add`
- `git add apps/landing && git commit`
- Rode o build da landing e confirme que passa
- **Não delete a pasta original.** Ela fica onde está até tudo estar verificado e no GitHub

## Fase 3 — Workspaces

Crie o `package.json` da raiz com `workspaces: ["apps/*", "packages/*"]` e o `private: true`.

Antes de unificar dependências, compare as versões de React, Vite e Tailwind dos dois apps.
- **Se divergirem**: não force o alinhamento agora. Deixe cada app com as suas e registre a divergência. Alinhar versão é mudança de risco, e não é o objetivo deste comando.
- Se o gerenciador de pacotes da landing for diferente (pnpm/yarn), converta para npm e delete o lockfile antigo.

Rode `npm install` na raiz. Confirme que os dois apps ainda buildam.

## Fase 4 — Pacote de marca

Crie `packages/brand/` com:
- `package.json` — nome `@garagem/brand`, `private: true`, com `exports` para os arquivos CSS
- `tokens.css` — **por enquanto vazio, apenas com um comentário de placeholder.** O conteúdo real vem do `DESIGN-SYSTEM.md` aprovado, via `/ds-fundacao`. Não invente tokens aqui.
- `texture.css` — mesmo tratamento

Adicione a dependência `@garagem/brand: "*"` nos dois apps e o `@import` no CSS de entrada de cada um. Verifique que o Tailwind v4 resolve o import do node_modules (pode precisar de `@source` ou caminho relativo — teste, não presuma).

## Fase 5 — Verificação final

1. `npm run build` nos dois apps — ambos passam
2. `git log --oneline` — o histórico do sistema sobreviveu ao `git mv`
3. `git status` — nada de `.env`, `node_modules` ou `dist` rastreado
4. Compare a contagem de arquivos de `apps/landing` com o backup

## Fase 6 — Relatório

Escreva `docs/design-system/MONOREPO.md` e imprima no terminal:

- Estrutura final em árvore
- Divergências de versão que ficaram pendentes
- **Instruções manuais para a Vercel**, que você não pode executar:
  - Criar/ajustar dois projetos apontando para o mesmo repositório
  - `Root Directory` = `apps/landing` e `apps/system`
  - Ignored Build Step em cada um: `git diff --quiet HEAD^ HEAD -- ./`
  - Reconferir as variáveis de ambiente de cada projeto
- Lembrete de que o backup e a pasta original da landing continuam no disco e só devem ser apagados depois do push confirmado

## Não faça

- Não delete a pasta original da landing nem o backup
- Não faça push. O usuário decide quando
- Não altere código de aplicação — este comando só move arquivos e cria configuração
- Não faça upgrade nem downgrade de dependência
- Não crie CI, Turborepo, Nx ou qualquer ferramenta extra
- Não escreva tokens de verdade no `packages/brand` — isso é trabalho do `/ds-fundacao`
