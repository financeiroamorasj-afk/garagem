---
description: "Cria commit exclusivo do contrato e testes locais de envelopes Fase 2D, sem incluir alterações alheias."
---

# /financeiro-commit-contrato-envelopes-fase-2d

## Escopo aprovado

Criar somente um commit local, sem push, deploy, backup ou operação Supabase.

Arquivos autorizados exclusivamente:

```text
supabase/migrations/20260825130000_financeiro_envelopes_fase_2d.sql
supabase/tests/financeiro_fase_2d.sql
tests/financeiro-envelopes-concorrencia.test.js
supabase/tests/financeiro_fase_2b.sql
supabase/tests/financeiro_fase_2c.sql
```

Os dois últimos só podem conter atualização da contagem/validação de ACL para 27 RPCs públicas financeiras. Não incluir comandos, documentos, UI, package files, autenticação, design system, campos monetários ou mudanças alheias.

## Procedimento

1. Verificar que o índice está vazio. Se não estiver, parar sem limpá-lo:

```powershell
git diff --cached --name-only
git status --short
git diff --check
```

2. Revisar os arquivos autorizados. A migration não pode conceder tabelas ou helpers ao browser:

```powershell
$arquivos = @(
  'supabase/migrations/20260825130000_financeiro_envelopes_fase_2d.sql',
  'supabase/tests/financeiro_fase_2d.sql',
  'tests/financeiro-envelopes-concorrencia.test.js',
  'supabase/tests/financeiro_fase_2b.sql',
  'supabase/tests/financeiro_fase_2c.sql'
)
$arquivos | ForEach-Object { if (-not (Test-Path $_)) { throw "Arquivo esperado ausente: $_" } }
git diff -- $arquivos
rg -n "GRANT (ALL|SELECT|INSERT|UPDATE|DELETE).*ON TABLE.*financeiro|GRANT EXECUTE.*TO (anon|PUBLIC)" supabase/migrations/20260825130000_financeiro_envelopes_fase_2d.sql
```

Se a busca retornar grant perigoso, parar e corrigir antes do commit.

3. Reexecutar validações locais:

```powershell
npm test
npm run build
git diff --check
```

Relatar lint global preexistente, se continuar fora do escopo; não ocultá-lo.

4. Adicionar exclusivamente os cinco caminhos:

```powershell
git add -- supabase/migrations/20260825130000_financeiro_envelopes_fase_2d.sql supabase/tests/financeiro_fase_2d.sql tests/financeiro-envelopes-concorrencia.test.js supabase/tests/financeiro_fase_2b.sql supabase/tests/financeiro_fase_2c.sql
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

O índice deve conter exatamente os cinco arquivos autorizados. Se houver arquivo extra, ausente ou alteração não relacionada nos testes 2B/2C, parar. Nunca usar `git add .`, `git add -A`, `git commit -a`, `git reset` ou `git checkout`.

5. Criar apenas o commit local:

```powershell
git commit -m "feat(financeiro): adiciona envelopes seguros fase 2d"
git show --stat --oneline --summary HEAD
git status --short
```

## Resultado esperado

Informar hash, assunto, lista exata dos cinco arquivos, validações, estado do índice e confirmação de que nenhuma alteração fora do escopo foi incluída, revertida, enviada ou aplicada em produção.

