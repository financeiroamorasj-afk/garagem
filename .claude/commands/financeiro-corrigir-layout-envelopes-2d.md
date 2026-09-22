---
description: "Corrige alinhamento, hierarquia e responsividade da tela de Envelopes em localhost, sem alterar lógica financeira."
---

# /financeiro-corrigir-layout-envelopes-2d

## Escopo

Corrigir somente apresentação e CSS da rota `/admin/financeiro/envelopes`. Não alterar RPCs, wrappers, autorização, valores exibidos, migrations, banco, ações financeiras, commit ou push.

## Diagnóstico visual confirmado

A tela atual usa largura excessiva e deixa os elementos desconectados: o resumo ocupa uma área pequena à esquerda, a ação de distribuição fica distante do título de seção e a grade de envelopes não organiza o espaço disponível de modo harmônico.

## Correção obrigatória

1. Criar uma coluna de conteúdo com largura máxima coerente com as demais telas administrativas e margens internas consistentes. Não ocupar toda a largura em desktop sem necessidade.

2. Organizar o cabeçalho “Reservas por propósito” e a ação futura em um mesmo bloco de seção:

- desktop: título/descrição e ação alinhados dentro da mesma largura de conteúdo;
- tablet/móvel: ação abaixo da descrição, sem alinhamento forçado à extremidade da tela;
- ação continua desabilitada e não muda lógica.

3. Transformar “Disponibilidade por conta” em uma grade de cards com largura equilibrada:

- desktop: cards com largura mínima legível e até três colunas conforme espaço;
- uma única conta não deve parecer perdida em uma área vazia;
- valores bancário, reservado e disponível devem ter hierarquia consistente e alinhamento previsível;
- manter a explicação de reserva lógica no rodapé do card, sem competir com os valores.

4. A grade de envelopes deve ser a protagonista:

- cards com largura e altura equilibradas;
- desktop: duas ou três colunas, conforme o container; tablet duas; 360 px uma;
- não usar posicionamento absoluto, margens mágicas, larguras fixas grandes ou `justify-content: space-between` em elementos que separem conteúdo e ações;
- preservar o card, medidor, extrato e estados já aprovados.

5. Revisar espaçamento vertical entre título, resumo, seção de contas e cards. Usar tokens existentes e ritmo visual próximo das telas FinanceOverview/Cadastros, sem criar cores, sombras, gradientes ou dependências.

6. Garantir que em 360 px não exista overflow horizontal do documento e que botões/modal mantenham área de toque e foco visível.

## Validação

Rodar lint dos arquivos alterados, testes, build e `git diff --check`. Subir localhost e revisar visualmente desktop e 360 px se houver navegador conectado; caso contrário, solicitar revisão humana com as duas larguras.

## Relatório

Entregar `Relatório /financeiro-corrigir-layout-envelopes-2d` com arquivos alterados, decisões de layout, validações e URL localhost. Confirmar que nenhuma operação de dados, migration, commit ou alteração remota ocorreu.

