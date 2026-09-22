---
description: "Diagnostica somente a falha de saúde do Storage no Supabase local temporário, sem resetar bancos, volumes ou tocar produção."
---

# /financeiro-diagnosticar-storage-replay-2d-1

## Objetivo

Diagnosticar a falha `unhealthy` do Storage que bloqueou o replay isolado da Fase 2D.1, usando exclusivamente o workdir temporário:

`C:\tmp\garagem-financeiro-replay-2d1-20260827-001`

Não executar migration, `db reset`, teste financeiro, backup, operação remota, `supabase link`, `--linked`, SQL Editor, commit ou push.

O ambiente principal em `C:\Users\Ruch\Desktop\garagem-system` deve permanecer intacto e em execução.

## Pré-checagem somente leitura

1. Confirmar a existência do workdir temporário e que ele não é o repositório principal.
2. Confirmar que o temporário contém somente `supabase/config.toml`, migrations e testes; não pode conter `.env`, `.env.local`, `.git`, dados do stack principal ou `node_modules`.
3. No repositório principal, executar somente leitura:
   - `git diff -- supabase/config.toml`;
   - hash SHA-256 de `supabase/config.toml`;
   - `supabase status`;
   - listar containers Docker relacionados ao projeto principal.
4. Registrar portas do principal e confirmar que nenhum container temporário está ativo antes do diagnóstico.
5. Se o `config.toml` principal tiver sido alterado pela tentativa anterior, não restaurar ou editar automaticamente; mostrar o diff e parar para decisão humana.

## Diagnóstico isolado

1. Inspecionar Docker sem escrita: versão, espaço livre, estado dos containers e health logs existentes do Storage, imgproxy, pooler, db, auth e kong do projeto principal. Não reiniciar nem parar esses serviços nesta etapa.
2. No config do **temporário**, trocar somente o `project_id` para um identificador curto e exclusivo, por exemplo `gfinreplay2d1`, usando edição explícita e registrando o diff do arquivo temporário. Não tocar portas, secrets ou config do repositório principal.
3. Subir o stack temporário com health check normal, a partir do workdir temporário. Não usar `--ignore-health-check`.
4. Se o Storage ficar unhealthy, coletar somente leitura:
   - `supabase status` do temporário;
   - `docker inspect` do health status e últimas health logs do Storage;
   - últimos logs do Storage e dos seus serviços dependentes (imgproxy, db, kong e auth);
   - códigos HTTP de health endpoints locais, quando a CLI os informar;
   - portas em uso e espaço em disco.
5. Não rodar novamente a inicialização, não aplicar migrations manualmente e não modificar imagem/container/configuração Docker global.

## Correções permitidas e proibidas

Permitido apenas se a causa for objetiva e limitada ao workdir temporário:

- corrigir `project_id` curto do temporário;
- remover apenas containers temporários comprovadamente criados por esse workdir, sem volumes;
- reiniciar somente o stack temporário uma única vez após a correção documentada.

Proibido:

- `docker system prune`, remoção de volumes, `rm -rf`, reset de banco principal;
- alterar `supabase/config.toml` principal, `.env`, `.env.local` ou credenciais;
- usar `--ignore-health-check` como validação;
- corrigir o Storage por alteração de migration ou do código financeiro;
- acessar produção ou qualquer URL remota.

## Retorno seguro

Ao finalizar, parar apenas os containers temporários. Confirmar novamente que:

- o stack principal continua ativo nas portas originais;
- usuário/admin e dados locais principais não foram alterados;
- não existem containers temporários ativos;
- o workdir temporário continua preservado para inspeção.

## Resultado esperado

Entregar `Relatório /financeiro-diagnosticar-storage-replay-2d-1` com:

- diff/hash do config principal e confirmação de que não foi alterado;
- causa técnica observada, ou evidência suficiente de que a causa ainda é desconhecida;
- logs/health resumidos do Storage temporário;
- qualquer correção feita somente no temporário;
- estado final do stack principal;
- recomendação objetiva: repetir o replay isolado, corrigir infraestrutura local primeiro ou liberar uma validação alternativa explicitamente aprovada.

Não avançar para replay, commit ou deploy sem novo comando e aprovação humana.
