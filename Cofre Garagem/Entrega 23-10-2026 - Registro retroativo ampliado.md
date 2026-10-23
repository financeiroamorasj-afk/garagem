# Entrega — registro retroativo com início, término e status concluído

Data: 23/10/2026

## Objetivo

Permitir que o barbeiro registre cortes já finalizados sem tê-los lançado previamente, cobrindo o dia atual e até dois dias anteriores, informando horários reais de início e término. O atendimento é gravado diretamente com status `concluido`, evitando deixar registros indevidamente em `em_atendimento`.

## O que mudou

- **Janela ampliada**: Aceita hoje e até dois dias anteriores (`v_hoje - 2`).
- **Início e término**: O modal coleta horário de início e término, sugerindo o fim automaticamente a partir da duração do serviço.
- **Gravação atômica como concluído**: O agendamento nasce diretamente em `concluido`, preservando `iniciado_em`, `concluido_em` e calculando a `duracao_real_minutos`.
- **Fim do sequestro de tela**: O registro retroativo não entra em `em_atendimento`, não ocupa o cabeçalho de atendimento ativo no painel, não aciona Wake Lock e não bloqueia novos atendimentos na cadeira do barbeiro.
- **Auditoria permanente**: Colunas `registro_retroativo = true`, `retroativo_registrado_em` e `retroativo_registrado_por` mantidas.
- **Aviso no sino**: Comunicado interno para gestão e barbeiros direcionando para `/admin/agenda` e `/barber/dashboard`.

## Publicação do frontend

- **PR**: `#86 — Barbeiro: registro retroativo com início, fim e status concluído`.
- **Commit de merge na `main`**: `c93d2498b7fb2aa8b7a10ba4ea87944d7348891f`.
- **Deployments de produção Vercel**:
  - `garagem-app`: `7xWxUrtCmQ2nEWxmYE5GzWk5Er4X` (Ready / HTTP 200).
  - `garagem-adm`: `5kPGEX2wQjbH7NFngd7RLaq4RMPH` (Ready / HTTP 200).
- **Bundle oficial**: `index-DvvmrFOM.js` verificado em produção contendo `Atendimento retroativo registrado com sucesso`.

## Migrations desta entrega

1. `20261023150000_encaixe_retroativo_dois_dias.sql`
2. `20261023160000_registro_retroativo_comunicado.sql`
