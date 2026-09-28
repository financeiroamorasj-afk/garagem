# Fundação do ADM de Assinaturas

Data: 27/09/2026 — validado em 28/09/2026
Status: fundação aplicada em produção e validada localmente; interface inicial pronta para revisão; Asaas pendente

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

- criada uma aplicação Next.js separada em `apps/adm`, preparada para publicação independente em `adm.garagemsystembarber.com.br`;
- autenticação SSR por cookies conectada ao Supabase, com validação de usuário e papel de plataforma no servidor;
- controle de acesso por função para `super_admin`, `financeiro` e `suporte`;
- painel inicial conectado aos dados reais de planos, barbearias, assinaturas e checkouts;
- telas somente leitura de planos, barbearias e assinaturas, sem preços fictícios e sem operações comerciais simuladas;
- chave `service_role` isolada no servidor e documentada como variável exclusiva do projeto ADM;
- aplicação responsiva e alinhada à identidade visual cobre/preta do Garagem;
- testes específicos, lint e build de produção aprovados.

## Próximo passo autônomo

Adicionar as operações auditadas do ADM: cadastro e edição de planos, ativação manual do membro fundador e gestão de módulos contratados.

## Próximo passo de infraestrutura

Criar um projeto separado na Vercel com diretório raiz `apps/adm`, configurar as variáveis seguras e apontar o domínio `adm.garagemsystembarber.com.br`.

## Próximo passo com Rafa

Discutir preços, desconto e duração de membros fundadores, módulos por plano e validar o primeiro ciclo no sandbox do Asaas.
