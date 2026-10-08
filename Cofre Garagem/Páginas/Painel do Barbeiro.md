Tags: #page #barber

## Reflexos e Dependências
- **Ações**: O barbeiro interage com a própria agenda e os atendimentos do dia.
- Modais conectados: [[Modal do Barbeiro]]
- Componentes conectados: [[Coluna do Barbeiro]], [[Card de Agendamento]]


## Funcionalidades
- O barbeiro interage ativamente com o [[HistÃ³rico de Cortes]] durante os atendimentos.

## Cobrança conforme o módulo Recepção

- Sem Recepção ativa, o barbeiro finaliza serviço, produtos e pagamento no próprio painel.
- Com Recepção ativa, ele encerra a parte técnica e envia o atendimento à fila `aguardando_pagamento`; estoque, comissão e financeiro só são efetivados na cobrança do Balcão.
- Se o dono conceder permissão individual de balcão, o barbeiro mantém seu painel e pode alternar para **Balcão** para conferir e cobrar atendimentos de qualquer profissional da unidade. Essa permissão não libera o checkout direto fora da fila.
