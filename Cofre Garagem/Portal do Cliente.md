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
- Depois de agendar, os estados `pendente` e `confirmado` aparecem para o cliente como **Horario reservado**, com a mensagem permanente **Confirmado, este horario esta reservado para voce.**
- Protecao atomica contra dois clientes ocuparem o mesmo horario.
- Cancelamento de horarios futuros ainda pendentes ou confirmados.
- Historico de cortes, equipe, barbeiro favorito e preferencias pessoais.
- Navegacao mobile fixa, sem rolagem lateral.

## Pagamento antecipado

O banco ja possui origem do agendamento e estados de pagamento. A tela explica que o pagamento ocorre no local enquanto nenhum provedor estiver conectado. A cobranca real permanece pendente porque ainda e necessario escolher e configurar o provedor de pagamento.

## Confirmacao visual da reserva — 23/10/2026

- A mensagem **Aguardando confirmacao** foi removida do Portal para reservas ativas.
- O selo e o reforco visual usam o estado positivo **Horario reservado** tanto para dados legados ainda marcados como `pendente` quanto para registros `confirmado`.
- A alteracao nao muda regras do banco, disponibilidade nem cancelamento; ela comunica corretamente que o intervalo ja esta ocupado para aquele cliente.
- Publicacao concluida pela PR 81 e validada no bundle servido pelo dominio oficial.
- O comunicado interno **Portal confirma o horario reservado** foi publicado para gestao e barbeiros depois da confirmacao do frontend em producao.

## Proxima disponibilidade explicita — 23/10/2026

- Quando a busca comeca em hoje e o profissional escolhido nao possui mais horarios no dia, o Portal informa diretamente que ele nao tem horarios disponiveis hoje.
- A primeira data futura recebe o rotulo **PROXIMA DATA DISPONIVEL** e e apresentada por extenso antes dos horarios.
- O cliente pode buscar outro barbeiro disponivel hoje sem refazer manualmente as etapas anteriores.
- Ao selecionar uma data futura, a confirmacao exibe **ESTE AGENDAMENTO NAO E PARA HOJE**, repete data e horario no titulo e inclui ambos no botao final.
- Quando existem horarios no dia corrente, o grupo recebe o rotulo **HOJE**.
- A regra de disponibilidade e o periodo de busca de 14 dias nao foram alterados; a melhoria reorganiza e reforca a informacao que o Portal ja recebia.
- Publicacao concluida pela PR 84 e confirmada no bundle do dominio oficial.
- O comunicado interno **Portal destaca a proxima data disponivel** foi publicado para gestao e barbeiros depois da confirmacao do frontend em producao.

## Validacao em 23/09/2026

- 76 testes automatizados aprovados.
- ESLint aprovado.
- Build de producao aprovado.
- Fluxo visual validado em viewport de 393 x 852.
- Primeiro acesso, painel autenticado, horarios e confirmacao visual validados no Supabase local.
