---
description: "Completa localmente as leituras seguras e erros claros do contrato de cadastros Fase 2C, sem UI ou produção."
---

# /financeiro-corrigir-contrato-cadastros-2c

## Objetivo

Corrigir o bloqueio da auditoria humana da Fase 2C antes do pré-deploy.
Altere somente a migration ainda não publicada `20260825120000`, os wrappers e
testes financeiros relacionados. Não crie uma migration adicional, UI, rota,
dado real ou alteração remota.

## Problema confirmado

As sete RPCs de escrita exigem `p_expected_updated_at`, mas as listagens
existentes não retornam versão (`updated_at`) nem registros inativos. A futura
interface não conseguiria editar, desativar/reativar ou resolver conflito de
edição com segurança.

## Correção 1 — Duas RPCs de leitura de cadastro

Inclua na mesma migration:

```sql
financeiro_listar_contas_bancarias_cadastro(
  p_incluir_inativas boolean default false
) returns table (...)

financeiro_listar_categorias_cadastro(
  p_incluir_inativas boolean default false
) returns table (...)
```

Requisitos obrigatórios:

- `SECURITY DEFINER SET search_path = public, auth`;
- chamar `financeiro_assert_admin()` e derivar a barbearia exclusivamente no
  banco;
- `p_incluir_inativas` só aceita boolean não nulo;
- sem paginação nesta fase, pois os cadastros são listagens administrativas
  pequenas; ordenar deterministicamente por atividade, nome normalizado e ID;
- contas retornam somente: id, nome, instituicao, tipo, saldo_inicial,
  conta_principal, ativa e updated_at;
- categorias retornam somente: id, nome, tipo, grupo_dre, ativa e updated_at;
- nunca retornar `barbearia_id`, audit log, idempotência ou dados de outra
  barbearia;
- `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`, depois `GRANT EXECUTE`
  somente a `authenticated`.

As listagens antigas da Fase 1.1 permanecem intactas e seguem servindo às
telas de leitura simples.

## Correção 2 — Erros claros de nome ativo

Garanta que criação, edição e reativação de conta/categoria devolvam erro
financeiro estável e orientável, por exemplo
`FINANCEIRO_NOME_ATIVO_EM_USO`, quando houver conflito de nome normalizado
ativo. Não confie apenas no texto nativo de unique constraint.

O tratamento precisa continuar correto sob concorrência: faça pré-validação
quando útil, mas capture o `unique_violation` do índice parcial em blocos de
exceção e converta apenas a violação dos índices financeiros criados nesta
migration. Outros erros devem continuar abortando a transação.

## Correção 3 — Cliente e testes

1. Adicione wrappers mínimos para as duas novas leituras em
   `src/lib/financeiro/api.js`, validando que `incluirInativas` é booleano.
   Não conecte UI.
2. Atualize todos os testes de ACL para esperar exatamente 17 RPCs públicas
   para `authenticated`: oito da Fase 2B, sete de escrita 2C e duas leituras de
   cadastro. `anon` e `PUBLIC` continuam com zero.
3. Amplie os testes SQL transacionais para comprovar:
   - admin de A vê apenas A;
   - `false` retorna apenas ativos e `true` inclui ativos/inativos;
   - `updated_at` e campos necessários vêm no contrato, sem `barbearia_id`;
   - UUID/tenant alheio não aparece;
   - `anon` e não-admin não executam as duas RPCs;
   - conflitos de criação, edição e reativação retornam o erro financeiro
     claro, inclusive em cenário concorrente quando aplicável;
   - tabelas, idempotência e audit log continuam inacessíveis diretamente.
4. Atualize testes JavaScript e qualquer teste concorrente necessário.

## Validação

- Aplique/reaplique somente no Supabase local.
- Rode todas as suites SQL financeiras, todos os testes JS, lint dos arquivos
  alterados, `git diff --check` e build.
- Preserve mudanças fora do escopo e não faça commit.

## Relatório

```
## Relatório /financeiro-corrigir-contrato-cadastros-2c

### Correções
[duas leituras, wrappers e erros claros]

### Segurança e contrato
[campos retornados, tenant, ACL e tabelas fechadas]

### Verificação local
[migration, testes, lint, diff e build]

### Fora do escopo
[sem UI, produção ou dados reais]

### Próximo checkpoint
[nova auditoria humana antes de predeploy]
```
