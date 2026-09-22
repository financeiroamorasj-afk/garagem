---
description: "Cria e valida a prévia de design system para envelopes financeiros, sem conectar operações ou alterar banco."
---

# /financeiro-design-system-envelopes-fase-2d

## Objetivo

Criar uma prévia visual dos envelopes financeiros no design system aprovado antes de alterar telas operacionais. Esta etapa não cria rota funcional de envelopes, não chama RPCs mutáveis e não altera migrations, banco, permissões, dados, commit ou deploy.

## Leitura obrigatória

Ler integralmente antes de editar:

- `docs/design-system/DESIGN-SYSTEM.md`;
- `src/index.css`;
- primitivos em `src/components/ui`;
- `src/pages/DesignSystem.jsx`;
- contratos de leitura publicados: envelopes, transações e saldos disponíveis;
- `docs/financeiro/REFERENCIA-ENVELOPES-REBIP.md`.

Reutilizar tokens, tipografia, bordas, scrollbars, estados vazios, modais, tabelas e acessibilidade existentes. Não introduzir hex literal, gradiente, sombra decorativa, nova dependência ou visual copiado da Amora.

## Escopo visual

Adicionar à vitrine `/design-system` uma seção **Envelopes financeiros — demonstração visual** com dados fictícios identificados como demonstração:

1. cartão/linha de conta com:
   - saldo bancário;
   - reservado em envelopes;
   - saldo disponível;
   - explicação textual de que reserva não reduz o saldo bancário real.

2. grade de **cards de envelope**, inspirada na hierarquia funcional apresentada no Rebip, porém adaptada integralmente aos tokens e à identidade escura do Garagem:
   - nome e finalidade;
   - conta vinculada;
   - percentual de distribuição;
   - saldo reservado em destaque;
   - status ativo/inativo;
   - estados semânticos para disponível, atenção e sem saldo;
   - ação visual “Ver extrato” em cada card;
   - ação visual de “Usar / resgatar” apenas como demonstração inativa nesta etapa.

Cada card deve comunicar seu propósito de forma autônoma e ter densidade confortável. Em desktop, usar grade responsiva; em 360 px, um card por linha. Não recriar a paleta clara, botões arredondados, sombras ou a tipografia do Rebip.

3. medidor de reserva acessível:
   - proporção reservado/saldo bancário;
   - texto e valores equivalentes à informação visual;
   - sem depender apenas de cor;
   - tratar saldo bancário zero, saldo disponível negativo por dado legado e valores acima do previsto;
   - se exigir novo primitivo, criar um componente UI reutilizável, documentá-lo na vitrine e seguir os tokens existentes.

4. protótipo visual do **extrato por envelope**, aberto a partir de “Ver extrato”, explicitamente marcado como demonstração:
   - modal ou painel usando primitivo aprovado;
   - cabeçalho com envelope, conta vinculada e saldo atual;
   - tabela/linha temporal semântica com distribuição, resgate e estorno;
   - data BRT, descrição, entrada/saída e saldo após cada evento;
   - estados vazio, loading e erro;
   - sem qualquer escrita ou chamada de RPC mutável.

5. protótipo visual de ações futuras, explicitamente inativo ou marcado como demonstração:
   - distribuir lucro diário;
   - resgatar para conta a pagar;
   - sem callbacks que alterem dados.

6. estados de loading, erro, vazio e largura móvel de 360 px.

## Regras de linguagem e produto

- Usar “saldo bancário”, “reservado” e “disponível” com precisão.
- Explicar que distribuir/resgatar não cria uma segunda movimentação bancária.
- Não chamar envelope de conta bancária ou orçamento mensal.
- Não exibir fórmula de lucro como fato operacional fora do contexto de demonstração.

## Acessibilidade

- tabelas semânticas, caption e cabeçalhos adequados;
- medidor com texto alternativo e valor numérico;
- foco visível e controles por teclado;
- contraste e estado não dependentes apenas de cor;
- rolagem horizontal contida em tabelas no celular;
- respeitar `prefers-reduced-motion`.

## Validação

Rodar lint dos arquivos alterados, testes existentes, build e `git diff --check`. Subir o servidor local e confirmar `/design-system` com HTTP 200.

Não fazer inspeção automatizada sem navegador conectado; solicitar revisão humana explícita em desktop e 360 px antes de criar qualquer tela operacional.

## Relatório

Entregar `Relatório /financeiro-design-system-envelopes-fase-2d` com os primitivos criados/reutilizados, evidência de acessibilidade, validações, URL localhost, arquivos alterados e confirmação de que nenhuma UI operacional, RPC de escrita ou mudança remota foi feita.
