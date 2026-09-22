---
description: BLOQUEADOR — gera a migration com as RLS policies que faltam em produção (RLS habilitado, zero policies, acesso negado por padrão via chave anon). Usa rls_setup.sql como base, valida contra o schema real via live query.
---

# /rls-emergencial-fundacao

## Contexto e urgência

O `/schema-operacional-fundacao` descobriu que `barbearias`, `clientes`, `servicos`, `agendamentos`, `vendas_produtos`, `vendas`, `contas_receber`, `movimentacoes_financeiras` têm RLS habilitado (`ENABLE ROW LEVEL SECURITY`) mas **nenhuma policy aplicada**. Isso significa acesso negado por padrão via chave anon — o app não consegue ler nem escrever nessas tabelas hoje, independente de qualquer outra coisa que construamos.

Este comando gera a migration de correção **para revisão**, não aplica sozinho — mas trate como prioridade máxima de review, é bloqueador de produção.

---

## Parte 1 — Validar contra o schema real (não confiar cegamente no rls_setup.sql)

1. Rode live query (`information_schema` / `pg_policies`) pra confirmar, tabela por tabela, quais das 8 realmente não têm nenhuma policy hoje — o relatório anterior já levantou isso, mas confirme de novo antes de gerar a migration, o estado pode ter mudado.
2. Para as tabelas que o `rls_setup.sql` já cobre (`barbearias`, `profiles`, `profissionais`, `clientes`, `servicos`, `agendamentos`, `vendas_produtos`), compare as policies escritas no arquivo com os nomes de coluna reais do schema de produção (ex: `rls_setup.sql` foi escrito antes de sabermos que `agendamentos` usa `data_hora`, `valor_final`, `cliente_nome_manual` — confirme que as policies não referenciam nome de coluna errado).
3. `vendas`, `contas_receber`, `movimentacoes_financeiras` **NÃO estão no `rls_setup.sql`** (são as tabelas clonadas do Rebip, schema `tenant_id`, 0 linhas, incompatíveis com o padrão `barbearia_id`). **Não gere policy pra elas neste comando** — aplicar uma policy baseada em `barbearia_id` numa tabela que tem `tenant_id` não faz sentido, e essas tabelas têm decisão de arquitetura pendente (dropar e recriar, ou adaptar) que pertence ao `/financeiro-migrar`, não aqui. Deixe RLS habilitado sem policy nelas mesmo (nega tudo por padrão, é o estado seguro) e documente isso explicitamente no relatório.
4. `produtos` (criada no `/schema-operacional-fundacao`) já foi relatada com policies aplicadas seguindo o padrão de `profissionais` — confirme que isso é verdade via `pg_policies`, não assuma.

## Parte 2 — Gerar a migration

1. Crie `supabase/migrations/<timestamp>_rls_policies_emergencial.sql`.
2. Para cada tabela das 7 cobertas (excluindo as 3 do Rebip), gere as policies usando o padrão `DROP POLICY IF EXISTS "nome" ON tabela; CREATE POLICY "nome" ON tabela ...;` — **Postgres não suporta `CREATE POLICY IF NOT EXISTS`**, então o padrão `DROP + CREATE` é o jeito correto de deixar a migration re-executável com segurança, sem duplicar nem falhar numa segunda rodada.
3. Baseie o conteúdo das policies no `rls_setup.sql` existente (ele já foi escrito com a lógica certa — `get_my_barbearia_id()`, `get_my_role()` — só nunca foi aplicado), ajustando apenas nomes de coluna que divergirem do schema real confirmado na Parte 1.
4. Cubra pelo menos: SELECT (ver dados da própria barbearia), INSERT/UPDATE/DELETE (mesma regra, com restrição extra de role onde o `rls_setup.sql` já define isso — ex: só admin edita `barbearias`).

## O que NÃO fazer

- Não aplicar a migration contra o banco.
- Não criar policy para `vendas`, `contas_receber`, `movimentacoes_financeiras`.
- Não alterar o schema de nenhuma tabela (isso já foi feito no `/schema-operacional-fundacao`) — este comando é só policies.
- Não tentar corrigir o bug do `AddAppointmentModal.jsx` (colunas erradas no insert) — fora de escopo aqui, é um comando separado de correção de frontend.

## Formato do relatório

```
## Relatório /rls-emergencial-fundacao

### Confirmação real (live query)
[tabela por tabela: tinha policy ou não, antes desta migration]

### Migration gerada
[caminho do arquivo + SQL completo]

### Tabelas deliberadamente fora desta migration
vendas, contas_receber, movimentacoes_financeiras — motivo: schema incompatível (tenant_id), decisão pendente no /financeiro-migrar

### Riscos ou dúvidas
[qualquer divergência encontrada entre rls_setup.sql e o schema real]
```
