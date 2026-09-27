# ADM de assinaturas — fundação do Garagem System

Status: fundação implementada, integração de gateway e interface ainda pendentes.
Migration: `20260927120000_adm_assinaturas_fundacao.sql`.

## Decisão de arquitetura

O ADM será uma aplicação separada em `adm.garagemsystembarber.com.br`, mas usará o mesmo projeto Supabase do Garagem. O frontend operacional das barbearias não receberá credenciais nem rotas administrativas da plataforma.

As tabelas comerciais ficam no schema `public` porque o ADM usará Supabase via servidor, mas nascem com RLS habilitado, sem policies para usuários comuns e com privilégios de tabela exclusivos de `service_role`. A sessão do operador é validada contra `plataforma_admins` antes de qualquer acesso privilegiado.

## O que foi reaproveitado do ADM Rebip

- separação entre intenção de contratação e tenant provisionado;
- namespace do produto no gateway;
- webhook idempotente por identificador do evento;
- provisionamento retomável por etapas;
- desconto de membro fundador como snapshot da contratação;
- concorrência otimista em mudanças de assinatura.

Não foram copiados:

- preços hardcoded ou repetidos no frontend;
- auditoria simulada;
- dependência do Asaas para ativar o primeiro cliente;
- payload bruto de webhook com dados pessoais;
- criação de senha temporária.

## Modelo criado

- `plataforma_produtos`: separa Garagem de outros produtos que usem a mesma conta Asaas. O prefixo do Garagem é `garagem`.
- `plataforma_admins`: operadores do ADM com papéis `super_admin`, `financeiro` e `suporte`.
- `saas_planos`: catálogo central. Preços podem ficar nulos enquanto o plano estiver em rascunho.
- `saas_modulos` e `saas_plano_modulos`: adicionais e módulos incluídos por plano.
- `saas_ofertas`: descontos e ofertas de membros fundadores, sem valores predefinidos.
- `saas_checkouts`: contratação antes de existir uma barbearia. Não guarda documento integral nem dados de cartão.
- `saas_assinaturas`: fonte de verdade do contrato da barbearia.
- `saas_assinatura_modulos`: adicionais contratados.
- `saas_provisionamento_etapas`: retomada idempotente do onboarding.
- `saas_gateway_eventos`: inbox de webhooks separada por ambiente e produto.
- `saas_auditoria`: trilha real das ações do backoffice.

## Operação sem gateway

O primeiro membro fundador poderá ser ativado manualmente pelo ADM:

1. cadastrar os planos e preços aprovados;
2. criar ou selecionar a barbearia;
3. criar a assinatura com o preço e desconto congelados;
4. marcar a assinatura como `trial` ou `ativo`;
5. sincronizar os módulos contratados;
6. enviar o convite normal de primeiro acesso.

Isso permite iniciar o MVP sem depender do Asaas. Quando o gateway entrar, ele produzirá os mesmos estados e eventos.

## Organização da conta Asaas

É possível usar uma única conta Asaas para Rebip e Garagem desde que cada cobrança carregue uma referência externa com namespace. Para o Garagem:

`garagem:{checkout_id}` ou `garagem:{assinatura_id}`.

O webhook do Garagem deve aceitar somente referências com o prefixo `garagem`, além de validar o token e o ambiente. A chave idempotente é `(provider, ambiente, event_id)`, impedindo colisão entre sandbox e produção.

Nenhuma chave, token ou configuração do Asaas é criada por esta fundação.

## Máquina de estados

Estados: `aguardando_pagamento`, `trial`, `ativo`, `inadimplente`, `suspenso`, `cancelado`, `expirado`.

A função `saas_assinatura_mudar_status`:

- rejeita transições inválidas;
- exige motivo;
- usa `expected_version` para evitar duas alterações concorrentes;
- grava auditoria;
- sincroniza o entitlement de recepção;
- é executável somente por `service_role`.

Cancelado e expirado são terminais. Reativação futura deverá criar uma nova assinatura, preservando histórico.

## Segurança e privacidade

- o navegador da barbearia não lê tabelas SaaS;
- `service_role` existe somente no servidor do ADM;
- cartão fica exclusivamente no checkout hospedado pelo gateway;
- CPF/CNPJ integral deve ser enviado diretamente ao gateway e descartado; o Garagem persiste somente hash e quatro últimos dígitos;
- webhooks guardam payload sanitizado e hash, não o corpo bruto;
- sandbox e produção são estados explícitos;
- alterações administrativas reais geram auditoria.

## Próximas fatias

1. Criar o projeto Next.js separado do ADM com autenticação e middleware.
2. Construir telas de planos, barbearias e assinaturas usando somente dados reais.
3. Implementar ativação manual do membro fundador.
4. Definir preços e descontos com o proprietário antes de ativar qualquer plano.
5. Adicionar checkout público e provisionamento idempotente.
6. Integrar Asaas em sandbox e testar PIX/cartão/webhook.
7. Somente depois liberar produção e CRM de leads.

## Ações que dependem do proprietário

- discutir faixas de preço;
- definir benefício e duração dos membros fundadores;
- escolher quais módulos entram em cada plano;
- criar/confirmar o primeiro operador `super_admin`;
- fornecer ou configurar credenciais do sandbox Asaas;
- validar o fluxo visual e o pagamento real.
