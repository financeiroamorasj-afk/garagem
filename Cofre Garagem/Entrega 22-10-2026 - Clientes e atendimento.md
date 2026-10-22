# Entrega — clientes e atendimento

Data: 22/10/2026

## Escopo desta publicação

- CPF opcional no cadastro administrativo.
- Busca de clientes por nome ou telefone, com telefone, total de atendimentos, última visita e barbeiro favorito para distinguir homônimos.
- Alerta de possível duplicidade antes de criar outra ficha, sem união automática.
- União auditável de cadastros duplicados pela gestão, com bloqueio para CPFs diferentes.
- Registro de encaixe já iniciado no mesmo dia, marcado permanentemente como retroativo e com autoria preservada.
- Solicitação de tela ativa enquanto existe atendimento em andamento, com fallback para aparelhos sem suporte.
- Avisos segmentados dentro dos aplicativos da gestão e do barbeiro.

## Decisão sobre o Portal do Cliente

O acesso por telefone com OTP não faz parte desta publicação. O Portal permanece no método já disponível em produção, evitando contratar ou configurar SMS nesta rodada. A futura substituição do CPF no acesso público será tratada separadamente, com preferência por uma solução segura e adequada ao uso de WhatsApp.

## Migrations da entrega

1. `20261022100000_encaixe_retroativo_auditavel.sql`
2. `20261022110000_clientes_desambiguacao_encaixe.sql`
3. `20261022130000_clientes_uniao_auditavel.sql`
4. `20261022150000_comunicados_clientes_e_atendimento.sql`

A migration `20261021220000_central_avisos_apps.sql`, já incorporada à `main`, é pré-requisito para os comunicados.

## Validação pré-publicação

- Release preparada em worktree limpa a partir de `origin/main`.
- Oito testes focados aprovados, incluindo integrações locais de encaixe retroativo, união de clientes e avisos.
- ESLint dos arquivos da entrega aprovado.
- Build de produção aprovado; permaneceu apenas o aviso conhecido sobre tamanho do bundle.
- Suíte completa: 174 de 178 testes aprovados.
- As quatro falhas restantes já existiam fora deste escopo: fallback direto da disponibilidade e ausência de `recepcao_barbeiros_acesso` no schema local usado pelos testes da Recepção.

## Estado da publicação

Publicação concluída em 22/10/2026.

- PR: `#77 — Clientes sem CPF e atendimento sem atrito`.
- Commit da entrega: `6b51556`.
- Commit de merge na `main`: `c042c9cd012148cc7e30751b211bc3d74927c32a`.
- Merge concluído às 15:10, no horário de Brasília.
- Deploys de produção concluídos pela Vercel às 15:11:
  - `garagem-app`: deployment `9vqUXFggQf2i6gVoajTSx5mtNDfX`;
  - `garagem-adm`: deployment `CSxbBKG2To84n4hMDzBQhTviWEsb`.
- Domínios oficiais verificados com HTTP 200:
  - `https://app.garagemsystem.com.br/login`;
  - `https://adm.garagemsystem.com.br`.
- O bundle servido em produção foi conferido e contém as marcas funcionais `Registrar já iniciado`, `CPF (opcional)`, `Tela mantida ativa` e `Unir cadastro duplicado`.

## Aplicação no Supabase de produção

- O histórico remoto foi auditado antes da alteração e confirmou a migration pré-requisito `20261021220000_central_avisos_apps`.
- As quatro migrations desta entrega foram aplicadas individualmente pelo SQL Editor do projeto `Garagem System`, cada uma dentro de uma transação.
- Cada versão foi registrada em `supabase_migrations.schema_migrations`.
- Validação posterior confirmou:
  - as três colunas de auditoria retroativa em `agendamentos`;
  - a função `barbeiro_encaixe_retroativo_criar`;
  - a função enriquecida `agenda_encaixe_catalogo`;
  - a tabela `clientes_unioes` com RLS habilitado;
  - a função `clientes_unir`;
  - as quatro versões no histórico de migrations;
  - os dois comunicados ativos em `app_comunicados`.

## Registro operacional da publicação

- Foram removidos somente tokens pessoais marcados como expirados no Supabase: `garagem-local-dev`, `claude-code-esteira-daiane-06-08` e `claude-code-auditoria-financeiro-v2`.
- O login da CLI continuou bloqueado pelo limite de tokens, porque tentativas malsucedidas criaram novas entradas `Never used`; nenhuma entrada não expirada foi removida.
- A credencial antiga encontrada no backup local não autenticou no banco de produção e não foi usada na publicação.
- A execução seguiu pelo SQL Editor autenticado para evitar apagar credenciais adicionais e para manter a aplicação das migrations controlada e verificável.
- Nenhuma configuração de SMS foi criada. O Portal do Cliente permaneceu inalterado nesta rodada.
