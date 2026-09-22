---
description: "Implementa e valida localmente as RPCs seguras de cadastros financeiros da Fase 2C, sem UI ou produção."
---

# /financeiro-implantar-contrato-cadastros-fase-2c

## Objetivo

Criar uma migration local e testes para tornar seguros os cadastros de contas
bancárias e categorias financeiras. Não altere UI, rotas, telas, Supabase
remoto ou dados reais. Não execute `db push`, SQL Editor ou `migration repair`.

## Decisões aprovadas

- Saldo inicial negativo é permitido somente com confirmação explícita na UI
  futura; a RPC aceita valor numérico finito, arredondado a centavos.
- Categoria com histórico não pode ter nome, tipo ou grupo DRE alterados:
  deve ser desativada e substituída.
- Nomes normalizados são únicos somente entre registros ativos, para contas e
  categorias.
- A primeira conta ativa da barbearia torna-se principal automaticamente.
- `configuracao_repasse` não faz parte da Fase 2C.

## Pré-verificação

Leia completamente as migrations financeiras existentes, schema real local,
testes e `src/lib/financeiro`. Descubra as listas já permitidas de tipo de
conta, tipo de categoria e grupo DRE; não invente valores. Verifique se a
estrutura existente possui `updated_at`, FKs e a regra de conta principal.

Preserve todas as alterações alheias do worktree. Use Supabase/PostgreSQL
local; se não estiver disponível, pare e informe o bloqueio sem recorrer à
produção.

## Migration nova

Crie uma única migration transacional, posterior a `20260824160000`, contendo
somente o contrato abaixo.

### 1. Idempotência interna

Crie uma tabela financeira interna, sem grants a browser, para registrar
intenção idempotente de criação. Ela deve conter no mínimo:

- `barbearia_id`, nome da operação, `idempotency_key`, hash do payload e
  resposta JSON;
- timestamps e chave/índice único por `(barbearia_id, operacao,
  idempotency_key)`;
- RLS ativo e nenhuma policy/grant que permita leitura/escrita direta por
  `anon` ou `authenticated`;
- FKs/índices adequados ao isolamento.

Mesmo idempotency key com payload diferente deve falhar. Use lock transacional
por barbearia/operação/chave antes da consulta/inserção para tratar
concorrência. Não guarde dados pessoais desnecessários no payload persistido.

### 2. Integridade de nomes ativos

Adicione unicidade normalizada entre registros ativos, sem alterar histórico:

- normalização por `lower(btrim(nome))`;
- índice único parcial para contas ativas por barbearia;
- índice único parcial para categorias ativas por barbearia;
- trate cuidadosamente registros existentes antes de criar índices: se houver
  conflito, pare a migration com erro claro, sem resolver/renomear dados.

### 3. Sete RPCs

Implemente, com as assinaturas aprovadas:

```sql
financeiro_criar_conta_bancaria(
  p_nome text, p_instituicao text, p_tipo text, p_saldo_inicial numeric,
  p_idempotency_key text, p_correlation_id text default null
) returns jsonb

financeiro_editar_conta_bancaria(
  p_conta_id uuid, p_nome text, p_instituicao text, p_tipo text,
  p_expected_updated_at timestamptz, p_correlation_id text default null
) returns jsonb

financeiro_definir_conta_principal(
  p_conta_id uuid, p_correlation_id text default null
) returns jsonb

financeiro_definir_conta_ativa(
  p_conta_id uuid, p_ativa boolean,
  p_conta_substituta_id uuid default null, p_correlation_id text default null
) returns jsonb

financeiro_criar_categoria(
  p_nome text, p_tipo text, p_grupo_dre text, p_idempotency_key text,
  p_correlation_id text default null
) returns jsonb

financeiro_editar_categoria(
  p_categoria_id uuid, p_nome text, p_tipo text, p_grupo_dre text,
  p_expected_updated_at timestamptz, p_correlation_id text default null
) returns jsonb

financeiro_definir_categoria_ativa(
  p_categoria_id uuid, p_ativa boolean,
  p_correlation_id text default null
) returns jsonb
```

Todas devem:

- usar `SECURITY DEFINER SET search_path = public, auth`;
- chamar `financeiro_assert_admin()` e nunca receber `barbearia_id`;
- normalizar texto e validar limites: nome 2–100, instituição vazia vira NULL e
  máximo 100, correlation ID opcional máximo 200, idempotency key 8–200;
- retornar erro indistinguível para ID inexistente ou de outra barbearia;
- chamar `financeiro_auditar` com antes/depois e correlation ID;
- responder sem `barbearia_id` ou campos internos;
- revogar `PUBLIC`, `anon`, `authenticated` e conceder `EXECUTE` somente a
  `authenticated` depois da criação.

Regras específicas:

- criação de conta: primeira ativa vira principal, demais secundárias;
- edição de conta: somente nome, instituição e tipo; saldo inicial,
  principal, ativa, IDs, timestamps e configuração de repasse são imutáveis;
  rejeitar `updated_at` desatualizado;
- definir principal/ativa: lock por barbearia e linhas relevantes `FOR UPDATE`;
  nunca deixar duas principais, desativar última ativa, nem desativar principal
  sem substituta ativa válida na mesma transação;
- criação de categoria: tipo/grupo somente nas listas existentes, nome ativo
  normalizado único;
- edição de categoria: se houver referências históricas em títulos ou
  movimentações, bloquear qualquer alteração semântica;
- desativação de categoria com histórico é permitida; reativação falha se
  existir categoria ativa de mesmo nome normalizado.

Não modifique grants/RPCs existentes além de repetir, de maneira precisa, os
grants necessários para preservar as oito RPCs públicas já aprovadas.

## Cliente e testes

1. Adicione somente wrappers mínimos em `src/lib/financeiro/api.js` e
validações puras em `schemas.js`, se necessárias. Não conecte UI.
2. Crie testes SQL transacionais com `ROLLBACK` para todos os cenários:
   tenant cruzado, anon/PUBLIC, auth não-admin, criação idempotente e payload
   divergente, normalização de nomes, saldo negativo, conflito de versão,
   primeira/principal/última conta, concorrência de principal, desativação com
   substituta, categoria referenciada e auditoria.
3. Para testes realmente concorrentes, use duas conexões reais no PostgreSQL
local; chamadas sequenciais não são evidência suficiente.
4. Confirme que `authenticated` executa exatamente as quinze RPCs públicas:
   as oito existentes mais as sete novas. Helpers internos, tabela de
   idempotência, audit log e demais tabelas continuam fechados.
5. Aplique apenas no Supabase local, rode todos os testes existentes, lint dos
   arquivos alterados, `git diff --check` e build.

## Relatório

```
## Relatório /financeiro-implantar-contrato-cadastros-fase-2c

### Alterações
[migration, RPCs, wrappers e testes]

### Integridade e segurança
[tenant, ACLs, concorrência, idempotência e auditoria]

### Verificação local
[migration, testes SQL/JS, lint, diff e build]

### Fora do escopo
[sem UI, rotas, produção ou dados reais]

### Próximo checkpoint
[auditoria humana antes de predeploy]
```
