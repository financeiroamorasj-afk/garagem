---
description: "Gera um backup lógico local do Supabase antes do deploy financeiro, sem alterar produção e sem salvar segredos ou backups no Git."
---

# /financeiro-backup-logico

## Objetivo

Gerar uma cópia lógica local do banco de produção Garagem System antes do
deploy financeiro. O comando só lê o banco; não aplica migration, não altera
dados, não executa `db push`, `migration repair`, `db pull` ou `db reset`.

## Antes de começar

1. Peça ao Rafa uma pasta de destino **fora do repositório e fora de pastas
   sincronizadas/publicadas**, por exemplo um disco externo ou uma pasta privada
   de backup. Não crie o backup dentro do Git.
2. Confirme que há espaço livre suficiente e que a pasta não será enviada pelo
   WhatsApp, anexada em chat ou commitada.
3. Informe que o Supabase pode pedir duas credenciais diretamente no terminal:
   um token pessoal para login do CLI e a senha do banco para conectar. Nunca
   peça essas credenciais no chat, não grave em `.env`, não as inclua em comando
   e não as imprima no relatório.

## Execução

1. Confirme a versão com `npx supabase --version`. Se o terminal solicitar
   instalar temporariamente a CLI, explique o motivo e aguarde a autorização do
   Rafa antes de aceitar.
2. Autentique o CLI pelo fluxo que ele solicitar. Se precisar de token pessoal,
   Rafa deve criá-lo na conta Supabase e colá-lo apenas no prompt local.
3. Vincule o projeto usando o ref conhecido `wzgtqduivvdfeskpmopq`. A senha do
   banco deve ser digitada somente no prompt local.
4. Defina uma variável de sessão com o caminho explícito aprovado pelo Rafa,
   por exemplo `$backupDestino`. Não use `$HOME` nem grave dentro do repositório.
5. Gere os cinco arquivos abaixo usando `--linked`:

```powershell
npx supabase db dump --linked --role-only -f "$backupDestino\roles.sql"
npx supabase db dump --linked -f "$backupDestino\schema.sql"
npx supabase db dump --linked --data-only --use-copy -f "$backupDestino\data.sql"
npx supabase db dump --linked --schema supabase_migrations -f "$backupDestino\history_schema.sql"
npx supabase db dump --linked --schema supabase_migrations --data-only --use-copy -f "$backupDestino\history_data.sql"
```

6. Valide apenas metadados dos arquivos: presença, tamanho maior que zero e
   SHA-256. Não abra nem mostre dados de clientes, agendamentos, vendas ou
   credenciais no relatório.
7. Peça que Rafa copie a pasta de backup para o local privado escolhido e
   confirme que ela pode ser recuperada antes de aprovar o deploy.

## Limites importantes

- Esse backup cobre o banco PostgreSQL; objetos do Supabase Storage não entram
  nele. Se houver arquivos no Storage em uso, registre que um backup separado
  dos objetos é necessário antes de qualquer restauração completa.
- Não teste restauração na produção. Uma restauração só pode ser testada em um
  projeto separado e após autorização explícita.
- Não exponha strings de conexão, token pessoal, senha do banco, conteúdo dos
  dumps ou hashes de dados sensíveis no chat.

## Formato do relatório

```
## Relatório /financeiro-backup-logico

### Destino
[pasta confirmada como fora do Git, sem revelar conteúdo sensível]

### Arquivos gerados
[somente nomes, tamanhos e SHA-256]

### Cobertura
[schema, dados, roles e histórico; Storage incluído? sim/não]

### Resultado
[backup concluído / bloqueio e motivo]

### Próximo checkpoint
[confirmação humana de que o backup está guardado e recuperável]
```
