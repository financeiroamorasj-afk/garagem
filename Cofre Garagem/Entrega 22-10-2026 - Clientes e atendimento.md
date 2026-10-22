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

Em preparação. Completar após o deploy com PR, commit, migrations aplicadas, deployment e resultado da homologação em produção.
