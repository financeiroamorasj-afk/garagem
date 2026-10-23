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


## Registro retroativo de cortes

Atualizado em 23/10/2026.

- A ação **Registrar já iniciado** permite lançar um corte já finalizado que não havia sido registrado no momento da execução.
- O registro aceita atendimentos realizados **hoje ou nos dois dias anteriores**.
- O barbeiro informa cliente, serviço, data do corte, horário de início, horário de término e valor final.
- O sistema valida que:
  - O término é estritamente posterior ao início;
  - Início e término ocorrem no mesmo dia;
  - O horário de término não está no futuro;
  - Não há sobreposição com outros agendamentos concluídos ou confirmados do mesmo profissional.
- O agendamento é gravado diretamente com status `concluido`, com `iniciado_em` e `concluido_em` reais e marca de auditoria (`registro_retroativo = true`, data/hora do registro e identificador do usuário autor).
- O registro retroativo **não** entra em estado `em_atendimento`, não ocupa o banner de atendimento ativo do painel, não solicita Wake Lock e não bloqueia a realização de atendimentos em tempo real na cadeira.
