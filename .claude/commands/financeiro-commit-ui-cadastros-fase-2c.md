---
description: "Cria commit exclusivo da integração visual dos cadastros financeiros Fase 2C, sem incluir alterações alheias."
---

# /financeiro-commit-ui-cadastros-fase-2c

## Objetivo

Versionar somente a integração aprovada da tela de Cadastros financeiros com as RPCs já publicadas da Fase 2C. Não fazer push e não alterar banco, migrations, permissões ou dados remotos.

## Arquivos autorizados

O commit pode conter exclusivamente estes arquivos, se estiverem alterados:

```text
src/pages/financeiro/FinanceRegistrations.jsx
src/lib/financeiro/cadastros-ui.js
tests/financeiro-cadastros-ui.test.js
tests/financeiro-cadastros-integracao-local.test.js
```

Não incluir comandos em `.claude/commands`, alterações de design system, campos monetários, autenticação, agendamento, package files, migrations ou qualquer outro arquivo do worktree.

## Procedimento obrigatório

1. Verificar o índice e a integridade antes de preparar o commit:

```powershell
git diff --check
git diff --cached --check
git status --short
```

Se já existir algo no índice, parar e informar os arquivos; não limpar, restaurar ou alterar o índice de outra pessoa.

2. Confirmar que todos os quatro arquivos autorizados existem e revisar seu diff. A tela deve continuar usando somente wrappers/RPCs e não pode conter acesso direto a `financeiro_*`:

```powershell
$arquivos = @(
  'src/pages/financeiro/FinanceRegistrations.jsx',
  'src/lib/financeiro/cadastros-ui.js',
  'tests/financeiro-cadastros-ui.test.js',
  'tests/financeiro-cadastros-integracao-local.test.js'
)
$arquivos | ForEach-Object { if (-not (Test-Path $_)) { throw "Arquivo esperado ausente: $_" } }
git diff -- $arquivos
rg -n "\.from\(['\"]financeiro_|service_role|SUPABASE_SERVICE" $arquivos
```

Se a última busca retornar resultado fora de textos de teste explicitamente negativos, parar e corrigir antes de versionar.

3. Validar antes do commit:

```powershell
npm test -- --runInBand
npm run lint
npm run build
git diff --check
```

Se houver falha preexistente fora dos quatro arquivos, relatar com evidência e não escondê-la. Se os comandos completos forem impraticáveis, executar pelo menos os testes financeiros e o lint dos arquivos autorizados, registrando a limitação.

4. Adicionar somente os quatro caminhos explícitos e verificar rigorosamente o conteúdo do índice:

```powershell
git add -- `
  src/pages/financeiro/FinanceRegistrations.jsx `
  src/lib/financeiro/cadastros-ui.js `
  tests/financeiro-cadastros-ui.test.js `
  tests/financeiro-cadastros-integracao-local.test.js

git diff --cached --name-only
git diff --cached --check
git diff --cached
```

O conjunto exibido deve ser exatamente igual à lista autorizada. Se houver qualquer arquivo adicional ou ausente, parar; não usar `git add .`, `git add -A`, `git commit -a`, reset ou checkout.

5. Criar o commit local, sem push:

```powershell
git commit -m "feat(financeiro): integra cadastros seguros fase 2c"
git show --stat --oneline --summary HEAD
git status --short
```

## Resultado esperado

Relatar hash, assunto, lista exata de arquivos no commit, resultado das validações e confirmação de que nenhuma alteração alheia foi staged, modificada, enviada ao remoto ou aplicada ao Supabase.

