---
tags: [portal, cliente, agenda, mvp]
---
# Portal do Cliente

## Acesso local

`http://localhost:5174/portal/garagem-local`

Em producao, o formato previsto e `https://garagemsystem.com.br/portal/<slug-da-barbearia>`.

## Fluxos entregues

- Identificacao por CPF protegido, sem armazenamento do numero completo.
- Primeiro cadastro com nome e WhatsApp quando o CPF ainda nao existe.
- Sessao temporaria de sete dias, revogavel ao sair do portal.
- Inicio com proximos horarios e memoria do ultimo corte.
- Agendamento por servico, barbeiro e horario livre real.
- Protecao atomica contra dois clientes ocuparem o mesmo horario.
- Cancelamento de horarios futuros ainda pendentes ou confirmados.
- Historico de cortes, equipe, barbeiro favorito e preferencias pessoais.
- Navegacao mobile fixa, sem rolagem lateral.

## Pagamento antecipado

O banco ja possui origem do agendamento e estados de pagamento. A tela explica que o pagamento ocorre no local enquanto nenhum provedor estiver conectado. A cobranca real permanece pendente porque ainda e necessario escolher e configurar o provedor de pagamento.

## Validacao em 23/09/2026

- 76 testes automatizados aprovados.
- ESLint aprovado.
- Build de producao aprovado.
- Fluxo visual validado em viewport de 393 x 852.
- Primeiro acesso, painel autenticado, horarios e confirmacao visual validados no Supabase local.
