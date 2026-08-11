---
description: Migra uma tela ou componente do Garagem para o design system, sem alterar comportamento
argument-hint: "<arquivo ou pasta> — ex: src/pages/AdminDashboard.jsx"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm run build:*), Bash(npm run lint:*), Bash(git diff:*), Bash(git status:*)
---

# /ds-migrar — Migração de tela

Migra **um alvo por vez** para o design system: `$ARGUMENTS`

Se `$ARGUMENTS` estiver vazio, pare e peça o alvo. **Nunca migre o projeto inteiro de uma vez.**

## A regra que define este comando

> **Só muda a aparência. O comportamento fica idêntico.**

Nenhuma alteração em: estado, hooks, handlers, chamadas ao Supabase, props recebidas, rotas, condicionais de renderização, formato de dados, textos visíveis ao usuário.

Se durante a migração você achar que a lógica está errada ou mal escrita: **anote no relatório final e siga em frente**. Correção de lógica é outro trabalho.

## Pré-requisitos

1. `docs/design-system/DESIGN-SYSTEM.md` existe — é a lei.
2. `src/components/ui/` existe com os primitivos (rode `/ds-fundacao` antes).
3. `git status` limpo. Se não estiver, avise e pergunte antes de continuar.

## Passo 1 — Registrar o antes

Leia o arquivo inteiro. Antes de editar, produza um inventário:
- Todo elemento de UI e a className atual de cada um
- Quais desses já têm primitivo equivalente em `src/components/ui/`
- Quais não têm (candidatos a novo componente)
- Quais são realmente específicos desta tela (ficam inline, mas com tokens)

Mostre esse inventário e o **plano de substituição** antes de tocar em qualquer linha.

## Passo 2 — Substituir

Ordem de preferência, sempre nesta sequência:

1. **Existe primitivo?** Use o primitivo.
2. **Não existe, mas o padrão se repete em 2+ telas?** Pare, avise, e proponha criar o primitivo antes de continuar.
3. **É específico desta tela?** Mantenha inline, mas só com classes de token.

Enquanto substitui:
- Todo hex literal vira token.
- Toda classe de paleta padrão do Tailwind (`gray-`, `emerald-`, `red-`, `slate-`...) vira token semântico.
- Todo radius vira a escala da spec.
- Todo tamanho de fonte vira a escala da spec. Nada abaixo de 11px.
- Toda sombra vira a escala de elevação da spec.
- Toda transição vira as durações da spec.
- Ícones lucide: só os tamanhos que a spec permite.

## Passo 3 — Acessibilidade no caminho

Já que o arquivo está aberto, corrija sem alterar comportamento:
- `<label>` conectado ao input via `htmlFor`/`id`
- Botão que só tem ícone recebe `aria-label`
- Ordem de headings coerente (`h1` → `h2` → `h3`, sem pular nível)
- `focus-visible` visível em tudo que é focável
- Contraste dentro do mínimo da spec — se algum par ficar abaixo, use o token mais claro e registre a troca
- `window.confirm()` para exclusão: **mantenha por enquanto**, mas registre como pendência de UX

## Passo 4 — Verificar

1. `npm run build` passa
2. `npm run lint` sem erros novos
3. `git diff --stat` — se o diff estiver muito maior do que o esperado para uma troca de estilo, pare e explique por quê
4. Releia o próprio diff procurando por: handler removido, condicional alterada, prop perdida, texto mudado. **Se encontrar, reverta essa parte.**

## Passo 5 — Relatório

Imprima no terminal:

```
MIGRADO: <arquivo>

Substituições
  <elemento>  <className antiga>  →  <primitivo ou token>
  ...

Tokens novos necessários (se houver)
  <nome>  <motivo>  → precisa de aprovação antes de existir

Componentes que faltam
  <nome>  <onde apareceu>  <quantas vezes>

Pendências anotadas (não corrigidas)
  <lógica suspeita / UX / dado>

Verificação
  build: ok | lint: ok | diff: X arquivos, +Y −Z
  contraste mínimo desta tela: X:1
```

E anexe o mesmo relatório em `docs/design-system/MIGRACOES.md` (append, nunca sobrescreve).

## Não faça

- Não migre mais de um alvo por execução.
- Não crie token novo por conta própria — proponha e espere aprovação.
- Não instale dependência.
- Não renomeie variável, função ou arquivo.
- Não reordene imports ou reformate o arquivo inteiro — o diff precisa ser legível.
- Não altere texto de interface, mesmo com erro de português. Registre e siga.
