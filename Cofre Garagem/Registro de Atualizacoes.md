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
