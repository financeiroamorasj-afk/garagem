---
description: "Audita via MCP, em modo somente leitura, o estado real da fundação financeira e informa exatamente o que foi aplicado ou ainda falta aplicar."
---

# /financeiro-auditar-migrations

## Objetivo

Auditar o banco Supabase conectado por MCP para descobrir o estado **real** da
Fase 1 financeira após execuções manuais no SQL Editor. Este comando não cria,
altera, remove, aplica migration, concede acesso nem executa qualquer SQL de
escrita. Use exclusivamente consultas `SELECT` a catálogos e metadados.

Não trate o histórico de migrations como fonte única de verdade: uma query
executada manualmente pode ter alterado o schema sem registrar migration. O
relatório deve comparar histórico **e** objetos existentes.

## Pré-condição

Confirme que o MCP do Supabase aponta para o projeto Garagem correto. Se não
for possível identificar o projeto ou não houver ferramenta MCP de leitura de
banco disponível, pare e informe isso; não tente usar credenciais, arquivos
`.env`, chave de serviço ou comandos de escrita como alternativa.

## Consultas obrigatórias (todas somente leitura)

Execute as consultas abaixo pelo MCP, uma por vez. Se uma visão não existir na
instância, registre a indisponibilidade e use a próxima consulta equivalente;
não conclua que um objeto está ausente só porque a primeira consulta falhou.

### 1. Histórico de migrations, se exposto

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260824130000', '20260824133000')
ORDER BY version;
```

### 2. Tabelas financeiras existentes

```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_habilitado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'financeiro_categorias', 'financeiro_contas_bancarias',
    'financeiro_contas_pagar', 'financeiro_contas_receber',
    'financeiro_movimentacoes', 'financeiro_creditos_clientes',
    'financeiro_creditos_movimentacoes', 'financeiro_audit_log'
  )
ORDER BY c.relname;
```

### 3. Colunas e constraints essenciais

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name LIKE 'financeiro_%'
ORDER BY table_name, ordinal_position;
```

```sql
SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text LIKE 'financeiro_%'
ORDER BY tabela, conname;
```

### 4. Policies RLS e permissões diretas

```sql
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'financeiro_%'
ORDER BY tablename, policyname;
```

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'financeiro_%'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;
```

### 5. RPCs, definição e permissões

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'financeiro_assert_admin', 'financeiro_auditar',
    'financeiro_pagar_conta', 'financeiro_receber_conta',
    'financeiro_transferir', 'financeiro_credito_movimentar'
  )
ORDER BY p.proname;
```

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       grantee, privilege_type
FROM information_schema.routine_privileges rp
JOIN pg_proc p ON p.proname = rp.routine_name
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'financeiro_%'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY p.proname, grantee;
```

### 6. Índices de idempotência e isolamento

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'financeiro_%'
ORDER BY tablename, indexname;
```

## Critérios de interpretação

- **Aplicada por completo:** oito tabelas, RLS habilitado em todas, policies de
  leitura/admin, seis funções, permissões corretas e índices esperados.
- **Parcial:** informe cada objeto ausente separadamente e em que ponto a
  execução provavelmente parou. Por exemplo: tabelas existem, mas uma RPC não
  existe porque foi executado apenas o corpo após `RETURNS`.
- **Insegura:** interrompa a liberação da Fase 2 se `anon` tiver permissão de
  escrita, se houver tabela sem RLS, ou se RPCs privilegiadas forem executáveis
  por `anon`/`PUBLIC`.
- **Histórico divergente:** se os objetos existirem mas não aparecerem em
  `schema_migrations`, registre "aplicada manualmente; migration ainda não
  registrada". Não tente corrigir o histórico automaticamente.

## Formato de resposta

```
## Auditoria /financeiro-auditar-migrations

### Conexão
[projeto confirmado / indisponível]

### Histórico vs estado real
[cada migration: registrada, aplicada manualmente, parcial ou ausente]

### Tabelas e RLS
[checklist de 8 tabelas, barbearia_id, RLS e policies]

### RPCs e permissões
[checklist das 6 funções, SECURITY DEFINER esperado e quem pode executá-las]

### Índices e integridade
[FITID, idempotência, FKs e constraints]

### Próxima ação segura
[apenas o bloco SQL completo que falta executar, identificado por arquivo e
início/fim; ou "nada a executar". Nunca sugira linhas soltas.]

### Bloqueios para Fase 2
[sim/não e motivo]
```

## Proibições

- Não execute `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `INSERT`, `UPDATE`,
  `DELETE`, `TRUNCATE`, `db push`, `db reset` ou qualquer outra escrita.
- Não aplique migration, não modifique a tabela de histórico e não tente
  "consertar" o banco durante a auditoria.
- Não use chaves de serviço, não leia arquivos de ambiente e não exponha
  segredos.
