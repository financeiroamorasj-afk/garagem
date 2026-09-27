# Decisões de Desenvolvimento — MVP Garagem System

Registro de decisões para evitar que o escopo do MVP cresça antes do primeiro uso real.

## Escopo mínimo do primeiro membro fundador

O sistema precisa permitir que uma barbearia real:

- cadastre equipe, clientes, serviços e produtos;
- organize a agenda e as disponibilidades;
- use portal do cliente;
- registre atendimentos e venda de produtos;
- calcule comissões;
- faça cobrança manual no balcão ou com o barbeiro;
- apresente QR Code PIX e valide o comprovante manualmente;
- acompanhe o financeiro básico com segurança.

## O que fica manual nesta fase

### Pagamento do atendimento

O QR Code PIX não terá identificação automática do pagamento neste momento. O fluxo será:

1. o sistema gera o QR Code com a chave PIX da barbearia;
2. o cliente realiza o pagamento;
3. o cliente apresenta o comprovante;
4. o barbeiro ou a recepção confirma o recebimento no sistema.

Não implementar agora webhook, conciliação bancária ou confirmação automática por atendimento.

### IA

A IA não é bloqueadora do MVP. Podemos apresentar a funcionalidade dentro do app, mas a operação inicial não deve depender dela.

### CRM

O CRM será iniciado depois do ADM de assinaturas. Até lá, os leads podem continuar chegando pelo WhatsApp da landing page.

## ADM de assinaturas — primeira versão

O ADM deverá permitir que o próprio lead assine o Garagem System:

- cadastro básico;
- seleção do plano;
- cartão de crédito ou PIX;
- confirmação de pagamento;
- ativação da assinatura;
- controle do período e status;
- módulos adicionais por assinatura;
- desconto e identificação de membro fundador.

Essa cobrança é a assinatura do software, não a cobrança de cada corte realizado na barbearia.

## Critério de prontidão do MVP

O MVP só deve ser considerado pronto quando:

- o banco de produção estiver limpo e com migrations conferidas;
- não houver fluxo crítico dependente de tabela legada sem revisão;
- RLS e storage estiverem validados;
- o primeiro membro fundador conseguir operar uma semana de rotina;
- houver caminho seguro de backup, deploy e rollback;
- os erros críticos dos fluxos de agenda, recepção, portal, estoque e cobrança manual estiverem tratados.

## Depois do MVP

1. ADM completo e gestão comercial avançada.
2. CRM e atendimento de leads.
3. IA para barbeiro, proprietário e WhatsApp.
4. Automação de pagamentos, conciliação e notificações.
