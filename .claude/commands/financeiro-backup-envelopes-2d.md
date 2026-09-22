---
description: "Gera backup lógico privado antes do deploy dos envelopes Fase 2D, sem alterar produção."
---

# /financeiro-backup-envelopes-2d

## Destino obrigatório

Usar exclusivamente:

```text
E:\Backups\garagem-system\pre-deploy-envelopes-2d-2026-08-26
```

Antes de iniciar, confirmar que a unidade é privada, local, não sincronizada e recuperável. A pasta deve ser nova; se já existir, parar sem reutilizar ou sobrescrever nada.

## Escopo

Gerar somente backup lógico do projeto Supabase vinculado `wzgtqduivvdfeskpmopq`. Não executar migrations, `db push`, SQL, repair, seed, deploy, commit ou push.

Não exibir no relatório conteúdos dos dumps, connection strings, tokens ou hashes completos.

## Procedimento

1. Confirmar projeto vinculado, pasta nova e espaço disponível.
2. Criar a pasta apenas depois das validações.
3. Gerar os cinco artefatos separados, conforme o padrão de backups anteriores:

```text
roles.sql
schema.sql
data.sql
history_schema.sql
history_data.sql
```

Usar a CLI Supabase vinculada e os comandos de dump adequados para roles, schema/dados PostgreSQL e schema/dados de `supabase_migrations`. Não incluir credenciais nos arquivos além do que a própria ferramenta produzir por padrão.

4. Confirmar que todos os cinco arquivos existem, não estão vazios e calcular SHA-256 localmente. Não publicar hashes nem conteúdo no chat.
5. Não alterar arquivos dentro do repositório.

## Relatório obrigatório

Entregar `Relatório /financeiro-backup-envelopes-2d` com:

- destino e confirmação de que fica fora do repositório;
- tamanho de cada arquivo, sem hashes;
- cobertura: roles, schema, dados, histórico de migrations e Storage;
- observação explícita de que Supabase Storage não é coberto por este backup lógico, se aplicável;
- confirmação de que nenhuma alteração foi feita em produção;
- pedido de confirmação humana de que o backup está privado e recuperável antes do dry-run.

