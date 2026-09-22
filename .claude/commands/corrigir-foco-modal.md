---
description: "Corrige o foco que retorna ao primeiro campo durante a digitação em modais, preservando acessibilidade e sem alterar dados."
---

# /corrigir-foco-modal

## Objetivo

Corrigir o defeito em que, ao digitar ou clicar em outro campo de um modal, o
foco volta para o primeiro campo (“Nome”). A correção deve ser feita no
componente reutilizável `src/components/ui/Modal.jsx`, não como remendo no
formulário financeiro.

Não alterar migrations, RPCs, Supabase, dados, formulários de domínio ou
persistência.

## Causa confirmada

O efeito do modal depende diretamente de `onClose`. As páginas passam callbacks
inline, que ganham nova identidade a cada render do formulário. A limpeza do
efeito então devolve foco ao gatilho e a nova execução foca o primeiro elemento,
interrompendo a digitação em qualquer outro campo.

## Correção obrigatória

1. Mantenha o callback mais recente de fechamento em uma `ref` atualizada sem
   reiniciar o efeito de foco/modal.
2. O efeito que:
   - memoriza o gatilho;
   - bloqueia scroll do body;
   - foca o primeiro elemento;
   - prende Tab;
   - registra Escape;
   - devolve foco ao fechar

   deve executar apenas quando `open` mudar, e não a cada render causado por
   digitação.
3. Escape e clique no overlay devem chamar sempre o callback atual via ref.
4. Preserve o comportamento de fechar, foco preso, retorno ao gatilho, ARIA e
   bloqueio de scroll existentes.
5. Não use timeout, `autoFocus` improvisado ou remoção do foco inicial como
   paliativo.

## Verificação

1. Rode lint dos arquivos alterados, testes existentes, `git diff --check` e
   build.
2. Em localhost, abra “Nova conta bancária” e valide:
   - digitar em Nome, Instituição e Saldo inicial sem o foco retornar;
   - trocar o select Tipo com mouse e teclado;
   - Tab/Shift+Tab continuam presos no modal;
   - Escape e clique fora fecham;
   - ao fechar, o foco retorna ao botão que abriu o modal.
3. Repita ao menos em “Nova categoria”.
4. Não faça commit; entregue relatório com a causa e os resultados.

## Relatório

```
## Relatório /corrigir-foco-modal

### Correção
[como o ciclo de foco foi estabilizado]

### Acessibilidade preservada
[Tab, Escape, overlay e retorno ao gatilho]

### Verificação local
[lint, testes, build e passos manuais]

### Fora do escopo
[sem banco ou dados]
```
