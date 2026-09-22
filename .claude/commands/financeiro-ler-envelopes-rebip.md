---
description: "Lê profundamente a experiência de envelopes do Rebip/Amora e produz uma especificação de adaptação, sem alterar código ou banco."
---

# /financeiro-ler-envelopes-rebip

## Contexto de execução

Execute este comando com a pasta do projeto **Rebip/Amora** aberta no Antigravity. O objetivo é estudar o sistema de referência, não o Garagem System.

Se o repositório aberto não for o Rebip/Amora ou os arquivos financeiros não puderem ser localizados, pare e informe o caminho necessário. Não invente comportamento a partir de sistemas genéricos.

## Objetivo

Mapear de ponta a ponta a experiência real de **envelopes financeiros** do Rebip/Amora para que ela possa ser adaptada posteriormente ao Garagem System com segurança e sem perder sua regra de negócio.

Esta é uma auditoria estritamente de leitura.

## Proibições

Não:

- alterar, criar, apagar ou formatar arquivos;
- rodar migrations, seeds ou scripts mutáveis;
- acessar ou alterar produção;
- usar SQL Editor, `db push`, `migration repair`, commits ou push;
- copiar chaves, `.env` ou credenciais para o relatório;
- propor o modelo de orçamento mensal como substituição do Rebip sem evidência explícita no código.

## Roteiro obrigatório de leitura

### 1. Localizar a implementação verdadeira

Use busca textual para localizar e ler integralmente os elementos relevantes, incluindo variações de nome:

```text
envelopes
envelopes_transacoes
PainelEnvelopes
aporte
resgate
distribuicao
percentual
lucro
resultado do dia
movimentacoes_financeiras
conciliacao
```

Priorize migrations/schema, APIs/rotas, serviços, scripts de cálculo e componentes de interface. Registre caminhos e símbolos realmente encontrados.

### 2. Schema e integridade

Para cada tabela, view, função ou índice relacionado a envelopes, documentar:

- colunas, tipos, defaults, `NOT NULL`, checks, PKs e FKs;
- relação entre envelope, transação de envelope, conta bancária, categoria e movimentação financeira;
- modelo de saldo: calculado, persistido ou híbrido;
- como impede saldo negativo, duplicidade, referência cruzada e concorrência;
- como aporte e resgate são representados e vinculados;
- estratégia de reversão/estorno, se existir;
- migrations onde cada regra foi introduzida.

### 3. Regra de negócio

Confirmar diretamente no código, sem inferir:

- como o lucro é calculado e quais entradas/saídas entram ou são excluídas;
- qual período e fuso horário são usados, em especial BRT;
- se envelopes recebem percentuais do lucro, valores fixos ou ambos;
- limites e regra de soma dos percentuais;
- finalidades padrão, como reserva, reinvestimento e sócios;
- quando ocorre uma distribuição e se ela pode ser repetida;
- como funcionam aporte, resgate, transferência e ajuste;
- quais pares de movimentações são gerados para evitar dupla contagem;
- idempotência, locks/transações e auditoria;
- papéis que podem visualizar, configurar ou movimentar envelopes.

Quando houver dados de demonstração, marcá-los explicitamente como demonstração; não tratá-los como regra.

### 4. Experiência de interface

Ler os componentes e rotas do Painel de Envelopes e documentar:

- navegação até o módulo;
- hierarquia visual, cards, métricas e tabelas;
- filtros de data/período;
- criação e edição de envelopes;
- fluxo e confirmações de aporte/resgate;
- estados vazio, loading, erro, excedente/negativo e permissões;
- quais números o usuário vê e como eles são explicados;
- comportamento desktop e móvel, se definido no código.

Não fazer screenshot, executar browser ou modificar UI; a tarefa é leitura do código.

### 5. Separar o que é portável

Classificar cada parte encontrada:

- **Portável para Garagem System** — regra financeira genérica e desejada;
- **Adaptar** — depende do modelo de uma barbearia, serviços, comissões ou contas já existentes;
- **Não portar** — específica do Rebip/Amora, consignação, marketplace ou outra operação sem equivalência.

Não desenhar tabelas/migrations para o Garagem nesta tarefa.

## Relatório obrigatório

Entregar `Relatório /financeiro-ler-envelopes-rebip` com:

1. confirmação do repositório analisado e caminhos lidos;
2. mapa de schema e relações reais;
3. ciclo completo: lucro → distribuição → envelope → aporte/resgate → ledger;
4. regras de integridade, idempotência, concorrência, permissões e auditoria;
5. descrição da experiência de UI;
6. tabela de itens portáveis/adaptáveis/não portáveis;
7. pontos ambíguos ou ausentes no código;
8. uma recomendação de escopo mínimo para o Garagem, claramente marcada como recomendação — não implementação;
9. evidência para cada conclusão: arquivo, função/componente e trecho relevante em paráfrase.

## Encerramento

Ao terminar, não implemente nada. Aguarde revisão humana do relatório; o próximo comando no Garagem será produzido somente depois dessa aprovação.

