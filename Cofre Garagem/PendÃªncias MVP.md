---
tags: [checklist, projeto, mvp]
---
# PendÃªncias MVP

Esta lista resume as frentes atuais que faltam (baseado na auditoria do fim de agosto/2026):

## OperaÃ§Ã£o DiÃ¡ria
- [x] Criar, editar e cancelar lanÃ§amentos manuais a pagar e a receber.
- [x] Regras de tÃ­tulos recorrentes/parcelados.
- [ ] Fluxos de estornos auditÃ¡veis para pagamento/recebimento.
- [ ] Criar Interface de transferÃªncia entre contas usando a RPC jÃ¡ existente.
- [ ] Lincar a funÃ§Ã£o de "Usar / resgatar envelope" na quitaÃ§Ã£o de um tÃ­tulo.

## Lado da Barbearia
- [ ] Integrar pagamento (e suas taxas) nos recebimentos.
- [ ] IntegraÃ§Ã£o com Venda de Produtos e seu CMV.
- [ ] ComissÃµes: definir lÃ³gica final e exibiÃ§Ã£o no fechamento, para o Dashboard de repasses.

## P0 — Acesso, Barbeiros e Agendas
- [x] Substituir a rota provisÃ³ria de Barbeiros por cadastro real, mobile-first, com criaÃ§Ã£o, ediÃ§Ã£o e desativaÃ§Ã£o.
- [x] Ao cadastrar um barbeiro, criar ou convidar seu usuÃ¡rio de acesso e vincular `profissionais.user_id` ao perfil com papel `barbeiro`.
- [x] Implementar fluxo seguro de primeiro acesso, sem o administrador definir ou conhecer a senha permanente do barbeiro.
- [x] Criar agenda individual didÃ¡tica para cada barbeiro, exibindo apenas seus horÃ¡rios, clientes e aÃ§Ãµes autorizadas.
- [x] Criar agenda geral para o proprietÃ¡rio, com visÃ£o da equipe, filtros por profissional e situaÃ§Ã£o dos atendimentos.
- [x] Garantir isolamento por barbearia e profissional usando sessÃ£o autenticada e RLS.
- [x] Criar o modo TV da agenda da equipe em rota dedicada, somente leitura e tela cheia, com todos os barbeiros, atualização automática, relógio e ocultação de dados sensíveis do cliente.

## P1 — Cliente e MemÃ³ria do Corte
- [x] Criar ficha mobile do cliente com preferÃªncias, barbeiro favorito e observaÃ§Ãµes.
- [x] Registrar o corte realizado ao concluir um atendimento: estilo, pentes, acabamento, barba e anotaÃ§Ãµes.
- [x] Exibir o Ãºltimo corte de forma imediata para o barbeiro na agenda e na ficha do cliente.
- [x] Permitir foto do resultado, com armazenamento privado, compressÃ£o, acesso controlado e exclusÃ£o lÃ³gica.
- [x] Manter um registro ativo por cliente e arquivar as versÃµes anteriores quando as preferÃªncias mudarem.

## P2 — Agente Garagem
- [ ] Criar agente de IA embutido com conversa por texto e Ã¡udio.
- [ ] Para o barbeiro, limitar o contexto Ã  prÃ³pria agenda, clientes atendidos, preferÃªncias, Ãºltimos cortes e informaÃ§Ãµes pessoais autorizadas.
- [ ] Para o proprietÃ¡rio, permitir perguntas sobre agenda geral, dashboard, financeiro, estoque, comissÃµes e desempenho da equipe.
- [ ] Executar consultas com a identidade do usuÃ¡rio conectado, respeitando RLS; nunca entregar chave administrativa ao agente.
- [ ] ComeÃ§ar com respostas somente de leitura e exigir confirmaÃ§Ã£o explÃ­cita antes de qualquer alteraÃ§Ã£o em agenda, cliente ou financeiro.
- [ ] Registrar auditoria das ferramentas consultadas e das aÃ§Ãµes solicitadas ao agente.
- [ ] Implementar entrada por voz com botÃ£o de pressionar para falar, transcriÃ§Ã£o revisÃ¡vel e alternativa completa por texto.

## P1.5 — Portal do Cliente
- [x] Criar rota publica por barbearia em `/portal/:slug`, com experiencia mobile-first sem rolagem lateral.
- [x] Implementar acesso e primeiro cadastro por CPF protegido, sem armazenar o numero completo.
- [x] Exibir equipe, servicos, proximos horarios, historico de cortes e preferencias pessoais.
- [x] Permitir agendamento e cancelamento com disponibilidade real e protecao atomica contra conflito.
- [x] Criar sessao temporaria revogavel e manter todas as tabelas privadas via RLS.
- [ ] Conectar um provedor de pagamento para habilitar pagamento antecipado; contrato e estados ja preparados no banco.

## P1.7 — Módulo de Recepção (adicional da assinatura)
- [x] Modelar o direito comercial do módulo (`entitlement`) separado da ativação feita pelo proprietário na unidade.
- [x] Permitir convite e gestão de usuários individuais com papel `recepcao`.
- [x] Substituir o painel mockado de recepção por agenda e fila operacionais reais.
- [x] Adicionar o estado `aguardando_pagamento` entre o fim técnico do atendimento e sua conclusão financeira.
- [x] Permitir que o barbeiro envie serviço e produtos para um carrinho pendente, sem baixa antecipada de estoque.
- [x] Permitir que a recepção confira o carrinho, acrescente produtos e faça a cobrança no balcão.
- [x] Reutilizar o checkout atômico para efetivar pagamento, comissão, estoque e financeiro somente uma vez.
- [x] Restringir contas, saldos, envelopes, margens e repasses ao proprietário.
- [x] Cobrir concorrência entre dois caixas, auditoria e recuperação após perda de conexão.
- [x] Seguir a especificação e a sequência de [[Módulo de Recepção]].
