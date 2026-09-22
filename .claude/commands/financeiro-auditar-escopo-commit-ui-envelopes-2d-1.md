---
description: "Audita a dependência completa da UI de envelopes e propõe um commit reproduzível, sem stage ou commit."
---

# /financeiro-auditar-escopo-commit-ui-envelopes-2d-1

## Contexto aprovado

A UI de gestão de envelopes e aporte avulso foi validada funcionalmente e aprovada visualmente em localhost. A próxima etapa é versioná-la sem produzir um commit incompleto ou incluir alterações alheias.

O worktree já contém mudanças anteriores em autenticação, navegação, marca, design system e outras telas financeiras. Alguns arquivos da UI de envelopes são novos e ainda não existem no `HEAD`; por isso, não basta selecionar apenas os quatro arquivos alterados na última integração.

## Escopo desta execução

Executar somente leitura e análise Git. Não fazer `git add`, commit, push, reset, checkout, restore, stash, rebase, limpeza ou alteração de arquivo.

Preservar integralmente o worktree atual.

## Auditoria obrigatória

1. Partir do commit `aa11cf7` e confirmar que o índice Git está vazio.
2. Mapear a árvore completa de imports necessária para que uma cópia limpa do `HEAD` consiga abrir e compilar:

```text
/admin/financeiro/envelopes
```

3. Incluir no mapa, no mínimo:

- rota em `src/App.jsx`;
- item de menu e proteção administrativa em `src/components/layout/AdminLayout.jsx`;
- `src/pages/financeiro/FinanceEnvelopes.jsx`;
- wrappers e schemas financeiros usados;
- `ReserveMeter`, `CurrencyInput`, `DataTable`, `Modal` e demais primitivos importados que não existam no `HEAD`;
- helpers de envelopes e idempotência;
- hooks/helpers de autenticação exigidos pelo layout;
- ativos de marca importados pelo layout;
- testes diretamente ligados à tela e aos helpers.

4. Para cada dependência, classificar:

- já versionada e inalterada;
- modificada exclusivamente para a UI financeira;
- arquivo novo necessário;
- arquivo misto com mudanças alheias;
- dispensável para este commit.

5. Comparar cada arquivo modificado com o `HEAD`, não apenas com o estado da última tarefa.
6. Identificar imports que quebrariam o build de uma cópia limpa se o arquivo consumidor fosse commitado sem o restante.
7. Verificar se `App.jsx` e `AdminLayout.jsx` podem ser separados por hunks com segurança. Não propor stage parcial se os hunks dependerem de autenticação, marca ou rotas ainda não versionadas.
8. Verificar se já existem commits anteriores que deveriam conter parte dessas dependências, evitando duplicação.

## Proposta de versionamento

Entregar uma proposta concreta de um ou mais commits, obedecendo:

- cada commit deve compilar isoladamente quando aplicado em ordem;
- nenhum commit pode depender de arquivo novo deixado fora dele;
- alterações alheias continuam fora;
- não incluir migrations ou testes SQL já presentes no commit `aa11cf7`;
- não incluir comandos `.claude`, backups, configuração local do Supabase, fixtures ou arquivos temporários;
- não incluir resgate, novas funcionalidades ou refatorações oportunistas.

Preferir o menor número de commits que mantenha cada etapa reproduzível. Se for necessário consolidar a fundação administrativa e as telas financeiras anteriores antes da UI de envelopes, explicar exatamente por quê e listar os arquivos de cada commit.

## Validação somente leitura

Executar:

- `git status --short`;
- `git diff --check`;
- inspeção da árvore de imports;
- comparação de arquivos propostos contra `HEAD`;
- confirmação de que o índice permanece vazio.

Não rodar formatadores que modifiquem arquivos.

## Relatório obrigatório

Entregar `Relatório /financeiro-auditar-escopo-commit-ui-envelopes-2d-1` contendo:

- commit-base e estado do índice;
- dependências completas da rota;
- arquivos mistos e riscos de commit incompleto;
- proposta exata de commits em ordem, com mensagem e arquivos/hunks;
- confirmação de que cada commit proposto será compilável;
- arquivos explicitamente excluídos;
- confirmação de que nenhum arquivo, stage, commit ou push foi alterado.

Parar após o relatório para aprovação humana antes de preparar qualquer commit.
