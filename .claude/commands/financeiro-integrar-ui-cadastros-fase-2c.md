---
description: "Conecta com segurança os formulários de contas e categorias às RPCs Fase 2C, validando apenas no Supabase local."
---

# /financeiro-integrar-ui-cadastros-fase-2c

## Objetivo

Substituir a prévia visual de `/admin/financeiro/cadastros` por integração real
com as RPCs publicadas da Fase 2C. A implementação e os testes operacionais
ocorrem somente contra Supabase local; não criar, editar, desativar ou reativar
registro algum em produção.

## Pré-condições de segurança

1. Confirme que a migration `20260825120000` está publicada e a auditoria MCP
validou as 17 RPCs. Não altere migrations, grants, RLS ou funções.
2. Confirme que o ambiente de desenvolvimento aponta para Supabase local antes
de qualquer teste mutável. Se não houver confirmação, pare: nunca use o projeto
remoto para testar formulários.
3. Preserve proteção por papel real e não use `service_role`, SQL direto ou
acesso direto a tabelas financeiras.

## Integração de leituras

Em `FinanceRegistrations.jsx`, use exclusivamente:

- `listarContasBancariasCadastro({ incluirInativas })`;
- `listarCategoriasCadastro({ incluirInativas })`.

Use os campos retornados, inclusive `updated_at`, para o controle de versão.
Ao trocar “Ativas”/“Todas”, recarregue a aba ativa sem mostrar dados da outra
aba. Estados loading, vazio, erro e sem permissão devem permanecer corretos.

## Integração de escrita

Conecte somente pelos wrappers já existentes:

- `criarContaBancaria`, `editarContaBancaria`, `definirContaPrincipal`,
  `definirContaAtiva`;
- `criarCategoria`, `editarCategoria`, `definirCategoriaAtiva`.

### Idempotência por intenção

- Ao abrir “Nova conta” ou “Nova categoria”, gere uma `idempotencyKey` com
  `crypto.randomUUID()` e guarde-a em `useRef`/estado estável.
- Reutilize a mesma chave se a mesma criação precisar ser reenviada por erro de
  rede. Gere outra somente ao cancelar, fechar, concluir com sucesso ou abrir
  uma nova intenção.
- Não exiba ou registre essa chave.
- Edição, principal e ativação usam a versão `updated_at` e devem recarregar a
  lista após sucesso.

### Estados e erros

- Durante envio, desabilite controles e mantenha o modal aberto.
- Depois de sucesso, feche o modal, mostre feedback `role=status` e recarregue
  somente a listagem necessária.
- Mapeie erros financeiros conhecidos para mensagens claras, sem exibir erro
  bruto de Postgres/Supabase:
  - `FINANCEIRO_NOME_ATIVO_EM_USO`;
  - `FINANCEIRO_CONFLITO_VERSAO`;
  - `FINANCEIRO_CATEGORIA_COM_HISTORICO`;
  - `FINANCEIRO_ULTIMA_CONTA_ATIVA`;
  - `FINANCEIRO_SUBSTITUTA_INVALIDA`;
  - `FINANCEIRO_CADASTRO_NAO_ENCONTRADO`;
  - autorização negada.
- Para conflito de versão, mantenha a edição aberta e ofereça “Recarregar
  dados” para descartar a versão local de forma consciente.
- Categoria com histórico não pode ser inferida pelo cliente; permita o envio
  e trate o erro retornado pelo banco, orientando desativar/criar substituta.

## Regras de UX

- Remova todos os textos de “prévia”, “ainda não salva” e “integração pendente”.
- Saldo inicial permanece exclusivo da criação; edição não o expõe.
- A confirmação de saldo negativo continua obrigatória antes da criação.
- O fluxo de desativar conta principal exige selecionar substituta ativa no
  modal; o banco continua sendo a fonte de verdade.
- Use modais, máscaras monetárias, design system, teclado, foco e responsividade
  já aprovados. Não adicione dependências.

## Testes locais obrigatórios

1. Crie/atualize testes sem usar produção que cubram:
   - criação de conta/categoria e retry com a mesma chave;
   - edição com `updated_at` atual e conflito de versão;
   - tornar principal, desativar/reabilitar e última conta;
   - categoria com histórico e conflito de nome;
   - mensagens de erro conhecidas;
   - negação para usuário não-admin;
   - ausência de chamada direta a `.from('financeiro_')` no frontend.
2. Use fixtures descartáveis ou transação/limpeza garantida no Supabase local.
3. Rode lint, todos os testes, `git diff --check` e build.
4. Sirva localhost ligado ao banco local e faça smoke test completo como admin
   local, sem dados de produção. Valide console, desktop e 360px.
5. Não faça commit nem deploy de frontend. Pare aguardando aprovação humana
   após apresentar as telas integradas em localhost.

## Relatório

```
## Relatório /financeiro-integrar-ui-cadastros-fase-2c

### Integração
[RPCs, leitura, escrita, idempotência e versões]

### Segurança
[ambiente local, papel real e ausência de acesso direto]

### Validação local
[testes, smoke test, desktop/móvel e console]

### Fora do escopo
[sem produção, migrations ou deploy frontend]

### Aguardando aprovação
[fluxos reais para revisar em localhost]
```
