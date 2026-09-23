Tags: #page #admin #financeiro

## Reflexos e Dependências
- **Layout**: Utiliza o componente AdminLayout, rota `/admin/mapa`, item de menu "Mapa da barbearia" no grupo Visão Geral.
- **Dados**: Carrega em paralelo (falha isolada por fonte) o resumo do período, saldos de contas, envelopes, títulos a pagar/receber do mês, profissionais e agendamentos de uma janela de ±120/15 dias. Ver `src/lib/mapa/fontes.js`.
- **Modelo**: `src/lib/mapa/modelo.js` monta 7 núcleos a partir dos dados brutos — Contas, Categorias, Cofres, Comissões, Equipe, Clientes, Agenda — cada um com sua própria regra de alerta (ex.: saldo negativo, título vencido, comissão sem percentual configurado, cliente sumido há mais de 35 dias, agendamento não confirmado ou não fechado).
- **Geometria**: `src/lib/mapa/geometria.js` — radar em coordenadas polares, mesma estrutura do "Mapa da casa" do projeto Finanças Família (colunas em espiral por núcleo, anel de acessos, micro-conexões).
- Funcionalidades relacionadas: [[Módulo Financeiro]], [[Envelopes]].

## Regras Vinculadas
- Núcleos "Cofres" e "Comissões" abrem micro-conexões (últimos títulos liquidados da conta, atendimentos do profissional, movimentos do envelope) ao selecionar um item.
- Núcleo "Equipe" aponta profissional sem percentual de comissão configurado.
- Núcleo "Clientes" aponta cliente sem corte há mais de 35 dias, exceto se já tiver horário futuro marcado.
- Exceções de design system documentadas em `docs/design-system/DESIGN-SYSTEM.md`, seção 13 (brilho nos núcleos, movimento contínuo da varredura, ícones próprios de bigode/poste de barbeiro, rótulos abaixo do piso de 11px — sempre repetidos em tamanho normal no painel lateral).
- Testado em `tests/mapa-modelo.test.js` (9 casos: geometria, alertas por núcleo, isolamento de erro por fonte, micro-conexões, consistência de tokens CSS/JS).
- Aprovado por Rafa em 23/09/2026 a partir do mockup do radar.

## Pendências
- Build de produção e conferência visual lado a lado com o mockup ainda não foram feitos (bloqueado por ambiente local no momento do commit).
