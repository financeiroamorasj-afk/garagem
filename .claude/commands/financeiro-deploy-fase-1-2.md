---
description: "Reconcilia com segurança as migrations financeiras já aplicadas e publica a Fase 1.1 somente após uma prévia aprovada."
---

# /financeiro-deploy-fase-1-2

## Objetivo

Publicar a fundação financeira Fase 1.1 no Supabase de produção do Garagem
System, sem reaplicar SQL que já foi executado manualmente e sem expor as RPCs
financeiras a `anon` ou `PUBLIC`.

## Autorizações e fatos já confirmados

- Projeto alvo: `wzgtqduivvdfeskpmopq` (Garagem System).
- O backup lógico privado foi concluído em
  `E:\Backups\garagem-system\pre-deploy-2026-08-24`.
- O responsável confirmou que a unidade é privada, local e acessível para
  recuperação.
- Há uma janela de manutenção agora. Avise antes de escrever no banco para que
  ninguém faça operações administrativas durante o procedimento.
- As migrations `20260824130000`, `20260824133000` e `20260824140000` já foram
  aplicadas manualmente e auditadas como equivalentes no banco de produção,
  porém não estão no histórico remoto.
- A migration `20260824150000` ainda não foi aplicada em produção.

## Regras inegociáveis

- Não use SQL Editor, `INSERT` em `schema_migrations`, `db reset`,
  `--include-all` ou `--include-seed`.
- Não revele senha, token, string de conexão, conteúdo do backup ou dados de
  clientes.
- Não prossiga se o projeto vinculado não for exatamente o ref acima.
- Não prossiga se `migration list` indicar uma situação diferente da esperada,
  se houver migration financeira inesperada pendente ou se a prévia contiver
  algo além da versão `20260824150000`.

## Etapa 1 — Pré-verificação, somente leitura

1. No terminal aberto em `C:\Users\Ruch\Desktop\garagem-system`, confirme a
   versão da CLI e o vínculo usando somente:

```powershell
npx supabase --version
npx supabase projects list
npx supabase migration list --linked
```

2. Confira que `migration list --linked` mostra:
   - baseline `20260818180000` alinhada;
   - `20260824130000`, `20260824133000` e `20260824140000` ausentes somente do
     lado remoto;
   - `20260824150000` pendente somente do lado remoto;
   - nenhuma outra versão financeira inesperada.

3. Confira a presença e os hashes dos quatro arquivos abaixo, sem exibir seus
   conteúdos no relatório:

```powershell
Get-FileHash supabase\migrations\20260824130000_financeiro_fase_1.sql -Algorithm SHA256
Get-FileHash supabase\migrations\20260824133000_corrige_ledger_taxa_recebimento.sql -Algorithm SHA256
Get-FileHash supabase\migrations\20260824140000_financeiro_restringe_execucao.sql -Algorithm SHA256
Get-FileHash supabase\migrations\20260824150000_financeiro_fase_1_1_integridade.sql -Algorithm SHA256
```

4. Mostre `git status --short` e `git diff --check`. O worktree possui mudanças
   alheias: não inclua nenhuma delas.

5. Antes de qualquer escrita remota, pause e informe resumidamente o resultado
   da pré-verificação. Peça confirmação explícita para iniciar a reconciliação
   do histórico. Se houver divergência, pare.

## Etapa 2 — Versionar somente as migrations financeiras

Após a confirmação da Etapa 1, revise o diff somente destes quatro arquivos e
faça um commit exclusivo, sem adicionar diretórios nem arquivos extras:

```powershell
git diff --no-index -- /dev/null supabase/migrations/20260824130000_financeiro_fase_1.sql
git diff --no-index -- /dev/null supabase/migrations/20260824133000_corrige_ledger_taxa_recebimento.sql
git diff --no-index -- /dev/null supabase/migrations/20260824140000_financeiro_restringe_execucao.sql
git diff --no-index -- /dev/null supabase/migrations/20260824150000_financeiro_fase_1_1_integridade.sql
git add -- supabase/migrations/20260824130000_financeiro_fase_1.sql supabase/migrations/20260824133000_corrige_ledger_taxa_recebimento.sql supabase/migrations/20260824140000_financeiro_restringe_execucao.sql supabase/migrations/20260824150000_financeiro_fase_1_1_integridade.sql
git commit -m "feat(financeiro): adiciona fundacao e integridade fase 1.1"
```

Se algum desses arquivos já estiver versionado, use `git diff --` para ele e
inclua-o no mesmo commit apenas se corresponder à revisão aprovada. Se o commit
falhar, não execute nenhum comando remoto; relate o motivo.

## Etapa 3 — Reconciliação do histórico remoto

Após o commit e uma segunda confirmação explícita, execute **somente**:

```powershell
npx supabase migration repair 20260824130000 20260824133000 20260824140000 --status applied --linked
npx supabase migration list --linked
```

Efeito: a primeira linha altera exclusivamente o histórico remoto para marcar
as três migrations já equivalentes como aplicadas; ela não executa o SQL delas.

Pare se a listagem posterior não deixar apenas `20260824150000` pendente do
lado remoto.

## Etapa 4 — Prévia obrigatória do deploy

Execute:

```powershell
npx supabase db push --linked --dry-run
```

A saída aceitável deve listar exclusivamente
`20260824150000_financeiro_fase_1_1_integridade.sql`. Mostre apenas as versões
e os nomes das migrations, sem segredos. Pause e peça aprovação explícita para
o deploy real. Se a saída for diferente, pare sem aplicar nada.

## Etapa 5 — Deploy da Fase 1.1

Somente após a aprovação da Etapa 4, execute:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
```

O resultado esperado é não haver migrations financeiras pendentes. Não faça
nenhuma outra alteração de schema nesta sessão.

## Etapa 6 — Auditoria pós-deploy, somente leitura

Use o MCP Supabase em modo somente leitura e valide:

- as cinco migrations (baseline e as quatro financeiras) estão registradas;
- as oito tabelas `financeiro_*` têm RLS e continuam sem grants diretos para
  `anon`, `authenticated` ou `PUBLIC`;
- não há RPC financeira executável por `anon` ou `PUBLIC`;
- `authenticated` executa exatamente: `financeiro_pagar_conta`,
  `financeiro_receber_conta`, `financeiro_transferir`, a nova
  `financeiro_credito_movimentar` e as duas RPCs controladas de leitura;
- helpers internos continuam fechados;
- existem as FKs compostas, a chave/índice de idempotência de crédito, a nova
  assinatura de crédito e as RPCs `financeiro_listar_categorias` e
  `financeiro_listar_contas_bancarias`;
- não há referências entre barbearias em registros existentes.

Não faça smoke test que crie dados reais. Ao final, informe que as telas da
Fase 2B podem ser planejadas, ainda sujeitas a uma nova aprovação visual.

## Recuperação

Não tente rollback destrutivo. Caso a Etapa 5 apresente falha após o commit da
migration, interrompa o uso administrativo do financeiro, preserve a saída,
execute a auditoria de leitura e proponha uma migration corretiva. A
restauração do backup lógico só pode ser feita com decisão operacional
explícita, em um projeto separado para teste ou com indisponibilidade aprovada.
