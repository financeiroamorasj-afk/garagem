---
name: "source-command-preparar-teste-agendamento"
description: "Implementa criação real de cliente quando não há match no ClientSearch, insere dado de teste em servicos (só para viabilizar o teste manual), e sobe o servidor local para Rafa testar o fluxo de agendamento corrigido"
---

# source-command-preparar-teste-agendamento

Use this skill when the user asks to run the migrated source command `preparar-teste-agendamento`.

## Command Template

# /preparar-teste-agendamento

## Parte 1 — Criar cliente real ao digitar nome novo

No fluxo do `AddAppointmentModal.jsx` (ajustado no comando anterior), quando `ClientSearch` retorna o sentinel `{id: 'new', nome}` (sem match), hoje só grava o nome como texto em `cliente_nome_manual`. Mude para:

1. Antes de fazer o insert do agendamento, se o cliente selecionado for o sentinel `new`, primeiro faça um `INSERT` em `clientes` com o nome digitado e `barbearia_id` da sessão, e capture o `id` retornado.
2. Use esse `id` recém-criado como `cliente_id` no insert do agendamento (não precisa mais gravar em `cliente_nome_manual` nesse caso).
3. Trate erro de criação de cliente separadamente do erro de criação de agendamento — se o cliente falhar ao criar, não tente criar o agendamento órfão; mostre o erro e pare.
4. Confirme o schema real de `clientes` por live query antes de montar o insert (colunas obrigatórias, se `nome` é o nome real da coluna) — não assuma.
5. Não implemente busca de duplicado/fuzzy-match aqui (ex: "João Silva" vs "joao silva") — isso é escopo de outra melhoria, não deste comando.

## Parte 2 — Popular 1-2 serviços de teste

`servicos` está com 0 linhas, o que impede testar o seletor de serviço no modal. Isso é dado de teste, não schema — não é o mesmo tipo de risco de uma migration.

1. Insira diretamente via SQL (não precisa ser migration versionada, é dado de desenvolvimento, não estrutura) 2 linhas de exemplo em `servicos`, para a barbearia que Rafa está usando para testar: algo como "Corte Degradê" (preço 45.00, duração 30) e "Barba Completa" (preço 35.00, duração 30). Confirme qual `barbearia_id` usar checando qual barbearia está vinculada ao usuário logado de teste (via `profiles`), não invente um UUID.
2. Deixe claro no relatório que isso é dado de teste descartável, não cadastro real de produção — Rafa vai substituir isso pelo fluxo real assim que o `ServiceProductModal.jsx` for religado.

## Parte 3 — Subir o servidor e preparar o teste manual

1. Rode `npm run dev` (ou equivalente do projeto) e confirme que sobe sem erro de build/import.
2. Não tente automatizar clique em navegador — isso é Rafa testando manualmente. Só garanta que o servidor está de pé e acessível, e relate a URL local.
3. Liste um roteiro curto de teste manual para Rafa seguir: abrir o modal de novo agendamento, selecionar um profissional, buscar um cliente (testar tanto um nome que não existe ainda, pra validar a Parte 1, quanto tentar de novo depois pra ver se agora encontra o que acabou de criar), selecionar um dos serviços de teste, conferir se o valor pré-preenche, escolher data/hora, salvar, e confirmar que o agendamento aparece em `Dashboard.jsx` ou onde for exibido.

---

## O que NÃO fazer

- Não mexer em `ServiceProductModal.jsx` (próximo comando, depois do teste).
- Não criar migration versionada para o dado de teste da Parte 2 — é seed descartável, direto via SQL ad-hoc.
- Não tentar rodar teste E2E automatizado (Playwright/Cypress) — não faz parte do escopo, é teste manual do Rafa.

---

## Formato do relatório

```
## Relatório /preparar-teste-agendamento

### Criação real de cliente
[mudanças feitas, schema confirmado de clientes]

### Dado de teste inserido
[quais linhas, em qual barbearia_id, lembrete de que é descartável]

### Servidor
[status do npm run dev, URL local, algum erro de build?]

### Roteiro de teste manual para Rafa
[passo a passo]

### Riscos ou pendências
[qualquer coisa observada]
```
