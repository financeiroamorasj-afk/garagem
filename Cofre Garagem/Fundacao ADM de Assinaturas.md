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

- preços não foram definidos nem copiados do Rebip;
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

Discutir preços, desconto e duração de membros fundadores, módulos por plano e validar o primeiro ciclo no sandbox do Asaas.
