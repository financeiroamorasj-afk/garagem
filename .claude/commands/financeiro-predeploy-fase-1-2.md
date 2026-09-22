---
description: "Audita e planeja, sem escrever em produção, a reconciliação das migrations financeiras e o deploy seguro da Fase 1.1."
---

# /financeiro-predeploy-fase-1-2

## Objetivo

Produzir um plano de pré-deploy para levar a Fase 1.1 financeira à produção
sem reaplicar objetos já criados manualmente nem editar tabelas de histórico
por SQL. Esta fase é estritamente de leitura e planejamento: não aplicar
migration, não executar `migration repair`, não rodar `db push`, não alterar
configuração, dados ou permissões de produção.

## Contexto confirmado

- Produção tem objetos equivalentes às migrations `20260824130000` e
  `20260824133000`, aplicados manualmente e ausentes de
  `supabase_migrations.schema_migrations`.
- A Fase 1.1 (`20260824150000`) foi validada apenas no Supabase local e não
  está aplicada em produção.
- O frontend não pode depender das RPCs de leitura da Fase 1.1 até que o
  deploy seja reconciliado e aprovado.

## Parte 1 — Inventário local, sem escrita

1. Liste as migrations locais em ordem e calcule hashes SHA-256 dos três
   arquivos financeiros:
   - `20260824130000_financeiro_fase_1.sql`
   - `20260824133000_corrige_ledger_taxa_recebimento.sql`
   - `20260824150000_financeiro_fase_1_1_integridade.sql`
2. Leia os três arquivos por completo e faça um mapa de objetos esperados:
   tabelas, constraints, índices, RLS, policies, RPCs e privilégios.
3. Mostre o estado do Git e identifique mudanças não relacionadas. Não crie
   commit nesta fase.

## Parte 2 — Auditoria remota via MCP, somente leitura

Confirme que o MCP Supabase está conectado ao projeto Garagem de produção e
use somente `SELECT` para coletar:

1. Versões em `supabase_migrations.schema_migrations`.
2. Definição de todas as tabelas/colunas/constraints/índices `financeiro_*`.
3. RLS, policies, grants de tabela e permissões efetivas das funções.
4. Corpo e assinatura de todas as RPCs `financeiro_*`.
5. Anti-joins de referências entre barbearias e duplicidade de chaves de
   idempotência, FITID ou conta principal.
6. Existência ou ausência específica de cada objeto da Fase 1.1: FKs
   compostas, índice de idempotência de crédito, assinatura nova de crédito e
   as duas RPCs de leitura.

Não exponha dados pessoais, valores financeiros ou segredos no relatório:
reporte apenas contagens, nomes de objetos e IDs mascarados quando necessário.

## Parte 3 — Matriz de reconciliação

Para cada uma das três migrations, classifique com evidência:

- `equivalente e apta para marcar como aplicada`;
- `parcial ou divergente`;
- `ausente e apta para aplicar`;
- `bloqueada`.

Uma migration só pode ser indicada como "apta para marcar como aplicada" se
**todos** os objetos, definições de funções e privilégios forem equivalentes ao
arquivo local. Não trate simples existência de tabela como equivalência.

## Parte 4 — Plano de deploy proposto, sem executar

Monte o plano em etapas, com pontos explícitos de aprovação:

1. **Proteção:** confirmar backup/restauração disponível ou, se o plano do
   Supabase não fornecer backup sob demanda, registrar esse risco e exigir uma
   janela de manutenção/backup lógico aprovado antes de qualquer escrita.
2. **Reconciliação de histórico:** somente se as duas migrations manuais forem
   equivalentes, propor o uso da ferramenta oficial `supabase migration repair`
   para marcá-las como aplicadas. Nunca propor `INSERT` manual em
   `schema_migrations`.
3. **Deploy da Fase 1.1:** somente após o histórico estar reconciliado, propor
   aplicar `20260824150000` pela CLI oficial em uma etapa separada.
4. **Validação pós-deploy:** auditoria MCP de leitura, verificações de RLS,
   permissões de RPC e smoke test autenticado, sem inserir dados reais.
5. **Rollback:** descrever a estratégia antes do deploy. Se a migration tiver
   operações não reversíveis, exigir backup confirmado e plano de migration
   corretiva; nunca sugerir rollback por exclusão de dados.

Para cada comando sugerido, rotule-o como `NÃO EXECUTAR AINDA` e diga o efeito
exato. Não mostre um comando de escrita sem o checkpoint de aprovação humana
imediatamente antes dele.

## Critérios de bloqueio

Pare e marque como bloqueado se houver:

- objeto manual divergente das migrations locais;
- grants para `anon`/`PUBLIC`, RLS ausente ou RPC privilegiada exposta;
- referência cruzada entre barbearias;
- migrations locais fora da ordem ou mudanças não revisadas que afetem o
  deploy;
- ausência de estratégia de backup/recuperação aprovada.

## Formato do relatório

```
## Relatório /financeiro-predeploy-fase-1-2

### Estado local
[migrations, hashes, Git]

### Estado de produção
[objetos e segurança, sem dados sensíveis]

### Matriz de reconciliação
[uma classificação e evidência por migration]

### Plano proposto — NÃO EXECUTADO
[etapas, comandos rotulados e checkpoints]

### Riscos / decisões necessárias
[backup, divergências, janela e aprovações]

### Pronto para deploy?
[sim/não e condição exata]
```
