---
description: "Gera backup lógico privado antes do deploy do aporte avulso em envelopes (Fase 2D.1), sem alterar produção."
---

# /financeiro-backup-aporte-avulso-2d-1

## Destino obrigatório

Usar exclusivamente:

```text
E:\Backups\garagem-system\pre-deploy-aporte-avulso-2d1-2026-08-27
```

Antes de iniciar, confirmar que a unidade é privada, local, não sincronizada e recuperável. A pasta deve ser nova; se já existir, parar sem reutilizar, substituir ou apagar qualquer backup anterior.

## Escopo

Gerar somente backup lógico do projeto Supabase vinculado `wzgtqduivvdfeskpmopq`. Esta etapa não autoriza migrations, `db push`, SQL de alteração, repair, seed, deploy, commit, push ou qualquer modificação de produção.

Não exibir no relatório conteúdo dos dumps, connection strings, tokens ou hashes completos.

## Procedimento

1. Confirmar o projeto vinculado, que a pasta ainda não existe e há espaço livre suficiente na unidade `E:`.
2. Criar a pasta somente depois dessas validações.
3. Gerar os cinco artefatos separados, pelo padrão de backups anteriores:

```text
roles.sql
schema.sql
data.sql
history_schema.sql
history_data.sql
```

Usar a CLI Supabase vinculada e os comandos adequados de dump para roles, schema/dados PostgreSQL e schema/dados de `supabase_migrations`. Não incluir nem revelar credenciais além do que a ferramenta produzir por padrão.

4. Confirmar que os cinco arquivos existem, não estão vazios e calcular SHA-256 localmente. Não publicar hashes nem conteúdo dos arquivos no chat.
5. Não alterar nenhum arquivo dentro do repositório.

## Relatório obrigatório

Entregar `Relatório /financeiro-backup-aporte-avulso-2d-1` com:

- destino e confirmação de que fica fora do repositório;
- tamanho de cada arquivo, sem hashes;
- cobertura: roles, schema, dados, histórico de migrations e Storage;
- observação explícita de que Supabase Storage não é coberto por este backup lógico, se aplicável;
- confirmação de que nenhuma alteração foi feita em produção;
- pedido de confirmação humana de que o backup está privado e recuperável antes do dry-run.
