---
description: "Conclui o replay, ACLs, testes e lint da Fase 2D.1 no stack temporário saudável já iniciado sem Storage."
---

# /financeiro-validar-stack-temporario-aporte-2d-1

## Contexto obrigatório

O stack temporário saudável `gfinreplay2d1` já está ativo em:

- API: `http://127.0.0.1:54521`
- PostgreSQL: `127.0.0.1:54522`
- Studio: `http://127.0.0.1:54523`
- workdir: `C:\tmp\garagem-financeiro-replay-2d1-20260827-001`

Storage, imgproxy e vector estão explicitamente excluídos. Não executar `supabase start` novamente e não tocar no stack principal em 544xx.

## Escopo

Concluir somente a validação financeira da migration `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql` contra o banco temporário. Não acessar produção, criar commit, aplicar deploy, editar arquivos do repositório principal, mudar `.env` ou usar o banco principal.

## Pré-checagem

1. Confirmar por `supabase status` no workdir temporário que API, Postgres, Auth e Kong estão saudáveis nas portas 545xx e que os três serviços de Storage continuam excluídos.
2. Confirmar por `supabase status` no repositório principal que ele permanece ativo em 544xx.
3. Confirmar que a conexão de todo comando SQL aponta para `127.0.0.1:54522`, nunca para 54422 ou um host remoto.

## Replay completo

1. Executar uma única vez `supabase db reset --local --no-seed` no workdir temporário.
2. Confirmar que as nove migrations foram aplicadas em ordem até `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql`.
3. Não criar seed, admin persistente ou fixtures fora dos scripts transacionais.

## Auditoria local de contrato

Com consultas somente leitura no Postgres temporário, confirmar:

- função `financeiro_aportar_envelope(uuid,numeric,text,text)` existe;
- é `SECURITY DEFINER` com `search_path = public, auth`;
- `authenticated` tem exatamente 28 RPCs financeiras públicas, incluindo o aporte;
- `anon` e `PUBLIC` não executam RPC financeira alguma;
- helpers internos, idempotência, auditoria e tabelas financeiras não possuem grants diretos ao browser;
- a razão de envelopes aceita `aporte_avulso` apenas como crédito sem distribuição, conta a pagar ou estorno associados;
- os triggers append-only continuam habilitados.

## Testes

1. Executar contra o banco temporário, com `ON_ERROR_STOP`, os cinco scripts SQL transacionais existentes. Todos devem completar com `ROLLBACK`.
2. Executar a suíte JavaScript pura.
3. Para os testes de concorrência/integracao que conectam ao banco, passar URL e credenciais temporárias somente por variáveis de processo da invocação. Não editar `.env`/`.env.local` nem conectar ao principal. Se o runner não puder ser provado como temporário, não o execute e registre o motivo.
4. Executar `supabase db lint --local --level error` no workdir temporário.
5. Rodar lint dos arquivos financeiros alterados e `git diff --check` somente para verificação; não criar ou alterar arquivos.

## Retorno

Depois das validações, parar apenas o stack temporário pelo workdir temporário. Confirmar que o principal continua íntegro nas portas 544xx, com `config.toml` sem diff e administrador local inalterado. Preservar o workdir temporário.

## Relatório

Entregar `Relatório /financeiro-validar-stack-temporario-aporte-2d-1` com resultados do reset, migrations, contrato/ACLs, cada teste, lint, testes não executados e motivo, estado final do principal e confirmação de zero acesso remoto.

Registrar explicitamente a limitação: Storage não foi iniciado nem validado; esta é uma validação de banco financeiro.

Não criar commit. Após sucesso, aguardar auditoria humana e aprovação para versionamento.
