---
description: "Cria a prévia visual dos formulários seguros de contas e categorias da Fase 2C, sem executar mutações no banco."
---

# /financeiro-implantar-ui-cadastros-fase-2c

## Objetivo

Evoluir `/admin/financeiro/cadastros` com formulários e fluxos completos para
contas bancárias e categorias, exclusivamente para aprovação visual em
localhost. Nenhum botão desta fase pode chamar RPC de criação, edição,
principal, ativação ou desativação; não criar dados no banco.

As leituras já aprovadas podem continuar carregando registros reais em modo
somente leitura. Toda prévia de ação deve ser explicitamente identificada como
“Ainda não salva — integração pendente de aprovação”.

## Design system e segurança

- Leia `docs/design-system/DESIGN-SYSTEM.md` por completo.
- Reutilize `Button`, `Card`, `DataTable`, `Tabs`, `Modal`, `Input`,
  `CurrencyInput`, `Badge`, `EmptyState` e `Spinner`.
- Sem hex, classes de paleta padrão, raio não aprovado, nova dependência,
  `window.confirm`, `alert`, serviço privilegiado ou acesso direto a tabela.
- Preserve a proteção atual por papel real; não renderize dados ou ações para
  sessão sem `admin`/`master`.
- Não altere migrations, RPCs, `src/lib/financeiro/api.js` ou schema.

## Estrutura da página

Mantenha as abas “Contas bancárias” e “Categorias”. Cada aba possui apenas uma
ação primária:

- `Nova conta`;
- `Nova categoria`.

Essas ações abrem modais acessíveis. Enquanto as RPCs não estiverem conectadas,
o envio deve validar o formulário e mostrar um feedback de prévia, sem alterar
lista, estado remoto, localStorage ou dados persistentes.

## Modal — Conta bancária

### Criação

Campos:

- Nome (obrigatório, 2–100);
- Instituição (opcional, até 100);
- Tipo, usando somente as opções do contrato aprovado;
- Saldo inicial com `CurrencyInput`.

Ao informar saldo inicial negativo, mostre aviso textual claro e peça uma
confirmação explícita no fluxo de prévia: “Confirmo que esta conta inicia com
saldo negativo.” O botão de envio fica desabilitado até a confirmação.

Explique: “A primeira conta ativa será definida como principal
automaticamente.”

### Edição

Em uma linha de conta existente, ofereça ação secundária “Editar”. Abra modal
pré-preenchido e torne somente nome, instituição e tipo editáveis. Não exiba
saldo inicial como campo editável; mostre-o apenas como dado imutável.

### Ações de situação

Para conta ativa: ações secundárias “Tornar principal” quando aplicável e
“Desativar”. Para conta inativa: “Reativar”.

- Desativar uma conta principal deve abrir confirmação que exige escolher uma
  conta ativa substituta (prévia local).
- Mostre a consequência: a conta deixa de estar disponível para novas
  liquidações, e o histórico é preservado.
- Não mostre ações impossíveis: conta principal já selecionada não tem
  “Tornar principal”; sem outra conta ativa, explique o bloqueio em vez de
  habilitar desativação.

## Modal — Categoria

### Criação

Campos: nome, tipo e grupo DRE, somente valores do contrato aprovado.

### Edição e situação

Para categoria sem histórico, ofereça “Editar” e “Desativar”. Para categoria
com histórico, a UI deve sinalizar que edição semântica será bloqueada pelo
banco e oferecer apenas desativação/criação de substituta na futura integração.

Para registro inativo, ofereça “Reativar”, mostrando que um conflito de nome
ativo impedirá a ação. Todas as ações são prévia local nesta fase.

## Modal e feedback

- Use `Modal` com título específico, descrição da consequência, `Escape`,
  clique no overlay, foco preso e devolução ao gatilho.
- Use botões `secondary` antes de `primary`.
- Mostre erro de validação associado a cada campo, `aria-invalid` e ajuda
  acessível.
- O botão de envio preserva largura e mostra loading de prévia; desabilite
  duplo envio.
- Após envio válido, apresente feedback `role=status` inequívoco: nenhuma
  alteração foi gravada; aguarda integração aprovada.

## Dados e estados

- Continue usando as duas RPCs de leitura de cadastro apenas quando já estiver
  seguro na página atual; não modifique os wrappers.
- Inclua um filtro visual “Ativas”/“Todas” por aba. Nesta prévia, use o estado
  das leituras existentes se disponível; não faça nova mutação.
- Caso não haja registros reais, a ação primária ainda precisa ficar visível
  junto ao estado vazio, permitindo revisar os formulários.
- Trate loading, erro recuperável, vazio, sem permissão e conflito esperado.

## Verificação visual

1. Rode lint nos arquivos alterados, testes existentes, `git diff --check` e
   build.
2. Sirva em localhost; confirme HTTP 200 para `/admin/financeiro/cadastros`.
3. Inspecione em desktop e 360px:
   - criação de conta e categoria;
   - aviso/confirmação de saldo negativo;
   - edição sem saldo inicial editável;
   - modal de desativação com substituta;
   - teclado, Escape, overlay e foco;
   - estado vazio com ação primária;
   - nenhum overflow do documento nem erro no console.
4. Não execute mutação real e não crie commit. Pare aguardando aprovação
   visual humana antes de conectar as RPCs.

## Relatório

```
## Relatório /financeiro-implantar-ui-cadastros-fase-2c

### Telas e fluxos
[modais, ações e estados]

### Design system e acessibilidade
[primitivos, teclado, foco e responsividade]

### Segurança
[nenhuma mutação executada; leituras preservadas]

### Verificação local
[testes, build e URL]

### Aguardando aprovação visual
[itens para revisar antes da integração]
```
