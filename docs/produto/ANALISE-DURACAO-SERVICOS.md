# Inteligência de duração real dos serviços

> Proposta de produto registrada em 29/09/2026. Não é bloqueante para o MVP e ainda não autoriza implementação ou alteração automática da agenda.

## Objetivo

Comparar a duração cadastrada de cada serviço com o tempo técnico realmente utilizado nos atendimentos para ajudar a barbearia a calibrar a agenda.

Exemplo: o serviço **Barba** está cadastrado com 30 minutos, mas os atendimentos válidos dos últimos 60 dias apresentam mediana de 37 minutos. O sistema pode sugerir uma revisão para 40 minutos, sempre sujeita à decisão do responsável.

## Decisão de produto

A primeira versão deve ser uma análise estatística explicável, não uma IA generativa e não uma automação que altera horários sozinha.

- o sistema mede e apresenta evidências;
- o dono decide se altera a duração do catálogo;
- uma recomendação pode ser diferente por barbeiro;
- nenhuma duração é alterada silenciosamente;
- a margem operacional de 5 minutos continua separada do tempo real do serviço;
- dados e recomendações permanecem isolados por barbearia.

## Viabilidade no estado atual

O sistema já possui:

- duração cadastrada no serviço;
- snapshot da duração usado em cada agendamento;
- horário planejado de início e fim;
- identificação do serviço e do barbeiro;
- ações de iniciar e concluir atendimento.

Ainda falta registrar de forma confiável:

- `iniciado_em`: quando o barbeiro iniciou o atendimento;
- `finalizado_tecnico_em`: quando terminou a parte técnica, antes de eventual espera pela recepção;
- `concluido_em`: quando todo o atendimento e cobrança foram encerrados;
- origem da transição e operador responsável, para auditoria.

Usar apenas o horário marcado, a última atualização da linha ou o momento da cobrança produziria métricas incorretas. O tempo técnico deve ser calculado por `finalizado_tecnico_em - iniciado_em`.

## Fundação de dados recomendada

Registrar as transições de estado em uma trilha própria e imutável, ou manter timestamps dedicados no agendamento acompanhados de histórico auditável.

Eventos mínimos:

1. atendimento iniciado;
2. atendimento técnico finalizado;
3. enviado à recepção, quando aplicável;
4. atendimento totalmente concluído;
5. cancelado ou marcado como falta;
6. correção manual, com motivo e responsável.

O registro deve acontecer no banco, cobrindo qualquer origem: app do barbeiro, recepção, ADM ou futura API.

## Métricas úteis

Para cada serviço e para cada combinação serviço + barbeiro:

- quantidade de atendimentos válidos;
- duração cadastrada e duração usada no agendamento;
- mediana do tempo técnico real;
- percentil 75 e percentil 90;
- variação em minutos e percentual contra o cadastro;
- distribuição por período e tendência recente;
- percentual de atendimentos que ultrapassaram o tempo previsto;
- impacto estimado na agenda e nos atrasos seguintes.

A mediana deve ser a referência principal porque poucos atendimentos muito longos distorcem a média simples.

## Qualidade da amostra

Não emitir recomendação antes de uma amostra mínima. Parâmetros iniciais para validação:

- pelo menos 10 atendimentos válidos para sinal preliminar;
- pelo menos 20 para recomendação mais confiável;
- janela móvel de 60 ou 90 dias;
- excluir cancelamentos, faltas e registros sem início ou fim;
- separar ou sinalizar atendimentos corrigidos manualmente;
- desconsiderar durações impossíveis, como menos de 5 minutos ou acima do limite operacional definido;
- informar claramente quando a amostra é insuficiente.

Esses limites devem ser calibrados com uso real antes de virarem regra definitiva.

## Recomendações possíveis

### Ajuste global do serviço

Quando quase toda a equipe apresenta comportamento semelhante:

> Barba está cadastrada com 30 min. Em 42 atendimentos, a mediana foi 37 min e 76% ultrapassaram o previsto. Considere revisar para 40 min.

### Ajuste por profissional

Quando a diferença está concentrada em um barbeiro, especialmente alguém em adaptação:

> Para Rafa, Barba leva mediana de 34 min. Para Samuel, em início de operação, leva 43 min. Considere uma duração específica temporária para Samuel em vez de alterar o catálogo inteiro.

Essa evolução exigirá suporte a duração do serviço por profissional, mantendo o catálogo global como padrão.

### Redução de duração

Também pode haver oportunidade de liberar capacidade:

> Corte tradicional está cadastrado com 45 min, mas a mediana permaneceu em 31 min durante 60 dias. Revise se 35 ou 40 min representa melhor a operação.

## Interface sugerida

Uma área futura **Gestão > Inteligência de serviços** pode apresentar:

- cartões de serviços com duração prevista versus realizada;
- filtro por período, serviço e barbeiro;
- indicador de qualidade da amostra;
- gráfico de distribuição, sem depender somente da média;
- recomendação explicada em linguagem simples;
- ação **Revisar duração**, abrindo a edição já preenchida, mas exigindo confirmação;
- histórico de recomendações aceitas, recusadas ou adiadas.

Um resumo menor pode aparecer no cadastro do serviço:

> Cadastrado: 30 min · Mediana real: 37 min · 42 atendimentos · Revisão sugerida

## Fases propostas

### Fase 0 — Instrumentação silenciosa

- registrar início, término técnico e conclusão;
- validar se a equipe usa corretamente os botões operacionais;
- coletar dados sem mostrar recomendações.

### Fase 1 — Relatório descritivo

- exibir previsto versus realizado;
- filtros por serviço e barbeiro;
- qualidade e tamanho da amostra;
- nenhuma recomendação automática.

### Fase 2 — Recomendações explicáveis

- sugerir aumento ou redução quando os limites forem atingidos;
- permitir aceitar, adiar ou recusar;
- registrar a decisão e seu efeito futuro.

### Fase 3 — Agenda adaptativa opcional

- duração específica por profissional;
- consideração de experiência recente e tipo de serviço;
- simulação de impacto antes de aplicar;
- qualquer alteração continua exigindo autorização humana.

## Riscos e cuidados

- barbeiro esquecer de iniciar ou concluir distorce o dado;
- tempo de espera por pagamento não pode entrar no tempo técnico;
- complexidade do corte ou perfil do cliente pode justificar exceções;
- métrica não deve ser usada isoladamente para punir ou ranquear profissionais;
- alterações frequentes podem tornar a agenda imprevisível;
- recomendações devem mostrar amostra, período e cálculo utilizado.

## Posição no roadmap

Frente futura e não bloqueante. A Fase 0 pode ser implementada antes das telas de inteligência porque precisa acumular histórico. As fases analíticas entram depois da estabilização do MVP e podem integrar o futuro módulo **IA Gestora**.
