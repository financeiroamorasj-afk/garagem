# Registro de Atualizações - Sistema Garagem

Este documento registra as implementações, melhorias e novas funcionalidades integradas recentemente no ecossistema do Garagem System, refletindo os últimos avanços do projeto.

## Atualizações Recentes

### 1. Módulo de Recepção e Balcão
- **Controle de Assinatura**: Adicionado o controle de módulos da assinatura, permitindo habilitar comercialmente o acesso de recepção.
- **Acesso Operacional**: Criado perfil e acesso operacional exclusivo para a equipe de recepção.
- **Fila de Recepção**: Implementado o fluxo de envio de atendimentos finalizados para a fila da recepção (aguardando pagamento).
- **Operação de Produtos**: Ampliada a funcionalidade de produtos, possibilitando a adição de itens ao carrinho diretamente na recepção.
- **Cobrança no Balcão**: Concluída a etapa de cobrança consolidada pela recepção, efetuando baixa de estoque, comissionamento e financeiro de forma atômica.
- **Histórico e Estornos**: Adicionada interface de histórico de operações de balcão e a capacidade de realizar estornos de vendas.
- **Vínculo de Clientes**: Aprimorada a vinculação de clientes e consolidação da gestão na recepção.

### 2. Agenda e Experiência
- **Modo TV (Agenda da Equipe)**: Adicionado o Modo TV (tela cheia, apenas leitura) trazendo a identidade visual da barbearia.
- **Rotação de Agenda**: O Modo TV agora alterna automaticamente a exibição por proximidade de horários.
- **Avisos de novos agendamentos**: Preparada a atualização em tempo real do painel e da agenda administrativa, com aviso global ao dono em qualquer tela administrativa. O barbeiro recebe somente os novos horários atribuídos a ele.
- **Retorno ao aplicativo**: Ao reabrir a aba no celular, agenda administrativa e agenda do barbeiro buscam novamente os dados para recuperar eventos que o navegador possa ter suspendido em segundo plano.
- **Refinamento de UI/UX**: Alinhamento do scrollbar ao tema visual padrão da aplicação (Copper).

### 2.1. Acesso da equipe por e-mail
- **Identidade do convite**: Definido o padrão `Garagem System <systemgaragem@gmail.com>` com assunto em português e template visual oficial.
- **Primeiro acesso**: O convite leva o profissional ao fluxo seguro de criação da própria senha.
- **Reenvio controlado**: Adicionada a ação de reenviar o convite somente para barbeiros ainda não confirmados, sem duplicar o cadastro.
- **Segurança SMTP**: A credencial do Gmail deve ser uma senha de aplicativo mantida exclusivamente no Supabase, nunca no frontend ou no repositório.
- **Recuperação de senha**: O login passa a oferecer “Esqueci minha senha”, com resposta neutra, link temporário e template visual próprio para o usuário confirmado criar uma nova senha.

### 3. Financeiro
- **Títulos e Recorrências**: Implementada a funcionalidade e suporte para registro de títulos parcelados e recorrentes.

### 4. Auditoria autônoma da jornada do membro fundador
- **Saúde do projeto**: suíte completa, lint e build executados com sucesso antes das alterações desta rodada.
- **Teste integrado**: criada uma prova automatizada única ligando portal do cliente, agenda administrativa, agenda do barbeiro, início do atendimento, checkout PIX manual, estoque, comissão, memória do corte e financeiro.
- **Roteiro manual**: criado o documento `Roteiro de Homologacao — Membro Fundador.md` para orientar a validação posterior no navegador e no celular real.
- **Produção preservada**: esta auditoria não alterou banco, SMTP, usuários ou dados de produção.

### 5. Pendência temporária do SMTP
- O pedido de recuperação chegou corretamente ao Supabase, mas o Gmail recusou a autenticação SMTP com o código `535 5.7.8 Username and Password not accepted`.
- A conta `systemgaragem@gmail.com` ainda não tinha a verificação em duas etapas ativa; por isso o Google não permitiu criar uma senha de aplicativo.
- Próxima ação: com o celular disponível, ativar a verificação em duas etapas, gerar a senha de aplicativo `Supabase Garagem`, substituir somente a senha nas configurações SMTP e repetir o teste.
- Não há correção pendente no frontend do fluxo de recuperação.

---
*Atualizações extraídas com base no histórico recente de integrações (commits) do sistema.*

## Próximos Passos (Roadmap MVP)

> **Decisão de produto — 26/09/2026**
>
> O MVP inicial deve ser pequeno, utilizável e com o mínimo de dependências externas. O primeiro membro fundador deve conseguir operar uma barbearia real antes de iniciarmos as frentes mais ambiciosas de IA, CRM e automações.
>
> **Cobrança no atendimento:** nesta primeira fase, o QR Code PIX será apenas um facilitador de pagamento. O cliente paga, apresenta o comprovante ao barbeiro ou à recepção e o atendimento é confirmado manualmente. Não haverá, por enquanto, identificação automática do pagamento, conciliação bancária ou webhook de gateway para cada corte.
>
> **Assinatura do Garagem System:** será uma frente separada e prioritária do ADM. O lead deverá conseguir contratar o sistema diretamente, escolhendo cartão de crédito ou PIX através do gateway de assinaturas que será configurado. A cobrança do SaaS não deve bloquear o funcionamento manual do MVP da barbearia.

### Ordem oficial de execução

1. **Produção e segurança do banco — bloqueador do MVP**
   - Conferir e aplicar todas as migrations no ambiente de produção.
   - Validar RLS, storage, buckets, variáveis de ambiente e permissões por perfil.
   - Identificar e limpar lixo técnico, dados de teste e fluxos duplicados.
   - Revisar as tabelas legadas que usam `tenant_id` (`vendas`, `contas_receber` e `movimentacoes_financeiras`) antes de declarar o banco limpo.
   - Confirmar backup, restauração e um procedimento seguro de deploy.

2. **Acabamentos do app antes do ADM**
   - Testar ponta a ponta agenda, portal, recepção, produtos, estoque, comissões e cobrança manual por PIX.
   - Corrigir estados vazios, erros, responsividade e comprovante de pagamento.
   - Validar o primeiro cenário real do membro fundador.

3. **ADM mínimo de assinaturas**
   - Cadastro da barbearia/lead.
   - Escolha de plano.
   - Checkout por cartão ou PIX via gateway.
   - Status da assinatura, período de teste, ativação, suspensão e histórico básico.
   - Controle de módulos contratados, começando pelo módulo de recepção.
   - Preparação para descontos e benefícios de membros fundadores.
   - A separação comercial Rebip/Garagem deve ser feita por produto dentro da mesma conta do gateway, caso o provedor permita.

4. **Financeiro gerencial**
   - Interface de transferência entre contas.
   - Resgate de envelopes vinculado à quitação de títulos.
   - Estornos gerais auditáveis.
   - CMV, margem e lucro das vendas de produtos.
   - Dashboard definitivo de comissões e repasses.

5. **CRM e atendimento de leads**
   - Registro de leads da landing e do WhatsApp.
   - Pipeline de atendimento e follow-up.
   - Histórico de conversão em assinatura.

6. **IA Garagem**
   - Pode ser construída em paralelo como feature futura, sem bloquear o MVP.
   - No app, manter uma apresentação da funcionalidade para gerar expectativa.
   - A implementação completa fica depois do ambiente mínimo utilizável.

### Observação sobre o checklist antigo

O checklist original deste documento foi substituído pela **Ordem oficial de execução** acima. Algumas linhas antigas já não representam o estado atual do produto — por exemplo, catálogo, vendas, estoque, comissões básicas, recepção, Modo TV e QR Code PIX já foram implementados. A cobrança automática por atendimento e a IA foram deliberadamente adiadas para depois do MVP mínimo.

# 27/09/2026 — Migração de dados projetada

- Definido o fluxo ponta a ponta para migração de barbearias vindas de outros sistemas.
- Criado template Excel v1 com clientes, profissionais, recepção, serviços, produtos/estoque, jornadas, bloqueios, materiais e agenda futura.
- Congeladas as decisões de staging obrigatório, prévia, idempotência, auditoria, convites sem senha, proteção de CPF e reversão condicionada.
- Financeiro histórico, fotos e histórico de cortes ficam em migração assistida.
- Documento técnico: `docs/produto/MIGRACAO-DE-DADOS.md`.
- Registro executivo: `Cofre Garagem/Plano de Migração de Dados.md`.

# 28/09/2026 — Fundação do ADM validada

- A migration da fundação de assinaturas foi aplicada em produção e confirmada no histórico remoto.
- As tabelas comerciais do ADM permanecem inacessíveis pela chave anônima do app.
- O banco local foi reconstruído desde a baseline com todas as 48 migrations.
- O snapshot usado no reparo emergencial de produção foi preservado em `supabase/repairs/` e sua migration virou um no-op documentado para não duplicar objetos em instalações novas.
- A suíte completa terminou com 110/110 testes aprovados; lint e build também passaram.
- Foi criado o acesso local de desenvolvimento `admin@teste.local`, com perfil operacional de administrador e papel de plataforma `super_admin`.

# 28/09/2026 — Interface inicial do ADM

- Criada a aplicação independente `apps/adm`, destinada ao futuro domínio `adm.garagemsystembarber.com.br`.
- Implementados login SSR, sessão por cookies e autorização por papel da plataforma no servidor.
- Criadas as visões iniciais de painel, planos, barbearias e assinaturas, todas consultando os dados reais da fundação SaaS.
- A chave administrativa do Supabase permanece restrita ao servidor e não é exposta ao navegador.
- O primeiro corte é deliberadamente somente leitura: preços, gateway Asaas e ações comerciais continuam pendentes de decisão e implementação auditada.
- Próxima etapa após a publicação: ativação manual do membro fundador e gestão dos módulos contratados.

# 28/09/2026 — Configurações futuras preservadas no ADM

- Criada uma área única para gateway de assinaturas, módulos comerciais e APIs externas.
- O Asaas é o primeiro adaptador, mas deixou de ser uma restrição fixa no modelo do banco.
- As credenciais ficam exclusivamente nas variáveis seguras do servidor; o banco guarda apenas referências.
- Os complementos de IA para gestão e atendimento via WhatsApp foram registrados como módulos em rascunho.
- Ficaram explicitamente anotados para as próximas etapas: provedor/modelo de IA, limite mensal, medição de consumo, integração oficial do WhatsApp, teste de conexão e preço por complemento.

# 28/09/2026 — ADM publicado na Vercel

- Criado o projeto independente `garagem-adm` na equipe Garagem System da Vercel.
- Configuradas as variáveis seguras de produção do Supabase, sem expor a chave administrativa ao frontend ou ao repositório.
- Corrigida a configuração de build para Next.js, isolando-a do `vercel.json` Vite da aplicação principal.
- Deploy de produção concluído em `https://garagem-adm.vercel.app`.
- Validado que `/login` responde HTTP 200 e que `/` encaminha usuários sem sessão para o login.
- PR 22 aberta para versionar a configuração de deploy do ADM.
- O domínio `adm.garagemsystem.com.br` foi configurado no Registro.br com registro A para `76.76.21.21`, validado na Vercel e recebeu certificado SSL com renovação automática.
- O usuário `systemgaragem@gmail.com` foi vinculado em produção como `super_admin` ativo; falta validar o primeiro acesso funcional pelo navegador.

# 29/09/2026 — SMTP validado em produção

- O SMTP personalizado do Gmail foi autenticado com senha de aplicativo e passou a enviar os e-mails oficiais do Garagem System.
- O fluxo de recuperação foi validado de ponta a ponta para um barbeiro confirmado, incluindo template, remetente, link e resposta HTTP 200 do Supabase Auth.
- A primeira mensagem foi classificada como spam pelo Gmail destinatário; portanto, o SMTP está funcional, mas a entregabilidade com remetente Gmail permanece provisória para o MVP.
- Antes de escalar os convites, deve-se migrar para um serviço transacional com domínio autenticado e revisar SPF, DKIM e DMARC.

# 29/09/2026 — Encaixe separado do agendamento

- Encaixe passa a representar exclusivamente o cliente que chegou sem agendamento e precisa do próximo espaço livre do dia.
- Dono e barbeiros continuam podendo consultar toda a equipe e encaminhar o cliente ao profissional disponível da mesma barbearia.
- A interface deixou de oferecer datas futuras e pesquisa somente os horários restantes de hoje.
- O banco rejeita encaixes fora do dia corrente no fuso da barbearia; horários futuros permanecem no fluxo normal de agendamento.
- A regra foi validada no Supabase local com isolamento por barbearia, jornada, bloqueios, choque de horários e 117 testes aprovados.

# 29/09/2026 — Margem operacional e leitura da agenda

- Todo novo horário passa a reservar a duração real do serviço mais 5 minutos de margem operacional.
- A duração continua registrada separadamente; a margem não aumenta artificialmente o tempo exibido do serviço.
- A mesma proteção vale para agendamentos do portal, lançamentos do ADM e encaixes, inclusive sob concorrência no banco.
- Ao concluir ou cancelar um atendimento, ele deixa de ocupar a agenda; um encaixe só reaparece quando serviço e margem cabem integralmente antes do próximo compromisso ativo.
- Conflitos de horário agora são explicados em linguagem operacional no formulário do ADM.
- Horários cancelados ganharam identificação textual e tratamento visual explícito na visão semanal.
- O barbeiro recebe novos agendamentos em um aviso flutuante de alta visibilidade, com atualização automática da própria agenda.
- Validação local concluída com 118 testes aprovados, lint, build e lint do schema sem novos alertas.

# 29/09/2026 — Calendário priorizado no ADM

- A Agenda geral passou a abrir diretamente no calendário, que agora ocupa a posição principal da tela.
- Disponibilidade, conflitos, folgas, bloqueios e horários extras foram agrupados em uma aba secundária de consulta no mesmo menu.
- Os filtros mudam conforme a aba: cliente e situação permanecem no calendário; disponibilidade mantém apenas o filtro de barbeiro.
- O status cancelado deixou de disputar a mesma linha do horário e ganhou uma faixa própria dentro do cartão compacto.
- A reorganização preserva as visualizações de dia, semana e mês, além dos fluxos de novo corte, encaixe, horário extra e Modo TV.

# 01/10/2026 — Fotos ampliadas e materiais iniciais

- As fotos da memória de corte podem ser abertas em tamanho ampliado pelo administrador, pelo barbeiro e pelo próprio cliente.
- O portal mantém o bucket privado: cada abertura valida a sessão do cliente e gera um endereço temporário de cinco minutos somente para uma foto pertencente a ele.
- O catálogo ganhou uma seleção inicial de insumos e ferramentas comuns de barbearia, baseada em referências da Anvisa e do Senac.
- Unidades existentes recebem apenas os itens ausentes; materiais já cadastrados ou desativados não são duplicados.
- Novas barbearias passam a receber o catálogo inicial automaticamente e continuam podendo editar, desativar ou reativar cada item.
- Serviços podem receber modelos editáveis de consumo em um clique: Corte, Barba, Corte + barba, Acabamento e Lavagem/finalização.
- Cada modelo preenche materiais e quantidades sugeridas, mas o proprietário confirma ou ajusta o padrão operacional antes de salvar.
- Na conclusão, o barbeiro recebe esse padrão já confirmado e só usa `–` ou `+` quando o consumo real foi diferente; seguir sem tocar registra exatamente o padrão.
- O ajuste fica no atendimento e não altera o catálogo nem os próximos serviços da equipe.

# Fila comercial — módulo fiscal

- Reservar o módulo fiscal como adicional contratável e como componente de pacotes anuais com desconto.
- O catálogo do ADM já registra o entitlement `fiscal` em rascunho, sem acoplá-lo antecipadamente a um provedor.
- Antes da implementação: definir município/abrangência, tipo de documento, provedor fiscal, certificados, dados obrigatórios, contingência, cancelamento e armazenamento dos documentos.
- A oferta anual deve usar os recursos já previstos de preço anual, ofertas, desconto congelado no checkout e módulos incluídos no plano ou na assinatura.

# 07/10/2026 — Implantação manual pelo ADM

- O ADM ganhou a ação `Nova barbearia`, restrita ao super administrador da plataforma.
- A implantação manual cria tenant, administrador, assinatura, módulos e convite sem chamar o Asaas.
- Plano, ciclo, preços, oferta vigente e quantidades são calculados a partir do catálogo oficial, evitando valores divergentes do checkout online.
- Assinaturas criadas desta forma ficam identificadas com cobrança `manual` e aparecem na área de Assinaturas.
- O fluxo foi validado com build de produção, testes automatizados e aplicação das migrations no Supabase local.
- A PR 32 foi mergeada na `main`; as migrations do Checkout hospedado e do provisionamento manual foram aplicadas e confirmadas no Supabase de produção.
- O projeto `garagem-adm` foi publicado em produção e a rota protegida `/barbearias/nova` foi verificada no domínio oficial.
- Ficou estabelecido que contas provisionadas manualmente não formarão um cadastro ou controle financeiro separado.
- Próxima evolução: unificar na gestão de barbearias a barbearia, seu responsável, plano, módulos, assinatura e cobrança, permitindo que uma conta criada manualmente migre para cobrança Asaas sem duplicar o tenant.
- Cobranças manuais e automáticas deverão compartilhar a mesma visão operacional, mantendo apenas a identificação de origem, provedor e situação financeira.
- Pendência de infraestrutura: reativar o deploy automático do projeto Vercel `garagem-adm`, que nesta publicação precisou ser atualizado diretamente pela CLI.

# 08/10/2026 — Link operacional da Recepção para a equipe

- O ADM passou a diferenciar o **Relatório da recepção** da tela operacional do balcão.
- O endereço `https://app.garagemsystem.com.br/reception/board` aparece com a ação **Copiar link** no relatório e em **Configurações → Acessos à recepção**.
- Compartilhar o endereço não concede permissão: o módulo precisa estar ativo e cada recepcionista ou barbeiro habilitado entra com seu próprio login.
- Quem abre o link sem sessão é encaminhado ao login e retorna ao balcão após autenticação, caso tenha acesso. O barbeiro mantém seu painel original e pode alternar pelo botão **Balcão**.
- O comportamento de concessão e revogação de acesso, inclusive a preservação do histórico, está descrito em [[Módulo de Recepção]] e [[Painel da Recepção]].

# 08/10/2026 — Caixa compartilhado da Recepção publicado

- Regra de produto: sem o módulo, o barbeiro cobra no próprio painel; com o módulo ativo, ele encerra a parte técnica e toda cobrança de atendimento passa pela fila do Balcão.
- A cobrança pode ser feita por recepcionista exclusivo ou por barbeiro autorizado, inclusive de atendimento realizado por um colega. O checkout direto do barbeiro continua bloqueado quando a Recepção está ativa.
- A PR 37 foi incorporada à `main`; a migration `20261008190000_recepcao_caixa_equipe.sql` e a função `create-receptionist` foram publicadas no Supabase, e o deploy automático da Vercel ficou pronto no domínio `app.garagemsystem.com.br`.
- A gestão dos acessos agora aparece antes da ativação. O backend exige ao menos um operador apto para ativar e impede retirar o último acesso pelas telas de Recepção ou desativar o último barbeiro operador.
- O login exclusivo segue opcional e usa e-mail já existente da pessoa; login por telefone não foi incluído nesta entrega.
- Validação: 129 testes aprovados, 1 teste de TV ignorado, build e ESLint dos arquivos alterados sem falhas. O teste novo cobre um barbeiro cobrando atendimento de outro pela fila e confirma que o checkout direto segue bloqueado.
- Próxima conversa de produto: **Modo TV**.

# 08/10/2026 — Correção do Cadastro de Barbearia no ADM e Diagnóstico SMTP

- Resolvido Erro 500 fatal na Vercel e no localhost ao criar uma nova barbearia no ADM. O erro era causado pela exportação de objeto literal (`initialManualTenantState`) em arquivo de Server Actions (`"use server"`), o que viola o comportamento do Next.js.
- A declaração de estado inicial foi isolada para o lado cliente, destravando a execução do fluxo. O ADM compilou perfeitamente após o conserto e a correção foi enviada para a produção oficial (Vercel) via deploy manual (`npx vercel deploy --prod --yes`).
- O envio de e-mails usando a porta `587` do Gmail funciona perfeitamente por trás dos panos.
- Foi detectado um bloqueio unilateral do Google: disparos recentes com e-mails genéricos para testes de cadastro geram bloqueio silencioso (rate limiting/reputação) no lado do SMTP do Gmail, mesmo o Supabase retornando sucesso na entrega.
- Recomendação técnica final: migrar o remetente transacional do Garagem para uma plataforma dedicada (Resend ou Sendgrid) para garantir integridade e 100% de entregabilidade aos clientes.

# 11/10/2026 — Asaas de produção e acessos validados

- O fluxo de redefinição de senha foi validado de ponta a ponta com o template oficial do Garagem.
- O fluxo de convite e primeiro acesso do barbeiro também foi confirmado em produção.
- Foi gerada no Asaas uma chave de produção exclusiva para o Garagem, separada das integrações do Rebip. O valor da chave não foi registrado no cofre, no banco ou no repositório.
- O projeto `garagem-adm` recebeu na Vercel as variáveis de produção `ASAAS_ENVIRONMENT`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `CHECKOUT_ALLOWED_ORIGINS`, `GARAGEM_LANDING_URL` e `GARAGEM_APP_URL`. Chave e segredo permanecem armazenados como variáveis secretas.
- Foi criado no Asaas o webhook `Garagem System - Produção`, ativo, usando API v3, envio sequencial, fila habilitada e token próprio de autenticação.
- O webhook escuta somente os eventos processados pelo código: confirmação, recebimento, atraso, recusa de captura, estornos total e parcial, chargeback, checkout pago, cancelado e expirado.
- O endereço configurado é `https://adm.garagemsystem.com.br/api/webhooks/asaas`, com alertas de falha enviados ao e-mail operacional do Garagem.
- Foi feito um redeploy do código já aprovado na `main`, sem alteração de autoria ou novo commit. A Vercel confirmou o deployment de produção como `Ready` no domínio oficial.
- A verificação segura do endpoint retornou HTTP `401` para uma chamada sem token, confirmando que a rota está publicada e protegida. A raiz do ADM continuou redirecionando usuários sem sessão para o login.
- Nenhum checkout, cobrança, assinatura financeira ou pagamento real foi criado nesta etapa.

## Retomada em 12/10/2026 — Rodada 1

- Criar somente um checkout real de produção, sem efetuar o pagamento.
- Usar o plano Base mensal, sem módulos, com identificação clara de homologação, e-mail controlado e telefone informado pelo responsável no momento do teste.
- Conferir preço e oferta antes da criação; o catálogo atual prevê R$ 49,90 e desconto vigente de 20%, resultando em R$ 39,92 enquanto a oferta estiver ativa.
- Validar a criação do registro em `saas_checkouts`, o status `aguardando_pagamento`, o link hospedado no Asaas e a expiração em 24 horas.
- Confirmar que barbearia, administrador, convite e assinatura não são provisionados antes do pagamento.
- Encerrar a Rodada 1 sem pagar. A Rodada 2, com PIX real, provisionamento, cancelamento da recorrência e eventual estorno, exigirá nova confirmação explícita.

# 12/10/2026 — Rodada 1 do checkout de produção concluída

- A primeira criação controlada revelou uma incompatibilidade real antes de qualquer pagamento: o Asaas retornou HTTP `422` porque `RECURRENT` aceita somente `CREDIT_CARD` no Checkout com Assinatura; o código ainda enviava `PIX` e `CREDIT_CARD` juntos.
- A tentativa rejeitada foi registrada como falha técnica e não gerou link, cobrança ou pagamento.
- O adaptador foi corrigido para enviar somente `CREDIT_CARD`, e o checkout passou a registrar `forma_pagamento = cartao` desde a criação.
- O build de produção e o ESLint dos dois arquivos alterados foram aprovados. O lint completo ainda aponta um erro preexistente em `apps/adm/create_user.js`, fora desta correção.
- A correção foi versionada com a autoria oficial de Rafa no commit `108f9fa`, publicada pela PR 43 e incorporada à `main` pelo merge `602fff4`.
- O deploy automático do `garagem-adm` concluiu em produção com estado `Ready`.
- A segunda tentativa retornou HTTP `201` e criou o checkout real do plano Base mensal, sem módulos e sem pagamento.
- O Asaas apresentou subtotal e total de R$ 39,92, recorrência mensal, primeira cobrança em 12/10/2026 e validade de 24 horas.
- O banco confirmou preço de lista de R$ 49,90, desconto de 20%, preço final de R$ 39,92, ambiente `producao`, forma `cartao`, gateway criado e status `aguardando_pagamento`.
- O checkout permaneceu sem `barbearia_id`, confirmando que o provisionamento não ocorreu antes do pagamento.
- Nenhum CPF, endereço ou dado de cartão foi preenchido; a Rodada 1 terminou antes da etapa financeira, conforme planejado.

## Próxima decisão — Rodada 2

- O teste financeiro de ponta a ponta deverá usar cartão real, não PIX, porque esta integração cria uma assinatura recorrente pelo Checkout hospedado.
- Antes da Rodada 2, revisar a jornada e decidir se o custo e a criação temporária de tenant, convite e assinatura justificam o teste financeiro em produção.
- O preenchimento e a confirmação do pagamento exigirão autorização específica do responsável no momento da execução.

# 12/10/2026 — Rodada 2 financeira concluída

- O checkout Base mensal foi pago em produção no valor de R$ 39,92.
- Os eventos `PAYMENT_CONFIRMED` e `CHECKOUT_PAID` foram recebidos e processados sem erro.
- O Garagem provisionou automaticamente barbearia, administrador, perfil ativo, assinatura e recorrência; todas as etapas internas terminaram como concluídas.
- A assinatura de homologação foi removida no Asaas, encerrando as cobranças futuras.
- O estorno integral de R$ 39,92 foi solicitado com sucesso. O webhook `PAYMENT_REFUNDED` foi processado e a assinatura local passou para `suspenso`.
- Ficou aprovada a futura gestão dessas operações pelo ADM usando a API de produção do Asaas: cancelamento definitivo por `DELETE /v3/subscriptions/{id}` e estorno por `POST /v3/payments/{id}/refund`.
- O futuro fluxo do ADM será restrito ao `super_admin`, exigirá motivo e confirmação reforçada, registrará auditoria completa e acompanhará a conclusão por webhook.
- Pendência técnica identificada: tratar `SUBSCRIPTION_DELETED` para que a remoção da recorrência também leve a assinatura local ao estado `cancelado`, sem depender do evento de estorno.
- O desconto manual no ADM continua anotado para implementação posterior, com vigência, motivo, auditoria e sincronização apenas das cobranças futuras.

# 13/10/2026 — Agenda em tempo real, Web Push e atendimento ativo

- Foi confirmada em produção a proteção atômica contra choque de horários. Portal, agendamento manual e encaixe usam a mesma trava transacional por profissional; quando duas operações disputam o mesmo intervalo, somente a primeira é gravada e a segunda recebe a indicação de horário indisponível.
- A agenda administrativa e o painel do barbeiro continuam sendo atualizados pelo Supabase Realtime e também refazem a consulta quando o usuário retorna ao aplicativo.
- Foi implementado Web Push para novos agendamentos criados pelo Portal do Cliente. O dono e os administradores da barbearia recebem o aviso; o barbeiro recebe apenas quando o agendamento pertence a ele.
- Cada usuário precisa tocar uma única vez em **Ativar avisos** e permitir as notificações no navegador. O aviso pode chegar com o Garagem fechado e, ao ser aberto, leva o dono para `/admin/agenda` e o barbeiro para `/barber/dashboard`.
- Em iPhone e iPad, a barbearia precisa adicionar o Garagem à Tela de Início antes de ativar Web Push. Nos demais navegadores compatíveis, basta conceder a permissão solicitada.
- As inscrições são isoladas por barbearia e usuário. Inscrições expiradas são desativadas automaticamente, e o disparo usa fila assíncrona para nunca impedir a criação do agendamento.
- O bloqueio percebido no botão **Iniciar corte** foi diagnosticado: o banco impedia corretamente um segundo atendimento ativo, mas o atendimento anterior podia estar em outro dia e não ficava visível na tela atual.
- O painel do barbeiro agora mostra **Atendimento em andamento**, com cliente, serviço, horário de início e a ação **Abrir atendimento**. A ação leva à data original e permite concluir inclusive um atendimento iniciado em dia anterior.
- Enquanto houver outro corte em andamento, os demais botões de início ficam desabilitados e explicam o motivo. A função do banco também ganhou uma trava por barbeiro para impedir que dois cliques simultâneos iniciem clientes diferentes.
- A migration `20261013110000_push_agenda_e_atendimento_ativo.sql` foi aplicada no Supabase de produção e a Edge Function `push-appointment` foi publicada como ativa. A chave privada VAPID permanece somente nos segredos do Supabase.
- As alterações foram incorporadas à `main` pelas PRs 46 e 47 e publicadas em `https://app.garagemsystem.com.br`.
- Verificações concluídas: ESLint, build de produção, testes focados de Realtime, agenda do barbeiro e Web Push, endpoint da função e conteúdo do service worker publicado.
- Limitação da validação local: os testes de integração que dependem do PostgreSQL local não puderam ser executados porque o Docker Desktop estava indisponível. A migration e a função foram validadas diretamente no ambiente remoto.

## Backlog aprovado — inteligência de duração dos serviços

- Em uma etapa posterior, o gestor receberá indicadores baseados no tempo real entre `iniciado_em` e `concluido_em` de cada atendimento.
- A análise deverá permitir comparar duração prevista e realizada por barbeiro, serviço e período, com média, mediana, variação e quantidade de atendimentos válidos.
- Cancelamentos, ausências, registros incompletos e tempos claramente anômalos devem ficar fora dos indicadores principais ou aparecer identificados separadamente.
- O objetivo é ajudar a barbearia a ajustar agenda, duração dos serviços, capacidade da equipe e necessidade de treinamento. A métrica não deve virar ranking punitivo nem misturar tempo de espera ou cobrança com o tempo técnico do corte.
- A implementação futura deve aproveitar os timestamps já existentes, preservar o histórico e apresentar somente dados da própria barbearia.

# 13/10/2026 — Fila do balcão: consistência após conclusão

- Foi corrigido o caso em que um atendimento já concluído ainda aparecia como pendente na fila da recepção.
- A função `recepcao_fila_listar()` agora confirma também o status do agendamento e só retorna registros cujo agendamento continua em `aguardando_pagamento`.
- A tela do balcão passou a atualizar por mudanças em `atendimento_pendencias` e `agendamentos`, além de ignorar respostas antigas de carregamentos concorrentes.
- A migration `20261013150000_recepcao_fila_status_consistencia.sql` está pronta para aplicação no Supabase de produção.
- Validações concluídas: teste focado da fila, ESLint e build de produção.

# 13/10/2026 — Clube Garagem apresentado na Landing Page

- A Landing Page passou a apresentar o `Clube Garagem` como feature em pré-lançamento.
- A comunicação explica a proposta: a barbearia poderá criar planos recorrentes para clientes, definir benefícios e acompanhar membros e pagamentos no ADM.
- O texto evita prometer disponibilidade, preço ou cobrança antes da implementação financeira do módulo.
- Foi incluído um CTA para o WhatsApp, permitindo registrar interesse sem criar assinatura ou plano.
- A seção foi posicionada junto aos módulos comerciais, antes dos recursos futuros, com adaptação responsiva para celular.

# 13/10/2026 — Atalho do webapp no celular

- O Garagem já possuía manifesto PWA, ícone, `display: standalone` e service worker; faltava orientar a instalação para a equipe.
- Foi criado o aviso **Use o Garagem como app**, disponível no login e nas áreas protegidas do gestor, barbeiro e recepção.
- Android/Chrome recebe o botão **Instalar app** pelo evento nativo `beforeinstallprompt`.
- iPhone/iPad recebem a orientação curta **Compartilhar → Adicionar à Tela de Início**, que é o fluxo exigido pelo iOS.
- O aviso respeita sessões instaladas e pode ser fechado sem bloquear o restante do sistema.

# 13/10/2026 — Conclusão de atendimento de teste

- O botão **Enviar para cobrança** estava corretamente protegido, mas sem explicar o motivo do bloqueio.
- No fluxo com recepção ativa, o barbeiro precisa registrar o **estilo do corte** antes de enviar o atendimento ao balcão; materiais e produtos podem permanecer sem alteração.
- O rodapé do modal agora informa claramente quando falta o estilo ou quando ainda há carregamento de dados, e os campos de estilo foram marcados como obrigatórios.
- A validação continua preservando a memória do corte e impedindo conclusões sem dados mínimos.

# 13/10/2026 — Histórico do cliente atualizado após atendimento

- O portal do cliente carregava `portal_dados` apenas ao entrar na sessão. Quando um corte era concluído no ADM com o portal já aberto, o cliente continuava vendo a lista antiga.
- O portal agora consulta os dados ao abrir a aba **Cortes**, ao retornar à janela e a cada 30 segundos enquanto a sessão estiver visível.
- O registro de histórico continua vindo de `cliente_cortes`, criado tanto no checkout direto quanto no envio para a fila da recepção; a correção evita exigir logout ou recarga manual.
- Testes focados do portal/fila, ESLint e build de produção foram aprovados.

# 14/10/2026 — Acompanhamento e reenvio de convites dos clientes

- A lista **Barbearias** do ADM passou a mostrar, para cada administrador, se o convite está pendente ou aceito e se o primeiro login já ocorreu, sempre com as datas disponíveis no Supabase Auth.
- O super administrador da plataforma ganhou a ação **Reenviar convite**, disponível somente enquanto o administrador do cliente continua ativo e ainda não confirmou o acesso.
- O servidor revalida o vínculo entre usuário, papel e barbearia antes do envio; acessos já confirmados ou inativos não recebem um novo convite.
- Cada reenvio feito pelo ADM registra o operador, o estado anterior do acesso e a data da nova emissão em `saas_auditoria`.
- A alteração foi incorporada pela PR 53 e publicada com sucesso no projeto `garagem-adm`, no domínio oficial `https://adm.garagemsystem.com.br`.
- A consulta de produção confirmou que o primeiro cliente fundador permanecia com convite pendente e sem primeiro login. O convite foi reenviado em produção em 14/10/2026 às 09:50 (horário de Brasília), e a execução foi registrada na auditoria como ação de sistema.
- Verificações concluídas: ESLint e build de produção do ADM, previews da Vercel, deploy da `main`, rota protegida no domínio oficial e leitura posterior do estado do usuário no Supabase Auth.

# 14/10/2026 — Link direto de primeiro acesso

- O ADM ganhou a ação **Gerar link** para administradores com convite pendente, permitindo entregar o primeiro acesso diretamente por WhatsApp ou outro canal privado sem depender do recebimento do e-mail.
- A geração continua restrita ao `super_admin`; o servidor confirma barbearia, papel, estado ativo e ausência de aceite ou primeiro login antes de emitir o link.
- A tela avisa que um novo link substitui os convites anteriores, pede confirmação antes da geração, mostra a validade de uma hora e oferece a ação **Copiar link**.
- O token é devolvido somente para a sessão que solicitou a geração. O link completo não é persistido no banco, na auditoria, nos logs do fluxo nem neste cofre.
- A auditoria registra operador, cliente, estado anterior, horário de geração, expiração e forma de entrega manual, sem registrar a credencial.
- A implementação foi incorporada pela PR 55 e publicada no projeto `garagem-adm` no domínio oficial.
- A validação em produção foi executada somente na unidade de homologação: tipo `invite`, redirecionamento para `https://app.garagemsystem.com.br/definir-senha`, usuário ainda não confirmado e auditoria registrada. O token de teste não foi exibido nem armazenado.
- Verificações concluídas: ESLint, build de produção, previews da Vercel, deploy da `main` e geração controlada contra o Supabase Auth de produção.

# 19/10/2026 — Correção do valor do serviço, geração do PIX e shell mobile nativo no encerramento do atendimento

- Corrigido o fluxo em que o atendimento ativo do barbeiro (carregarAtendimentoAtivo) perdia alor_final, duracao_minutos, dados do cliente e memória do último corte após recarga ou evento Realtime da agenda.
- A camada de dados da agenda (src/lib/agenda/api.js) agora mescla o atendimento ativo com a projeção completa da agenda do dia e hidrata alor_final a partir do agendamento ou, como fallback automático, do preço cadastrado em servicos.preco.
- O modal de conclusão (src/components/CutCompletionModal.jsx) passou a recuperar automaticamente o valor do serviço no banco caso o objeto do atendimento chegue sem alor_final preenchido.
- O painel de cobrança PIX (src/components/PixPaymentPanel.jsx) deixou de exibir spinner infinito quando o valor total está zerado, exibindo orientação explícita e gerando o QR Code imediatamente assim que o valor do serviço é carregado.
- A tela de fechamento do atendimento passou a operar no celular como shell nativo de aplicativo em tela cheia (`fullScreenMobile` em `src/components/ui/Modal.jsx` e `src/components/CutCompletionModal.jsx`), com cabeçalho e rodapé fixos respeitando as áreas seguras (`safe-area-inset`), rolagem vertical isolada (`overscroll-contain touch-pan-y`), `overflow-x-hidden` e correção do `col-span-2` no rodapé que gerava largura implícita extra e deixava a tela flutuando lateralmente ao toque.

# 19/10/2026 — Disponibilidade unificada nos agendamentos e encaixes

- O banco passou a validar jornada semanal, intervalo, folga, bloqueios pontuais, horários extras e a margem operacional antes de aceitar uma nova reserva.
- O formulário administrativo de novo corte deixou de aceitar horário livre digitado e agora apresenta somente os horários realmente disponíveis para o barbeiro, serviço e data escolhidos.
- O portal do cliente, o encaixe do barbeiro e o encaixe do administrador continuam usando o mesmo motor de horários e receberam testes específicos para impedir agendamentos durante o intervalo de almoço.
- Registros históricos e atendimentos já em andamento não são alterados pela nova proteção.

# 19/10/2026 — Dinheiro, maquininha e contas de recebimento separadas

- O fechamento do barbeiro passou a exigir uma confirmação explícita antes de concluir pagamentos presenciais: dinheiro somente após o operador confirmar que recebeu e conferiu o valor; débito e crédito somente após confirmar que a maquininha exibiu **APROVADO**.
- O Garagem não captura dados do cartão nem integra a adquirente nesta fase. A maquininha continua sendo operada externamente e o sistema registra a confirmação manual, a taxa e a data prevista de recebimento.
- Pagamentos em dinheiro são direcionados exclusivamente para uma conta financeira ativa do tipo `caixa`; débito e crédito são direcionados para uma conta ativa do tipo `cartao`; PIX e outras modalidades permanecem na conta principal.
- O ADM financeiro ganhou indicadores para **Dinheiro no caixa** e **Débito e crédito**, com atalhos de cadastro já preenchidos com o tipo necessário.
- Se a conta específica não estiver cadastrada, o pagamento é bloqueado com orientação ao ADM, sem lançar o valor silenciosamente na conta principal.
- A mesma regra de destino foi aplicada aos checkouts do barbeiro, às cobranças da recepção e às vendas avulsas do balcão.

# 20/10/2026 — Mapa conectado à agenda administrativa e equipe visível no Portal

- O alerta de agendamento pendente no **Mapa da barbearia** deixou de encaminhar o gestor ao balcão operacional da Recepção. O núcleo Agenda e as conexões de atendimentos agora abrem a agenda administrativa.
- Cada item do mapa leva a data e o identificador do agendamento na navegação. A agenda abre diretamente a visão do dia, rola até o registro correspondente e destaca a pendência indicada.
- A correção preserva a separação de permissões: o gestor não recebe acesso implícito ao balcão da Recepção, que continua restrito aos operadores autorizados do módulo.
- No agendamento do **Portal do Cliente**, a escolha de barbeiro deixou de depender de rolagem lateral. “Primeiro disponível” e todos os profissionais são exibidos em uma grade responsiva, com duas colunas no celular e três ou quatro em telas maiores.
- Fotos, indicação de barbeiro favorito, estado selecionado e avanço guiado entre serviço, profissional e data foram preservados.
- Foram adicionados testes para o destino contextual do mapa, a abertura da agenda administrativa e a ausência do carrossel horizontal na equipe do portal.

# 22/10/2026 — Clientes sem CPF e atendimento sem atrito

- O CPF passou a ser opcional no cadastro administrativo. Nome igual deixou de depender desse documento: telefone, histórico de atendimentos, última visita e barbeiro favorito ajudam a equipe a diferenciar homônimos.
- O sistema alerta sobre possível duplicidade antes de criar uma ficha e a gestão pode unir cadastros duplicados com trilha de auditoria e bloqueio para CPFs diferentes.
- O barbeiro ganhou o registro de encaixe já iniciado no mesmo dia. O atendimento recebe marca permanente de retroativo, horário real informado e autoria do lançamento.
- Enquanto existe atendimento em andamento, o aplicativo solicita ao aparelho que mantenha a tela ativa e informa quando o recurso não é suportado.
- Foram publicados avisos segmentados nos aplicativos da gestão e do barbeiro explicando as mudanças.
- O Portal do Cliente permaneceu no método atual; nenhuma contratação ou configuração de SMS fez parte desta publicação.
- As migrations `20261022100000`, `20261022110000`, `20261022130000` e `20261022150000` foram aplicadas e verificadas no Supabase de produção.
- A PR 77 foi incorporada à `main` no commit `c042c9cd012148cc7e30751b211bc3d74927c32a`; os deploys de produção dos projetos `garagem-app` e `garagem-adm` terminaram com sucesso.
- Os domínios `https://app.garagemsystem.com.br/login` e `https://adm.garagemsystem.com.br` responderam com HTTP 200, e o bundle oficial foi conferido com as novas funcionalidades.
- O relatório detalhado da entrega e da operação de publicação está em `Entrega 22-10-2026 - Clientes e atendimento.md`.

# 22/10/2026 — CPF opcional também no Portal do Cliente

- O fluxo principal do Portal passou a solicitar nome e WhatsApp; o CPF aparece como campo opcional e não bloqueia mais o agendamento.
- Clientes que informam CPF continuam podendo abrir o histórico, as fotos e as preferências já registradas.
- Sem CPF, o Portal cria um acesso limitado que mostra somente os agendamentos feitos naquela sessão. Histórico, fotos e edição das preferências anteriores não são liberados por nome ou telefone.
- Nome e telefone iguais podem reutilizar a ficha operacional sem expor dados privados, reduzindo duplicidade sem transformar o telefone em autenticação.
- A equipe recebe o comunicado interno **Portal agora agenda sem CPF** nos aplicativos da gestão e do barbeiro.
- A entrega não usa SMS, OTP ou provedor externo. O relatório detalhado está em `Entrega 22-10-2026 - Portal sem CPF.md`.

# 23/10/2026 — Horário reservado explícito no Portal

- O Portal deixou de exibir **Aguardando confirmação** depois do agendamento. Reservas nos estados `pendente` e `confirmado` agora aparecem como **Horário reservado** em estado visual positivo.
- O cartão do atendimento reforça de forma permanente: **Este horário já está reservado para você.** O aviso temporário após salvar foi preservado.
- A mudança é somente de comunicação e cobre registros legados; disponibilidade, proteção contra conflito e cancelamento não foram alterados.
- A PR 81 foi incorporada à `main` no commit `dce8e5f1f23b8f0b441c1134ac50acc6db19bb93`, às 09:24 no horário de Brasília.
- Os deployments de produção terminaram com sucesso na Vercel:
  - `garagem-app`: `2f1SQXZW2X3LVtir3BF3Mf2c5ERw`;
  - `garagem-adm`: `DRjAdAMn5HfnVRnjfYG6DJABH8Sc`.
- O domínio `https://app.garagemsystem.com.br` respondeu com HTTP 200. O bundle oficial contém **Horário reservado** e **Este horário já está reservado para você**, sem a expressão **Aguardando confirmação**.
- Depois da confirmação do frontend, a migration `20261023100000_portal_horario_reservado_comunicado.sql` foi aplicada pelo SQL Editor e registrada em `supabase_migrations.schema_migrations`.
- O comunicado **Portal confirma o horário reservado** foi publicado às 09:28:32 para gestão e barbeiros, com destinos `/admin/configuracoes` e `/barber/dashboard`.
- Validações concluídas: dois testes direcionados, ESLint, build de produção, checks dos dois projetos da Vercel, inspeção do bundle oficial e leitura posterior do comunicado e da migration no Supabase.
