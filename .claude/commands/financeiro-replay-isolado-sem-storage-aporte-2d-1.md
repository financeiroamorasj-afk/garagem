---
description: "Valida migrations financeiras 2D.1 em Supabase temporário sem Storage, usando exclusão oficial da CLI."
---

# /financeiro-replay-isolado-sem-storage-aporte-2d-1

## Objetivo autorizado

Validar o banco financeiro e a Fase 2D.1 em stack temporário isolado, excluindo exclusivamente os serviços de Storage que estão instáveis no Windows.

Usar a opção oficial da Supabase CLI:

`supabase start --exclude storage-api,imgproxy,vector`

ou a forma curta equivalente `-x storage-api,imgproxy,vector`.

Essa validação prova migrations, Postgres, Auth, API, ACLs, RLS, transações e concorrência. Ela **não** valida upload, bucket, transformação ou retenção de imagens; esses itens ficam explicitamente fora do escopo e precisarão de teste próprio quando a frente de fotos iniciar.

## Isolamento obrigatório

Usar exclusivamente:

`C:\tmp\garagem-financeiro-replay-2d1-20260827-001`

com o `project_id = "gfinreplay2d1"` e as portas temporárias já aprovadas (`54520–54529`, inspector `8183`).

Não alterar o repositório principal, `.env`, `.env.local`, volumes, Docker global, credenciais, dados existentes, Git ou produção. Não parar o stack principal e não usar `--linked`, `supabase link`, SQL Editor ou qualquer conexão remota.

## Pré-checagem somente leitura

1. Confirmar que o principal está saudável nas portas 544xx e registrar hash/diff vazio de `C:\Users\Ruch\Desktop\garagem-system\supabase\config.toml`.
2. Confirmar que as portas 54520–54529 e 8183 estão livres e não existem containers temporários ativos.
3. Confirmar que o workdir temporário não contém credenciais, `.env`, `.git`, `node_modules` ou dados do principal.
4. Confirmar que a configuração temporária continua com portas exclusivas e `storage.vector.enabled = true`; a exclusão ocorrerá apenas pelo comando de inicialização, não por edição permanente do recurso.

## Inicialização sem Storage

1. Iniciar uma única vez o stack temporário com health check normal e exclusão explícita de `storage-api,imgproxy,vector`.
2. Não usar `--ignore-health-check`.
3. Confirmar que PostgreSQL, Auth, Kong/API e PostgREST estão saudáveis; confirmar que os três serviços excluídos não foram iniciados por decisão explícita.
4. Se qualquer serviço financeiro necessário ficar unhealthy, coletar logs do temporário, parar apenas o temporário e encerrar sem reset/teste/deploy.

## Replay financeiro — somente se saudável

1. Executar `supabase db reset --local --no-seed` apontando explicitamente ao workdir temporário.
2. Confirmar no histórico temporário que todas as nove migrations aplicaram em ordem, até `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql`.
3. Validar por consultas locais temporárias:
   - assinatura `financeiro_aportar_envelope(uuid,numeric,text,text)`;
   - `SECURITY DEFINER` e `search_path = public, auth`;
   - 28 RPCs financeiras públicas para `authenticated`;
   - zero RPCs financeiras para `anon` e `PUBLIC`;
   - tabelas financeiras, idempotência, audit log e helpers sem grants diretos ao browser.
4. Rodar os cinco testes SQL transacionais com `ON_ERROR_STOP` e `ROLLBACK`, incluindo `financeiro_fase_2d_1.sql`, contra o banco temporário.
5. Rodar os testes JavaScript puros. Para testes de integração/concorrência que escrevem no banco, apontar a conexão temporariamente ao Postgres/API da porta 54522/54521 por variáveis de processo; não editar `.env` nem deixar variáveis persistentes. Se algum runner não puder ser direcionado comprovadamente ao temporário, não executá-lo contra o principal: registrar como não executado.
6. Rodar `supabase db lint --local --level error` no workdir temporário.

## Retorno seguro

1. Parar somente containers temporários pelo workdir temporário.
2. Confirmar que o principal continua em execução, com mesmo hash de config, mesmas portas e mesmo admin local.
3. Preservar o workdir temporário para inspeção. Não apagar imagens, volumes, containers de outro projeto ou arquivos.

## Relatório

Entregar `Relatório /financeiro-replay-isolado-sem-storage-aporte-2d-1` contendo:

- prova de isolamento de projetos/portas;
- serviços iniciados e excluídos;
- resultado do reset, migrations, ACLs, RLS, testes SQL, concorrência, testes JavaScript e lint;
- qualquer teste não executado e motivo;
- estado final do principal;
- confirmação de zero acesso a produção;
- limitação explícita: Storage não validado nesta etapa.

Não criar commit, backup, dry-run ou deploy. Após sucesso, aguardar auditoria humana da migration antes do versionamento.
