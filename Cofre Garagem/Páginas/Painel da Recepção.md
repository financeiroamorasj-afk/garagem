Tags: #page #reception

## Reflexos e Dependências
- **Produto**: módulo opcional da assinatura, liberado pelo Garagem System e ativado pelo proprietário.
- **Ações**: a recepção administra a agenda operacional, recebe os atendimentos concluídos pelo barbeiro, confere produtos e cobra no balcão.
- **Privacidade**: não acessa contas, saldos, envelopes, margens ou repasses gerenciais.
- **Regra de operação**: com o módulo ativo, o barbeiro envia o atendimento para `aguardando_pagamento`; estoque e financeiro só são efetivados pela cobrança da recepção.
- **Especificação completa**: [[Módulo de Recepção]]
- **Acesso operacional**: `https://app.garagemsystem.com.br/reception/board`, com login individual e módulo ativo. O link pode ser copiado no ADM, mas a permissão é validada no backend.
- **Barbeiros habilitados**: usam o mesmo login e alternam entre **Meu painel** e **Balcão**; o papel original continua sendo `barbeiro`.
- **Separação de telas**: `/admin/recepcao` mostra o relatório do proprietário; `/reception/board` é o balcão da equipe.
- **Caixa compartilhado**: não é obrigatório ter um recepcionista exclusivo. Barbeiros autorizados podem conferir o carrinho e cobrar atendimentos enviados por colegas, com registro do operador que realizou a cobrança.
- **Ativação segura**: o dono prepara ao menos um acesso antes de ativar a Recepção. O último operador não pode ser removido pelas telas de gestão enquanto o módulo estiver ativo.
- Modais conectados: [[Modal Agendamento Rápido]], [[Modal Ação Rápida]], [[Modal Novo Agendamento]]
- Componentes conectados: [[Busca de Cliente]], [[Grade de Horários]]
