---
description: "Cria e valida localmente o contrato seguro de leitura da Fase 2B financeira, sem UI e sem aplicar em produção."
---

# /financeiro-implantar-contrato-fase-2b

## Objetivo

Implementar somente a fundação de leitura necessária para as telas da Fase 2B:

- corrigir a transferência para rejeitar valor zero;
- criar `financeiro_resumo_periodo`;
- criar `financeiro_listar_titulos`;
- validar isolamento, permissões, filtros e paginação.

Não criar ou alterar UI, rotas, navegação, componentes, dados reais ou
produção. Não aplicar `db push`, `migration repair`, SQL Editor ou comandos
que escrevam no Supabase remoto.

## Decisões aprovadas

- Cadastros financeiros entram somente como visualização.
- A futura navegação será “Visão financeira”, “Contas” e “Cadastros”; DRE e
  Conciliação ficam para fase posterior.
- O resumo mostra no máximo 10 próximos vencimentos dentro dos próximos 30
  dias.
- O desalinhamento entre `ProtectedRoute` e `AdminLayout` será corrigido numa
  fase de UI posterior, sem ser misturado nesta migration.

## Pré-condições

1. Leia integralmente as migrations financeiras `20260824130000`, `133000`,
   `140000` e `150000`, os testes financeiros existentes, helpers e o design
   system. Não modifique os arquivos existentes sem justificar a necessidade.
2. Confirme que o Supabase local está disponível. Se não estiver, pare e
   informe o comando seguro necessário para iniciá-lo; não substitua testes por
   produção.
3. Verifique o estado do Git. Preserve alterações alheias e adicione somente
   arquivos deste escopo.

## Migration nova

Crie uma única migration com timestamp posterior a `20260824150000`, em
`supabase/migrations/`, transacional e idempotente quando tecnicamente
possível. Ela deve conter apenas:

### 1. Transferência

Recrie `financeiro_transferir(uuid, uuid, numeric, date, text, text)` para
rejeitar `p_valor <= 0`, mantendo as demais garantias de escopo,
idempotência, ledger e auditoria. Preserve `SECURITY DEFINER`,
`search_path = public, auth` e permissões corretas.

### 2. `financeiro_resumo_periodo`

Crie:

```sql
financeiro_resumo_periodo(p_data_inicio date, p_data_fim date) returns jsonb
```

Requisitos:

- chamar `financeiro_assert_admin()` e derivar a barbearia no banco;
- validar datas não nulas, início menor ou igual ao fim e intervalo máximo de
  366 dias;
- retornar `periodo`, `totais`, `contas`, `serie` e `proximos_vencimentos`;
- `totais`: entradas, saídas e resultado das movimentações liquidadas no
  período; transferências internas não compõem o resultado;
- `contas`: somente id, nome, saldo_inicial, entradas, saídas e saldo_atual da
  própria barbearia;
- `serie`: agregação diária do intervalo, com entrada, saída e resultado;
- `proximos_vencimentos`: no máximo 10 títulos pendentes, previstos para os
  próximos 30 dias, trazendo apenas tipo, id, descrição, data e valor;
- retornos vazios devem ser arrays/valores previsíveis, nunca `null` onde a UI
  precise iterar;
- não retornar audit log, IDs de outra barbearia ou campos pessoais além do
  mínimo indispensável.

### 3. `financeiro_listar_titulos`

Crie:

```sql
financeiro_listar_titulos(
  p_tipo text,
  p_data_inicio date,
  p_data_fim date,
  p_status text default null,
  p_ordenar_por text default 'data',
  p_direcao text default 'asc',
  p_pagina integer default 1,
  p_por_pagina integer default 25
) returns jsonb
```

Requisitos:

- chamar `financeiro_assert_admin()`;
- aceitar somente `p_tipo` `pagar` ou `receber`;
- validar datas e intervalo máximo de 366 dias;
- validar status de acordo com o tipo; `null` significa todos os status do
  tipo;
- paginação com página mínima 1 e `p_por_pagina` entre 1 e 100;
- ordenação e direção por allowlist, sem SQL dinâmico não controlado;
- retornar `items`, `pagina`, `por_pagina`, `total_itens`, `total_paginas`;
- cada item pode trazer somente id, tipo, descrição, valor, status,
  data_competencia, data_evento, data_liquidacao, categoria, contraparte,
  conta_bancaria e `pode_liquidar` calculado pelo banco;
- `pode_liquidar` só pode ser verdadeiro para um título pendente/previsto
  elegível e pertencente à barbearia do usuário;
- não expor dados financeiros de outra barbearia nem dados pessoais além do
  nome estritamente necessário para identificar a contraparte.

### 4. ACL obrigatória

Para as funções novas e a assinatura recriada de transferência:

- `REVOKE ALL` de `PUBLIC`, `anon` e `authenticated`;
- `GRANT EXECUTE` apenas para `authenticated` nas duas novas leituras e nas
  quatro operações de negócio aprovadas;
- helpers internos continuam sem `EXECUTE` para `authenticated`;
- tabelas `financeiro_*` continuam sem grants diretos a browser.

## Cliente e testes

1. Só acrescente wrappers mínimos em `src/lib/financeiro/api.js` para as duas
   leituras, com validação no cliente coerente com a do banco. Não conecte
   nenhuma tela.
2. Amplie testes JavaScript dos helpers quando aplicável.
3. Crie testes SQL transacionais com `ROLLBACK` que comprovem:
   - admin enxerga apenas a própria barbearia;
   - usuário de outra barbearia não recebe títulos, contas, série nem
     vencimentos alheios;
   - datas, tipo, status, paginação e ordenação inválidos são rejeitados;
   - paginação e totalização corretas;
   - transferir zero e negativo é rejeitado;
   - `anon` não executa nenhuma RPC financeira;
   - `authenticated` executa somente as oito RPCs aprovadas: pagar, receber,
     transferir, crédito, listar categorias, listar contas, resumo e títulos;
   - helpers e acesso direto às tabelas continuam fechados.
4. Aplique tudo apenas no Supabase local e execute os testes. Não persista
   fixtures de teste.

## Validação e relatório

Execute testes, lint somente dos arquivos alterados e build de produção.
Relate erros preexistentes separadamente. Não considere a fase concluída se
qualquer ACL, isolamento entre barbearias ou teste de validação falhar.

Entregue:

```
## Relatório /financeiro-implantar-contrato-fase-2b

### Alterações
[migration, wrappers e testes]

### Segurança
[ACL, RLS, tenant e validações]

### Verificação local
[migration, testes, lint e build]

### Fora do escopo
[sem UI, rotas, produção ou dados reais]

### Próximo checkpoint
[auditoria humana da migration antes de qualquer deploy]
```
