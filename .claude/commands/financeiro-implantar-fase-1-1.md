---
description: "Corrige a fundação financeira antes da UI: integridade entre barbearias, idempotência de crédito e leituras controladas por RPC."
---

# /financeiro-implantar-fase-1-1

## Objetivo

Implementar a correção aditiva da fundação financeira, sem telas e sem abrir
acesso direto às tabelas ao browser. A Fase 1 existe manualmente no banco,
porém as migrations ainda não estão registradas no histórico remoto; não tente
alterar `schema_migrations` nesta etapa.

## Decisões fixas

- Tabelas financeiras continuam sem `GRANT` direto para `anon` ou
  `authenticated`.
- O frontend chama somente RPCs com contratos explícitos; RLS continua como
  defesa adicional, não como substituto de autorização nas funções.
- Operações de crédito exigem chave de idempotência.
- Toda referência de negócio deve apontar para um registro da mesma
  `barbearia_id` do lançamento financeiro.

## Parte 0 — Auditoria prévia obrigatória, somente leitura

Use o MCP Supabase em modo leitura para executar anti-joins que detectem
referências já gravadas entre barbearias diferentes. Verifique pelo menos os
vínculos de categoria, conta bancária, cliente, profissional, agendamento,
venda de produto, títulos e saldo de crédito.

Se qualquer inconsistência aparecer, **pare** e apresente IDs, tabela e relação
sem tentar corrigir dados automaticamente. A migration só pode seguir com zero
linhas inconsistentes.

Confirme também que:

- as quatro RPCs de negócio possuem `EXECUTE` somente para `authenticated`;
- `anon` e `PUBLIC` não possuem `EXECUTE` nelas;
- as tabelas continuam sem grants diretos;
- a definição atual de `financeiro_receber_conta` lança entrada bruta e saída
  separada para a taxa.

## Parte 1 — Migration aditiva de integridade

Crie uma nova migration cronológica em `supabase/migrations/`. Não edite as
migrations anteriores e não renomeie nem apague tabelas legadas.

1. Adicione constraints únicas compostas `(barbearia_id, id)` nos alvos
   necessários: tabelas financeiras relacionadas, `clientes`, `profissionais`,
   `agendamentos` e `vendas_produtos`. Nomes de constraints/índices devem ser
   explícitos e estáveis.
2. Para cada FK financeira que hoje valida somente um `id`, adicione uma FK
   composta que também valide `barbearia_id`. Cubra, quando existente:
   categoria, conta bancária, cliente, profissional, agendamento, venda de
   produto, conta a pagar, conta a receber e saldo de crédito.
3. Preserve as FKs simples existentes nesta etapa; a nova FK composta é a
   garantia adicional e evita alteração destrutiva em produção.
4. Adicione `idempotency_key text` a
   `financeiro_creditos_movimentacoes`, com índice único parcial por
   `(barbearia_id, idempotency_key)` para chaves não nulas. Não use
   `referencia_externa` como idempotência.
5. Mantenha todas as mudanças em uma transação. A migration deve falhar em vez
   de aceitar dados cruzados ou duplicados.

## Parte 2 — RPC de crédito idempotente

Substitua a RPC de crédito por uma assinatura que receba
`p_idempotency_key text` obrigatório e sem valor padrão. A função deve:

1. Resolver `barbearia_id` e papel exclusivamente a partir de `auth.uid()`.
2. Validar valor estritamente maior que zero e motivo permitido.
3. Procurar antes a movimentação com a mesma chave no escopo da barbearia; se
   existir, retornar exatamente o resultado da primeira operação, sem mexer no
   saldo.
4. Bloquear a linha do saldo com `FOR UPDATE`, calcular antes/depois e impedir
   saldo negativo.
5. Inserir razão, atualizar saldo e gravar audit log na mesma transação.

Remova o `EXECUTE` da assinatura antiga, remova a função antiga somente se as
dependências forem verificadas e substituídas na mesma migration, e conceda
`EXECUTE` **apenas** na assinatura nova a `authenticated`. Ao final, verifique
por catálogo que não há sobrecarga antiga executável por `PUBLIC`, `anon` ou
`authenticated`.

Atualize `src/lib/financeiro/api.js`, `schemas.js` e testes: `movimentarCredito`
deve exigir e encaminhar `idempotencyKey`. Nenhum componente é alterado.

## Parte 3 — Leitura controlada para a próxima fase visual

Não conceda `SELECT` nas tabelas. Crie somente estes contratos de leitura,
ambos `SECURITY DEFINER` com `search_path` fixo e validação de admin/master:

- `financeiro_listar_categorias()` — retorna categorias ativas da própria
  barbearia, em formato estável e sem campos internos.
- `financeiro_listar_contas_bancarias()` — retorna contas ativas da própria
  barbearia, sem dados sensíveis desnecessários.

Conceda `EXECUTE` apenas a `authenticated`; `PUBLIC` e `anon` não podem
executar. Os contratos de leitura de contas a pagar/receber, ledger e DRE serão
desenhados junto das telas, com paginação e filtros aprovados, em vez de liberar
uma consulta genérica agora.

## Parte 4 — Testes e verificação

1. Adicione testes de helpers para idempotência de crédito e rejeição de valor
   zero.
2. Com Supabase local, prove por SQL que uma FK cruzada entre duas barbearias é
   rejeitada.
3. Prove que repetir uma chave de crédito mantém o saldo e não cria segunda
   linha no razão.
4. Prove que barbeiro e `anon` não executam RPCs financeiras; admin autenticado
   executa apenas as RPCs de negócio/leitura permitidas.
5. Rode `npm test`, `npm run lint` e `npm run build`; se erros preexistentes
   permanecerem, separe-os claramente dos novos resultados.
6. Rode `/financeiro-auditar-migrations` após aplicar localmente e inclua no
   relatório as permissões efetivas obtidas por `has_function_privilege`.

## Proibições

- Não criar UI, rotas, componentes, dependências ou servidores locais.
- Não aplicar nem registrar migrations em produção.
- Não conceder acesso de tabela por comodidade.
- Não usar chave `service_role`, variáveis `VITE_*` sensíveis ou SQL montado no
  cliente.
- Não corrigir dados de produção automaticamente se a auditoria encontrar
  cruzamento de tenants.

## Critérios de aceite

- Uma referência financeira não pode apontar para outra barbearia.
- Repetir crédito com a mesma chave não duplica razão nem saldo.
- Só RPCs explicitamente aprovadas são executáveis por `authenticated`.
- `anon` e `PUBLIC` não executam nenhuma RPC financeira.
- Tabelas financeiras continuam fechadas para acesso direto.
- Não há UI criada ou alterada.
