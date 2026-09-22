---
description: "Valida em cópias isoladas e cria dois commits locais da fundação financeira e da UI de envelopes, sem push ou alterações no banco."
---

# /financeiro-commit-ui-envelopes-2d-1

## Objetivo e autorização

Executar a proposta do relatório `/financeiro-auditar-escopo-commit-ui-envelopes-2d-1`: validar e versionar os dois conjuntos abaixo, na ordem definida. A execução deste comando autoriza apenas esses dois commits locais após aprovação de todas as verificações.

Não fazer push, deploy, aplicar migrations, iniciar ou alterar stacks Supabase, acessar banco remoto ou modificar dados. Não implementar resgate nem novas funcionalidades.

O relatório anterior identificou as dependências, mas não apresentou evidência de build isolado. Portanto, tratar a compilação de cada conjunto como hipótese a verificar, não como validação já concluída.

## Pré-condições

1. Ler as instruções aplicáveis do repositório.
2. Confirmar que `HEAD` corresponde ao commit `aa11cf7` e que o índice está vazio. Registrar branch, hash completo, `git status --short`, `git diff --cached --name-only` e `git diff --check`.
3. Se o HEAD divergir, houver conflitos ou qualquer entrada no índice, parar e relatar. Não limpar ou reaproveitar o stage de outra tarefa.
4. Conferir a existência e revisar o conteúdo completo dos arquivos novos e os diffs dos arquivos modificados das duas listas. Confirmar que não há segredos, credenciais privilegiadas ou novas dependências fora das listas.
5. Registrar uma fotografia verificável do estado inicial dos arquivos do projeto, incluindo modificados, excluídos e não rastreados. Usar hashes de conteúdo quando necessário para comprovar preservação; não imprimir conteúdo de arquivos de ambiente ou segredos. Excluir da comparação apenas metadados Git e artefatos temporários criados por esta execução.

Não modificar arquivos-fonte nesta tarefa. Se for necessária correção de código ou ampliação das listas, parar e propor a correção para aprovação.

## Commit 1 — fundação administrativa e financeira

Mensagem exata:

```text
feat(admin): consolida fundação da navegação financeira
```

Arquivos completos autorizados (18):

```text
src/components/ProtectedRoute.jsx
src/components/layout/AdminLayout.jsx
src/components/ui/Modal.jsx
src/components/ui/CurrencyInput.jsx
src/components/ui/DataTable.jsx
src/components/ui/FinancialChart.jsx
src/components/ui/PeriodSelector.jsx
src/components/ui/Tabs.jsx
src/hooks/useAdminProfile.js
src/lib/auth/adminAccess.js
src/assets/brand/garagem-symbol.png
src/lib/financeiro/moeda.js
src/lib/financeiro/settlementIntent.js
src/pages/AdminPlaceholder.jsx
src/pages/financeiro/FinanceOverview.jsx
src/pages/financeiro/FinanceTitles.jsx
tests/admin-access.test.js
tests/financeiro-settlement-intent.test.js
```

Não incluir `src/App.jsx` neste commit. Ele deve permanecer na versão do commit-base durante a primeira validação.

## Commit 2 — UI de envelopes e aporte avulso

Mensagem exata:

```text
feat(financeiro): integra UI de envelopes e aporte avulso
```

Arquivos completos autorizados (8), aplicados após o primeiro conjunto:

```text
src/App.jsx
src/components/ui/ReserveMeter.jsx
src/lib/financeiro/api.js
src/lib/financeiro/schemas.js
src/lib/financeiro/envelopeIntent.js
src/lib/financeiro/envelopes-ui.js
src/pages/financeiro/FinanceEnvelopes.jsx
tests/financeiro-envelopes-ui.test.js
```

Não usar stage parcial para `App.jsx`, `AdminLayout.jsx` ou outros arquivos das listas: a proposta aprovada usa arquivos completos. Revisar os arquivos mistos antes de adicioná-los; se contiverem mudanças incompatíveis com o escopo auditado, parar.

## Exclusões obrigatórias

Tudo que não estiver nas duas listas permanece fora dos commits. Em especial:

- `.agents/`, `.claude/` (inclusive este comando) e `Cofre Garagem/`;
- `docs/financeiro/`, `docs/produto/` e mudanças do design system;
- `.gitignore`, `package.json`, arquivos de lock e `src/index.css`;
- migrations, testes SQL, configuração Supabase, baseline local e fixtures;
- `garagem-logo-full.png`;
- exclusão do `src/components/CurrencyInput.jsx` legado;
- alterações de agendamento, dashboards, login e página DesignSystem;
- alterações locais de `tests/financeiro-helpers.test.js` e `tests/financeiro-transferencia-concorrencia.test.js`;
- logs, dist, backups, arquivos de ambiente e outros arquivos locais;
- qualquer implementação de resgate.

Arquivos excluídos que já existam no commit-base continuam presentes na versão do commit-base nas cópias de validação. Excluir suas alterações locais não significa removê-los dessas cópias.

## Validação isolada obrigatória antes de qualquer commit

Preparar duas cópias descartáveis independentes em diretório temporário permitido, sem modificar o checkout de trabalho ou seu índice:

- **Cópia A:** árvore versionada de `aa11cf7` mais somente os 18 arquivos do primeiro conjunto.
- **Cópia B:** árvore versionada de `aa11cf7` mais os mesmos 18 arquivos e somente os 8 arquivos do segundo conjunto.

Usar exportação Git da árvore versionada, por exemplo `git archive`, e sobrepor somente os caminhos explícitos. Não copiar a pasta de trabalho inteira, arquivos ignorados, `.env`, `node_modules`, `dist` ou alterações fora das listas. Guardar um manifesto dos arquivos sobrepostos com hashes e confirmar que cada árvore difere da base apenas nos caminhos autorizados.

Instalar dependências em cada cópia a partir do `package.json` e lock versionados no commit-base, usando `npm ci` se existir lock compatível. Não reutilizar nem vincular o `node_modules` do checkout atual: isso poderia esconder dependências locais não versionadas. Não atualizar manifestos ou lock para contornar erros. Se instalação exigir rede ou permissão indisponível, solicitar a autorização necessária ou relatar o bloqueio; não declarar sucesso.

Em cada cópia:

1. Inspecionar scripts, configuração e testes antes de executá-los. Não iniciar testes de integração ou concorrência que possam escrever em banco, nem carregar credenciais do checkout. Executar os testes unitários seguros com caminhos explícitos, conforme o runner realmente disponível; não passar `--runInBand` ao runner nativo do Node.
2. Executar os testes de `admin-access` e `financeiro-settlement-intent` nas duas cópias. Na cópia B, executar também `financeiro-envelopes-ui`. Incluir testes unitários financeiros existentes que sejam pertinentes e comprovadamente não usem banco; usar suas versões da árvore isolada.
3. Executar `npm run lint` e `npm run build`, registrando comando, código de saída e resultado. Não usar formatadores ou lint com autofix.
4. Auditar imports, exports e ativos de todos os arquivos novos/modificados, inclusive os que ainda não estão alcançáveis pelo `App.jsx` daquela etapa. Um build do Vite pode ignorar páginas sem rota: sucesso no build, sozinho, não prova que essas páginas têm todas as dependências.
5. Confirmar que o build não depende de alterações locais excluídas em CSS, configuração ou pacotes. Se houver necessidade de variável pública somente para compilar, usar valor fictício no processo isolado e registrar a limitação, sem fornecer credenciais reais ou acessar serviços.

Se lint ou teste falhar, comparar com uma cópia limpa da base usando o mesmo comando e ambiente para distinguir falha anterior de regressão. Relatar ambas. Não considerar etapa aprovada com falhas ou verificações inconclusivas, nem flexibilizar critérios automaticamente: parar antes de stage e solicitar decisão quando necessário.

Se faltar import, export, ativo, pacote ou qualquer dependência fora das listas, parar e apresentar a dependência exata e a menor revisão de escopo necessária. Não adicioná-la silenciosamente.

As duas cópias precisam ser aprovadas antes da criação do primeiro commit. Não chamar essas verificações de teste funcional no navegador; registrar separadamente o que foi e não foi executado.

## Preparação e criação sequencial dos commits

Depois de ambas as validações:

1. Reconfirmar HEAD, índice vazio e hashes dos 26 arquivos de origem. Se qualquer arquivo tiver mudado desde a validação, parar; não versionar conteúdo diferente do validado.
2. Usar `git add --` com os 18 caminhos explícitos do primeiro conjunto. Nunca usar `git add .`, `git add -A`, glob, diretório inteiro ou `git commit -a`.
3. Conferir `git diff --cached --name-status`, `git diff --cached --check`, `git diff --cached --stat` e o diff completo. A lista deve ser exatamente a do primeiro conjunto, sem omissões, exclusões ou arquivos adicionais. Verificar que os blobs staged correspondem ao conteúdo validado, considerando normalização de fim de linha do Git. Se houver divergência substancial, parar.
4. Criar o primeiro commit com a mensagem exata. Confirmar hash, parent igual à base e lista exata de arquivos com `git show`. Confirmar índice vazio e ausência de alterações inesperadas por hooks. Não usar `--no-verify`.
5. Reconfirmar que o primeiro commit e os arquivos restantes correspondem à cópia B validada. Adicionar somente os 8 caminhos explícitos do segundo conjunto, repetir as verificações do índice e criar o segundo commit com a mensagem exata.
6. Confirmar que o parent do segundo commit é o primeiro, que seus arquivos são exatamente os autorizados e que o índice terminou vazio.
7. Comparar o estado final dos arquivos do projeto com o estado inicial: todas as alterações alheias devem continuar preservadas, inclusive arquivos não rastreados e a exclusão local do componente legado. Os arquivos commitados devem estar sem diferenças pendentes em relação ao HEAD.

Se algo falhar após stage ou após o primeiro commit, parar e relatar precisamente o estado parcial, os hashes já criados e os caminhos ainda staged. Não executar reset, restore, checkout, stash, amend, rebase, clean ou rollback automático. Não apagar nem sobrescrever alterações do usuário.

Não remover diretórios temporários por comandos genéricos ou recursivos sem conferir seus caminhos absolutos. Preferir informar onde ficaram as evidências de validação.

## Relatório obrigatório

Entregar `Relatório /financeiro-commit-ui-envelopes-2d-1` com:

- branch, commit-base e hashes/assuntos dos commits realmente criados;
- lista exata de arquivos em cada commit;
- localização e composição das cópias A e B;
- comandos efetivamente executados, códigos de saída e resultados de testes, lint e build de cada cópia;
- resultado da auditoria de imports/exports de arquivos ainda não alcançados pelas rotas;
- falhas anteriores, bloqueios e limitações, sem apresentar checks não executados como aprovados;
- estado final do índice e preservação das alterações fora do escopo;
- confirmação de que não houve push, deploy, alteração de banco ou inclusão de arquivos excluídos.

Parar após o relatório. Não iniciar outra fase.
