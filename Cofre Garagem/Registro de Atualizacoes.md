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
