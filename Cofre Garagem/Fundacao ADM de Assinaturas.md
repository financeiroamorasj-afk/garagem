# Fundação do ADM de Assinaturas

Data: 27/09/2026
Status: schema e regras centrais preparados; interface e Asaas pendentes

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

## Decisões preservadas

- preços não foram definidos nem copiados do Rebip;
- Asaas não é pré-requisito para o primeiro membro fundador;
- nenhuma senha será migrada ou criada pelo ADM;
- CPF/CNPJ integral e cartão não serão persistidos;
- uma mesma conta Asaas pode atender Rebip e Garagem usando namespaces separados;
- IA e CRM permanecem depois do ADM mínimo.

## Próximo passo autônomo

Criar a aplicação separada `adm.garagemsystembarber.com.br` e implementar login, catálogo de planos e gestão manual das assinaturas.

## Próximo passo com Rafa

Discutir preços, desconto e duração de membros fundadores, módulos por plano e validar o primeiro ciclo no sandbox do Asaas.
