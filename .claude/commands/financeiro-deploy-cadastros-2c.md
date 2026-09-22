---
description: "Publica a migration aprovada de cadastros Fase 2C e exige auditoria pós-deploy somente leitura."
---

# /financeiro-deploy-cadastros-2c

## Autorização registrada

O responsável autorizou o deploy real após dry-run aprovado. Projeto único
permitido: `wzgtqduivvdfeskpmopq`. Backup disponível em
`E:\Backups\garagem-system\pre-deploy-cadastros-2c-2026-08-25`.

## Regras

- Execute somente a migration `20260825120000_financeiro_cadastros_fase_2c.sql`.
- Não use SQL Editor, `migration repair`, `db reset`, `--include-all` ou
  `--include-seed`.
- Não faça alterações de UI, dados reais ou outros schemas.
- Se a CLI indicar outra migration, projeto ou erro inesperado, pare sem tentar
  correção manual.

## Deploy

1. Avise uma breve janela de manutenção administrativa e confirme o projeto:

```powershell
npx supabase projects list
npx supabase migration list --linked
```

2. Somente se o ref for o aprovado e apenas a migration 2C estiver pendente,
execute:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
```

3. O histórico final deve estar alinhado e não pode haver migration financeira
pendente. Não considere aviso de cache local como falha se a listagem remota
confirmar a versão aplicada.

## Auditoria obrigatória pós-deploy

Não conecte os formulários à UI ainda. Execute `/financeiro-auditar-migrations`
em modo MCP somente leitura e confirme:

- `20260825120000` registrada;
- índice de nomes normalizados ativos para contas e categorias;
- tabela `financeiro_idempotencia` com RLS e sem grants diretos;
- 17 RPCs financeiras executáveis apenas por `authenticated`;
- `anon` e `PUBLIC` sem execução;
- helpers internos fechados;
- novas RPCs de escrita e leitura de cadastro com `SECURITY DEFINER` e
  `search_path` fixo;
- isolamento entre barbearias, FKs e audit log preservados.

## Relatório

```
## Relatório /financeiro-deploy-cadastros-2c

### Aplicação
[versão aplicada e histórico alinhado]

### Auditoria pós-deploy
[ACLs, RLS, RPCs e isolamento; somente leitura]

### Backup
[destino preservado]

### Próxima ação segura
[aprovar a UI de criação/edição em localhost]
```
