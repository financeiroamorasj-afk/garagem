---
name: "source-command-fix-agendamento-modal"
description: "Corrige o AddAppointmentModal.jsx para gravar nas colunas reais de agendamentos (schema confirmado via live query no /schema-operacional-fundacao), em vez das colunas inexistentes que usa hoje"
---

# source-command-fix-agendamento-modal

Use this skill when the user asks to run the migrated source command `fix-agendamento-modal`.

## Command Template

# /fix-agendamento-modal

## Contexto

`src/components/AddAppointmentModal.jsx` hoje faz:
```js
.insert([{
    cliente_nome: clientName,
    servico: service,
    horario: time,
    profissional_id: profissionalId,
    barbearia_id: profile.barbearia_id,
    data: new Date().toISOString().split('T')[0]
}])
```

Nenhuma dessas colunas (`cliente_nome`, `servico`, `horario`, `data`) existe na tabela real. O schema confirmado por live query é:

```
agendamentos: id, barbearia_id, profissional_id, cliente_id, cliente_nome_manual,
              servico_id (FK -> servicos), data_hora NOT NULL, status, valor_final, criado_em
```

Este é um insert que provavelmente falha silenciosamente ou lança erro em produção agora. Corrigir é prioridade — é a tela onde um agendamento é criado.

Este comando é implementação direta (não é migration de banco, é código de aplicação — risco baixo, reversível via git). Pode editar o arquivo diretamente, não precisa gerar spec pra revisão antes.

---

## Parte 1 — Checar a dependência antes de codar

Antes de editar `AddAppointmentModal.jsx`, confirme por live query:

1. `servicos` tem alguma linha cadastrada na barbearia de teste, ou está vazia? (Relatórios anteriores confirmaram 0 linhas até o momento — pode ter mudado.)
2. `ServiceProductModal.jsx` já grava em `servicos` no Supabase, ou ainda só dispara `onSave` local (mock)? Confirme lendo o arquivo atual, não confie no relatório anterior — pode ter sido alterado.

Se `servicos` estiver vazia E `ServiceProductModal.jsx` ainda não gravar no Supabase, um seletor de serviço no `AddAppointmentModal.jsx` vai renderizar uma lista vazia — a correção fica tecnicamente certa mas inutilizável na prática. **Não conserte `ServiceProductModal.jsx` neste comando** (é escopo de outro arquivo/comando) — só reporte esse achado com destaque no relatório final, para decidirmos se viramos o próximo comando pra ele.

---

## Parte 2 — Corrigir o AddAppointmentModal.jsx

1. Trocar o `<input>` de texto livre de serviço por um `<select>` (ou componente de busca, se preferir reaproveitar o `ClientSearch.jsx` como padrão de busca — mas isso é para cliente, não serviço) populado com `supabase.from('servicos').select('id, nome, preco, duracao_minutos').eq('barbearia_id', ...).eq('ativo', true)`.
2. Ao selecionar um serviço, preencher automaticamente um campo de valor com `servico.preco` — mas permitir edição manual (ex: desconto pontual), já que `valor_final` é o snapshot gravado, não uma referência viva ao preço do serviço.
3. Cliente: hoje é `<input>` de texto livre (`clientName`). Duas opções, escolha com base no que já existe: se `ClientSearch.jsx` (usado no `AdminAppointmentModal.jsx`, padrão já migrado pro design system) puder ser reaproveitado aqui para busca de cliente cadastrado, prefira isso por consistência. Se optar por manter texto livre por simplicidade nesta correção pontual, grave em `cliente_nome_manual` (não em `cliente_id`). Documente no relatório qual caminho tomou e por quê.
4. Campo de data: hoje só existe `time` (horário), sem seletor de data — o insert atual usa a data de hoje fixa. Adicionar um campo de data (pode ter "hoje" como valor padrão) e combinar com o horário num `Date`/timestamp válido para gravar em `data_hora` (timestamptz).
5. Ajustar o `.insert(...)` final para usar exatamente: `cliente_nome_manual` (ou `cliente_id`, conforme decisão do passo 3), `servico_id`, `data_hora`, `valor_final`, `profissional_id`, `barbearia_id`, e `status` (definir um valor padrão sensato, ex: `'agendado'` — confirme se esse é um valor válido do enum/check constraint da coluna `status` antes de usar).
6. Manter toda a lógica de sessão/perfil (`supabase.auth.getSession()`, busca de `barbearia_id`) exatamente como está — não é o que está quebrado.
7. Aplicar os tokens do design system nos elementos novos (select, campo de data) — usar `<Input>`/primitivos existentes onde fizer sentido, em vez de className cru novo.

---

## O que NÃO fazer

- Não mexer em `ServiceProductModal.jsx` (só investigar e reportar, ver Parte 1).
- Não mexer em `AdminAppointmentModal.jsx` (é um modal diferente, já com seu próprio padrão, fora de escopo aqui).
- Não alterar schema/migration — a tabela já está correta, o problema é só o código que grava nela errado.

---

## Formato do relatório

```
## Relatório /fix-agendamento-modal

### Dependência checada
- servicos tem dados? [sim/não, quantas linhas]
- ServiceProductModal.jsx grava no Supabase? [sim/não]
- Impacto na usabilidade do select de serviço: [funcional / lista vazia até servicos ser populado]

### Mudanças feitas em AddAppointmentModal.jsx
[resumo do diff — campos trocados, decisão sobre cliente_nome_manual vs ClientSearch]

### Testado?
[se rodou local e conseguiu criar um agendamento de teste com sucesso, ou não foi possível testar por falta de dado em servicos]

### Riscos ou pendências
[qualquer coisa que precise de decisão, incluindo se vale abrir um próximo comando pro ServiceProductModal.jsx]
```
