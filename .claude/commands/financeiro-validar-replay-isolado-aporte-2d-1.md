---
description: "Valida todas as migrations financeiras até o aporte avulso em um Supabase local descartável, sem resetar o ambiente local principal."
---

# /financeiro-validar-replay-isolado-aporte-2d-1

## Objetivo

Comprovar que todas as migrations do repositório, incluindo `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql`, aplicam do zero em um ambiente Supabase local temporário e descartável.

O Supabase local principal não pode ser resetado, removido, ter usuário alterado ou perder credenciais. Produção não pode ser acessada. Não criar commit, push ou alteração de arquivo de produto.

## Pré-checagem obrigatória

Antes de qualquer escrita:

1. Confirmar que o diretório atual é `C:\Users\Ruch\Desktop\garagem-system`.
2. Confirmar que não há `--linked`, project ref, token, SQL Editor ou qualquer comando remoto na sequência.
3. Registrar `supabase status` do ambiente local principal e verificar que Docker está disponível.
4. Localizar o `supabase/config.toml` e a lista ordenada de migrations. Não alterar nenhum arquivo dentro do repositório principal.
5. Se não for possível garantir isolamento, parar e reportar sem executar reset algum.

## Ambiente temporário isolado

1. Criar uma pasta nova sob o diretório temporário do Windows, com nome único como `garagem-financeiro-replay-2d1-<timestamp>`.
2. Copiar para ela somente a configuração Supabase necessária, migrations e testes SQL. Não copiar `.env`, `.env.local`, `node_modules`, `.git`, dados locais, credenciais ou caches.
3. No `config.toml` **da cópia temporária**, definir um `project_id` exclusivo, por exemplo `garagem-financeiro-replay-2d1`.
4. Para não disputar portas com o stack principal, parar apenas os containers locais do projeto principal após registrar o estado, sem comandos destrutivos, sem `--no-backup` e sem remoção de volumes.
5. Subir o stack temporário nas portas padrão usando somente o diretório temporário como workdir. Confirmar pelo nome dos containers e pelo status que ele é o projeto temporário.
6. Se a inicialização temporária falhar, parar somente os recursos temporários criados, reiniciar o stack principal e reportar. Não tentar resetar o ambiente principal como alternativa.

## Replay e validação

No stack temporário:

1. Executar `supabase db reset --local --no-seed` apontando explicitamente ao workdir temporário.
2. Confirmar no histórico local temporário que todas as migrations foram aplicadas em ordem, até `20260827100000`.
3. Confirmar a existência e o contrato da nova RPC:
   - `financeiro_aportar_envelope(uuid,numeric,text,text)`;
   - `SECURITY DEFINER`;
   - `search_path = public, auth`;
   - `authenticated` executa 28 RPCs financeiras públicas;
   - `anon` e `PUBLIC` executam zero;
   - tabelas e helpers financeiros não possuem grants diretos ao browser.
4. Executar os cinco scripts SQL transacionais com `ON_ERROR_STOP`, incluindo `financeiro_fase_2d_1.sql`; todos devem terminar em `ROLLBACK`.
5. Executar os testes JavaScript e os testes de concorrência que não dependam de dados do ambiente principal.
6. Rodar `supabase db lint --local --level error` no workdir temporário.

## Retorno seguro

1. Parar somente o stack temporário pelo workdir temporário.
2. Reiniciar o stack local principal, exatamente como estava antes.
3. Confirmar que o status principal voltou a responder e que o usuário local/cadastro principal não foi recriado nem alterado.
4. Manter a pasta temporária para inspeção até o relatório final; não excluí-la automaticamente.

## Critérios de bloqueio

Parar sem realizar o replay se:

- o isolamento de pasta/projeto/containers não puder ser comprovado;
- a operação exigir reset, remoção de volume ou alteração no stack principal;
- houver qualquer tentativa de conexão remota;
- não for possível reiniciar o stack principal após uma tentativa temporária.

## Relatório

Entregar `Relatório /financeiro-validar-replay-isolado-aporte-2d-1` contendo:

- prova de que o replay ocorreu em workdir/projeto temporário;
- migrations aplicadas e resultado das validações;
- resultado das ACLs e assinatura da RPC;
- resultado dos testes e lint;
- status final do stack principal;
- caminho da pasta temporária preservada;
- confirmação de zero acesso ou alteração de produção.

Não criar commit. Após sucesso, aguardar auditoria humana da migration antes da etapa de versionamento e predeploy.
