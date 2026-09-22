---
description: "Repete o replay financeiro 2D.1 em Supabase temporário com portas exclusivas, sem interromper o stack local principal."
---

# /financeiro-replay-isolado-portas-aporte-2d-1

## Objetivo

Executar uma única validação completa das migrations financeiras em um Supabase local temporário isolado, mantendo o stack principal `garagem-system` ativo.

Workdir temporário obrigatório:

`C:\tmp\garagem-financeiro-replay-2d1-20260827-001`

Não alterar o repositório principal, `.env`, `.env.local`, volumes, credenciais, dados locais existentes, produção, Git, migrations ou código de produto.

## Pré-checagem

1. Confirmar que o workdir temporário existe e não contém `.env`, `.env.local`, `.git`, `node_modules` ou dados do projeto principal.
2. No repositório principal, registrar somente leitura:
   - hash SHA-256 e `git diff -- supabase/config.toml`;
   - `supabase status`;
   - portas já ocupadas pelo stack principal.
3. Confirmar que o principal continua saudável nas portas 54420–54429 antes de iniciar o temporário.
4. Confirmar que nenhum container temporário do projeto `gfinreplay2d1` está ativo.
5. Checar explicitamente que todas as portas temporárias abaixo estão livres, tanto no Windows quanto em containers Docker. Se alguma estiver ocupada, parar e reportar; não escolher portas diferentes sem atualizar o relatório.

## Configuração temporária exclusiva

Editar **somente** `C:\tmp\garagem-financeiro-replay-2d1-20260827-001\supabase\config.toml`, usando patch explícito, para:

```toml
project_id = "gfinreplay2d1"

[api]
port = 54521

[db]
port = 54522
shadow_port = 54520
health_timeout = "5m"

[db.pooler]
port = 54529

[studio]
port = 54523
api_url = "http://127.0.0.1:54521"

[inbucket]
port = 54524

[analytics]
port = 54527

[edge_runtime]
inspector_port = 8183
```

Manter `storage.vector.enabled = true`, configuração de Storage, versão de banco e todas as demais opções idênticas ao arquivo temporário original. Não editar o `config.toml` principal.

## Inicialização e diagnóstico

1. Subir uma única vez o stack temporário pelo workdir temporário, com health check normal. É proibido usar `--ignore-health-check`.
2. Comparar, somente leitura, as imagens/digests Docker de Storage do principal e do temporário. Se forem diferentes, registrar a diferença; não forçar tag, pull ou downgrade manual.
3. Se o temporário ficar unhealthy:
   - coletar status, health logs e logs finais de Storage, imgproxy, db, auth e kong;
   - informar se houve timeout, incompatibilidade ou outra falha observável;
   - parar somente os containers temporários;
   - confirmar que o principal continua saudável;
   - encerrar sem reset, testes, commit ou deploy.
4. Se o temporário ficar saudável, prosseguir automaticamente para o replay abaixo.

## Replay e testes — somente se saudável

No workdir temporário:

1. Executar `supabase db reset --local --no-seed` apontando explicitamente à cópia temporária.
2. Confirmar que as nove migrations foram aplicadas em ordem até `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql`.
3. Usando somente a conexão local temporária, confirmar:
   - assinatura `financeiro_aportar_envelope(uuid,numeric,text,text)`;
   - `SECURITY DEFINER` e `search_path = public, auth`;
   - 28 RPCs públicas financeiras para `authenticated`;
   - zero para `anon` e `PUBLIC`;
   - tabelas, idempotência, audit log e helpers fechados ao browser.
4. Executar os cinco testes SQL transacionais com `ON_ERROR_STOP` e `ROLLBACK`, inclusive `financeiro_fase_2d_1.sql`.
5. Executar testes JavaScript e concorrência configurados para o banco temporário; não usar credenciais do ambiente principal.
6. Executar `supabase db lint --local --level error` no workdir temporário.

## Retorno seguro

Ao final, parar somente o stack temporário e preservar seu workdir. Confirmar que o stack principal permaneceu ativo, com mesmo hash de `config.toml`, mesmas portas, mesmo admin local e zero containers temporários.

## Relatório

Entregar `Relatório /financeiro-replay-isolado-portas-aporte-2d-1` com:

- portas e projeto temporário comprovadamente isolados;
- status/versão/digest do Storage principal e temporário;
- resultado do health check;
- migrations, ACLs, testes e lint, caso o stack tenha ficado saudável;
- estado final do stack principal;
- confirmação de zero acesso a produção;
- próximos passos: auditoria humana se aprovado, ou diagnóstico de infraestrutura se bloqueado.

Não criar commit, backup, dry-run ou deploy.
