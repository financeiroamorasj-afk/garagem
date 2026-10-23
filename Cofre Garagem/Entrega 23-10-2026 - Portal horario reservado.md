# Entrega — horário reservado explícito no Portal

Data: 23/10/2026

## Objetivo

Retirar o atrito causado pela mensagem **Aguardando confirmação** depois que o cliente já escolheu e gravou um horário. O Portal agora comunica de forma direta que a reserva existe e que o intervalo está separado para o cliente.

## Implementação

- Os estados `pendente` e `confirmado` são apresentados no Portal como **Horário reservado**.
- O selo usa o tratamento visual positivo.
- O cartão mostra a mensagem permanente **Este horário já está reservado para você.**
- Registros antigos ainda classificados como `pendente` recebem a comunicação correta sem migração de dados.
- As regras de disponibilidade, conflito, cancelamento e operação da agenda não foram alteradas.

## Validação antes da publicação

- Worktree limpa criada a partir de `origin/main`.
- Dois testes direcionados aprovados: Portal do Cliente e Central de Avisos.
- ESLint dos arquivos alterados aprovado.
- Build de produção aprovado, permanecendo apenas o aviso conhecido sobre tamanho do bundle.
- Previews dos projetos `garagem-app` e `garagem-adm` concluídos com estado `Ready`.

## Publicação do frontend

- PR: `#81 — Portal: deixar horário reservado explícito`.
- Commit da implementação: `f075c41c3c0629dcd083670491fa1980771e0bad`.
- Commit de merge na `main`: `dce8e5f1f23b8f0b441c1134ac50acc6db19bb93`.
- Merge concluído em 23/10/2026 às 09:24, no horário de Brasília.
- Deploy de produção do `garagem-app`: `2f1SQXZW2X3LVtir3BF3Mf2c5ERw`.
- Deploy de produção do `garagem-adm`: `DRjAdAMn5HfnVRnjfYG6DJABH8Sc`.
- O domínio oficial respondeu com HTTP 200 e o bundle servido foi conferido diretamente.
- O bundle contém as duas novas mensagens e não contém **Aguardando confirmação**.

## Comunicado dentro dos aplicativos

- Migration: `20261023100000_portal_horario_reservado_comunicado.sql`.
- A migration foi aplicada somente depois da validação do frontend oficial.
- A versão `20261023100000` foi registrada em `supabase_migrations.schema_migrations` com o nome `portal_horario_reservado_comunicado`.
- Comunicado: **Portal confirma o horário reservado**.
- Público: gestão e barbeiros.
- Rotas: `/admin/configuracoes` e `/barber/dashboard`.
- Publicado em 23/10/2026 às 09:28:32, no horário de Brasília.
- A leitura posterior confirmou `ativo = true`, público `ambos`, rotas corretas e a migration registrada.

## Resultado

Publicação concluída. O cliente recebe confirmação clara e persistente de que o horário está reservado, enquanto a equipe foi avisada pelo sino interno depois da confirmação da produção.
