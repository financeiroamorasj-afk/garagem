---
tags: [produto, recepcao, assinatura, operacao]
---
# Módulo de Recepção

## Decisão de produto

O módulo de recepção é opcional e comercializado como adicional da assinatura. Existem duas autorizações diferentes:

1. **O Garagem System libera o módulo no plano da barbearia** (`entitlement`).
2. **O proprietário ativa o uso na unidade** e cria os usuários da recepção.

O proprietário não pode liberar sozinho um recurso que não pertence à assinatura. A validação precisa acontecer no backend; esconder o menu no frontend não é suficiente.

## Modos de operação

### Barbearia sem recepção

- O barbeiro inicia e conclui o próprio atendimento.
- Registra a memória e a foto do corte.
- Adiciona produtos vendidos.
- Confirma pagamento, desconto e taxa no checkout atual.
- Estoque, comissão e financeiro são atualizados na conclusão.

### Barbearia com recepção ativa

- O barbeiro inicia o atendimento e registra a parte técnica do serviço.
- Pode adicionar produtos ao atendimento, mas esses itens permanecem em um carrinho pendente.
- Ao terminar, envia o atendimento para **Aguardando cobrança**.
- A recepção recebe o atendimento em uma fila em tempo real.
- A recepção confere serviço, produtos, desconto autorizado, forma de pagamento e taxa.
- Somente ao confirmar a cobrança o sistema conclui o atendimento, baixa o estoque, calcula as comissões e cria o financeiro.
- O proprietário mantém uma ação de contingência para concluir ou estornar uma cobrança.

## O que a recepção pode ver

- Agenda diária e semanal de toda a equipe.
- Horários confirmados, encaixes, atrasos e clientes que chegaram.
- Atendimentos em andamento e aguardando cobrança.
- Nome e contato operacional do cliente.
- Serviço, duração, preço de venda e produtos vinculados ao atendimento.
- Estoque disponível dos produtos que podem ser vendidos.
- Total a cobrar, desconto permitido, forma de pagamento e situação da cobrança.
- Alertas de conflito e disponibilidade necessários para reagendar ou criar encaixes.

## O que a recepção não pode ver

- Saldo bancário, contas a pagar, envelopes e fluxo de caixa consolidado.
- Lucro, margem, custo dos produtos e visão gerencial do proprietário.
- Comissões consolidadas ou repasses de outros profissionais.
- Configuração da assinatura e dos módulos contratados.
- Dados pessoais que não sejam necessários para atendimento e cobrança.

## Ações autorizadas

- Cadastrar ou localizar cliente.
- Criar, confirmar, reagendar e cancelar horário conforme política da barbearia.
- Registrar chegada e encaminhar o cliente ao barbeiro.
- Criar encaixe usando a disponibilidade real da equipe.
- Conferir e ajustar o carrinho antes da cobrança.
- Adicionar produto diretamente no balcão.
- Cobrar atendimento e produtos.
- Emitir comprovante e consultar o resultado da própria operação.

Estorno após a conclusão continua sendo ação do proprietário/administrador.

## Estados necessários

O fluxo atual precisa ganhar uma separação explícita entre execução e cobrança:

`pendente/confirmado/encaixe` → `em_atendimento` → `aguardando_pagamento` → `concluido`

- `aguardando_pagamento`: parte técnica encerrada, memória salva e carrinho ainda editável pela recepção.
- `concluido`: pagamento confirmado; comissão, estoque e financeiro efetivados uma única vez.
- O checkout deve continuar idempotente para impedir cobrança ou baixa duplicada.

## Dados e segurança

- Criar papel `recepcao` com usuário individual e nunca uma senha compartilhada no balcão.
- Criar configuração da unidade separada do direito comercial do plano.
- Criar carrinho pendente do atendimento com itens, quantidade, autor e horário.
- Registrar quem adicionou cada produto: barbeiro ou recepção.
- Registrar quem recebeu, forma de pagamento, desconto e eventual alteração do carrinho.
- Aplicar isolamento por barbearia e permissões nas RPCs; a recepção não escreve diretamente nas tabelas financeiras.
- Manter trilha de auditoria para cobrança, cancelamento, alteração de item e passagem de responsabilidade.

## Sequência de implementação

### R1 — Contrato comercial e ativação

- Modelar planos, módulos contratados e `entitlement` de recepção.
- Adicionar configuração **Usar recepção nesta unidade** nas configurações do proprietário.
- Exibir oferta de upgrade quando o plano não possuir o módulo.
- Proteger rota e RPCs no backend.

### R2 — Usuários e permissões

- Permitir ao proprietário convidar, editar e desativar usuários com papel `recepcao`.
- Definir RLS e RPCs de agenda da equipe, clientes e disponibilidade sem acesso gerencial.
- Substituir o painel atual de recepção, que ainda usa dados mockados.

### R3 — Fila operacional

- Adicionar `aguardando_pagamento` ao ciclo do atendimento.
- Criar passagem do barbeiro para a recepção com memória do corte já registrada.
- Criar painel em tempo real: chegando, aguardando, em atendimento e aguardando cobrança.
- Prever ação de contingência do administrador.

### R4 — Carrinho e cobrança no balcão

- Criar itens pendentes do atendimento sem baixar estoque antes da cobrança.
- Permitir ao barbeiro sugerir produtos e à recepção conferir, remover ou acrescentar itens.
- Reutilizar o checkout atômico já existente para efetivar pagamento, comissão, estoque e financeiro.
- Mostrar claramente qual regra de comissão foi aplicada ao serviço e a cada produto.

### R5 — Operação e qualidade

- Comprovante de cobrança.
- Busca rápida por cliente ou atendimento.
- Atualização em tempo real e recuperação após queda de conexão.
- Testes de duas recepções tentando cobrar o mesmo atendimento.
- Métricas do módulo para o proprietário, sem expor o financeiro para a recepção.

## Critérios de aceite

- Sem módulo contratado, usuário e APIs de recepção permanecem bloqueados.
- Com módulo contratado e desativado, o checkout continua no perfil do barbeiro.
- Com módulo ativo, o barbeiro envia para cobrança sem baixar estoque ou gerar receita.
- A recepção consegue cobrar serviço e produtos em uma única operação.
- Duas tentativas simultâneas produzem um único checkout.
- O estoque é baixado somente depois da cobrança confirmada.
- Comissão de serviço e comissão de produto preservam suas regras separadas.
- O financeiro recebe uma única origem auditável por componente do checkout.
- A recepção não consegue consultar contas, saldos, envelopes ou repasses.

## Dependências

- [[Painel da Recepção]]
- [[Painel do Barbeiro]]
- [[Grade de Horários]]
- [[Busca de Cliente]]
- [[Modal Agendamento Rápido]]
- Checkout completo do atendimento
- Cadastro e estoque de produtos
- Comissões separadas de serviços e produtos

