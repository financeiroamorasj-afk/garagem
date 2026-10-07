# Fundação do ADM de Assinaturas

Data: 27/09/2026 — validado em 28/09/2026
Status: fundação aplicada em produção; interface inicial publicada com domínio próprio e HTTPS; super_admin de produção criado; Asaas pendente

## Entregue sem depender do proprietário

- catálogo central de produtos, planos, módulos e ofertas;
- separação entre checkout, assinatura e barbearia provisionada;
- suporte a ativação manual do membro fundador;
- máquina de estados com concorrência otimista;
- eventos de gateway idempotentes e separados entre sandbox/produção;
- auditoria real;
- provisionamento retomável por etapas;
- integração dos módulos contratados com o entitlement de recepção;
- bloqueio completo das tabelas SaaS para usuários comuns das barbearias.

## Validação de 28/09/2026

- migration `20260927120000` aplicada em produção e confirmada no histórico remoto;
- acesso anônimo às tabelas da plataforma bloqueado com resposta HTTP 401;
- banco local reconstruído integralmente desde a baseline, com 48 migrations em sequência;
- snapshot emergencial de recuperação preservado em `supabase/repairs/` e retirado do caminho de instalações limpas;
- suíte completa aprovada: 110 testes, sem falhas;
- lint e build de produção aprovados;
- usuário local `admin@teste.local` validado como administrador da barbearia e `super_admin` da plataforma.

## Decisões preservadas

- preços oficiais do Garagem registrados em `Cofre Garagem/Plano Comercial e Valores.md` e aplicados ao catálogo próprio, sem copiar valores do Rebip;
- Asaas não é pré-requisito para o primeiro membro fundador;
- nenhuma senha será migrada ou criada pelo ADM;
- CPF/CNPJ integral e cartão não serão persistidos;
- uma mesma conta Asaas pode atender Rebip e Garagem usando namespaces separados;
- IA e CRM permanecem depois do ADM mínimo.

## Interface inicial — 28/09/2026

- criada uma aplicação Next.js separada em `apps/adm`, publicada separadamente e preparada para o domínio `adm.garagemsystem.com.br`;
- autenticação SSR por cookies conectada ao Supabase, com validação de usuário e papel de plataforma no servidor;
- controle de acesso por função para `super_admin`, `financeiro` e `suporte`;
- painel inicial conectado aos dados reais de planos, barbearias, assinaturas e checkouts;
- telas somente leitura de planos, barbearias e assinaturas, sem preços fictícios e sem operações comerciais simuladas;
- chave `service_role` isolada no servidor e documentada como variável exclusiva do projeto ADM;
- aplicação responsiva e alinhada à identidade visual cobre/preta do Garagem;
- testes específicos, lint e build de produção aprovados.

## Configurações e integrações — 28/09/2026

- adicionada ao ADM a área central de configurações da plataforma;
- Asaas definido como gateway inicial de assinaturas, sem acoplamento definitivo ao provedor;
- catálogo de integrações separado por produto, categoria, provedor e ambiente;
- chaves de API nunca são persistidas no banco: somente o nome da variável segura e seu estado são exibidos;
- controle central de módulos passa a exibir status, entitlement e preço adicional ainda não definido;
- registrados em rascunho os complementos `IA para gestão` e `IA para atendimento no WhatsApp`;
- cada IA possui configuração independente de provedor, endpoint, modelo e limites futuros;
- pendências preservadas: edição auditada, teste de conexão, consumo por assinatura, canal oficial do WhatsApp e definição comercial.

## Próximo passo autônomo

Adicionar as operações auditadas do ADM: cadastro e edição de planos, ativação manual do membro fundador, gestão de módulos contratados e edição/teste das integrações.

## Próximo passo de infraestrutura

- projeto separado `garagem-adm` criado na Vercel e publicado em `https://garagem-adm.vercel.app`;
- variáveis de produção do Supabase configuradas no projeto independente;
- build Next.js validado e rotas `/` e `/login` verificadas em produção;
- PR 22 criada para versionar o `vercel.json` específico de `apps/adm` e impedir a herança da saída `dist` do frontend Vite;
- domínio `adm.garagemsystem.com.br` configurado no Registro.br com registro A para `76.76.21.21`, validado na Vercel e protegido por certificado SSL com renovação automática;
- usuário `systemgaragem@gmail.com` vinculado em produção à tabela `plataforma_admins` como `super_admin` ativo em 28/09/2026.

## Próximo passo com Rafa

Validar a proposta de preços, desconto e duração de membros fundadores, módulos por plano e primeiro ciclo no sandbox do Asaas. A proposta atual está no documento `Cofre Garagem/Plano Comercial e Valores.md`.

## Motor de pagamentos — atualização de 05/10/2026

- a Roosh Studio será a titular e remetente comercial da conta Asaas usada pelos sistemas; o e-mail operacional configurado é `rooshstudioprojetos@gmail.com`;
- o Garagem continua isolado por referência externa iniciada por `garagem_`, ID próprio de checkout e webhook dedicado;
- o endpoint `POST /api/checkouts` foi refeito para usar o Checkout hospedado oficial do Asaas, com PIX e cartão, sem capturar CPF/CNPJ ou dados de cartão na Landing Page;
- toda contratação passa a ser registrada em `saas_checkouts` antes da chamada externa, com chave de idempotência, snapshot de preço, plano, módulos e quantidade de profissionais adicionais;
- criada a migration `20261005143000_checkout_asaas_hospedado.sql`, ainda pendente de aplicação, para registrar o ID do checkout e os módulos adquiridos;
- o endpoint `POST /api/webhooks/asaas` valida o segredo sem registrá-lo em log, usa o ID único do evento para idempotência, salva somente um payload sanitizado e aceita reentregas sem erro;
- eventos financeiros confirmados iniciam o provisionamento idempotente da barbearia, convite do administrador, assinatura e módulos;
- o ADM de assinaturas passa a exibir assinaturas, checkouts recentes e eventos do gateway;
- a oferta inicial não será apresentada como teste grátis irrestrito. O fluxo comercial será assinatura paga com garantia comercial de cancelamento e estorno integral em até 7 dias corridos;
- a Landing Page passa a abrir um formulário mínimo e depois direcionar o comprador ao ambiente do Asaas. A publicação ficará bloqueada até a homologação completa no Sandbox;
- decisão de marca: `Garagem System, desenvolvido pela Roosh Studio · criação de Rafael Ruch`.

## Próximos passos com Rafa

1. criar ou acessar a conta Sandbox vinculada à Roosh Studio;
2. gerar uma API Key exclusiva para a integração do Garagem;
3. configurar na Vercel `ASAAS_ENVIRONMENT`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `CHECKOUT_ALLOWED_ORIGINS`, `GARAGEM_LANDING_URL` e `GARAGEM_APP_URL`;
4. aplicar a migration pendente;
5. publicar primeiro o ADM, cadastrar o webhook e somente depois publicar a Landing Page;
6. homologar compra, reentrega de webhook, convite, cancelamento, expiração, recusa, atraso e estorno antes de trocar para Produção.

## Implantação manual — atualização de 07/10/2026

- o `super_admin` pode criar uma barbearia pelo ADM sem depender do Asaas;
- o formulário registra responsável, plano, ciclo e módulos usando o mesmo catálogo oficial do checkout;
- a assinatura recebe origem `manual`, fica ativa imediatamente e preserva preço, desconto e módulos contratados;
- o provisionamento reutiliza as mesmas etapas idempotentes: tenant, usuário de autenticação, perfil, assinatura, entitlements e convite por e-mail;
- nenhuma cobrança é criada automaticamente: enquanto a integração não estiver homologada, a cobrança continua sendo emitida e acompanhada manualmente pela Roosh Studio;
- assinaturas manuais aparecem no painel de Assinaturas com a origem da cobrança identificada;
- criada a migration `20261007100000_provisionamento_manual_tenant.sql`, dependente da migration do Checkout hospedado e ainda pendente de aplicação em produção.
