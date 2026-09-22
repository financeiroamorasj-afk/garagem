---
description: "Corrige localmente os bloqueios da revisão da migration financeira Fase 2B e repete as validações, sem UI ou produção."
---

# /financeiro-corrigir-revisao-fase-2b

## Objetivo

Corrigir os bloqueios identificados na auditoria humana da Fase 2B. Trabalhe
somente na migration ainda não publicada `20260824160000_financeiro_contrato_fase_2b.sql`, nos wrappers financeiros e nos testes relacionados.

Não crie nova migration para estes ajustes: a `20260824160000` ainda não foi
publicada. Não altere UI, rotas, navegação, RLS, dados reais ou Supabase remoto.
Não execute `db push`, `migration repair`, SQL Editor nem qualquer escrita em
produção.

## Correção 1 — Transferência idempotente no banco

Em `financeiro_transferir(uuid, uuid, numeric, date, text, text)`:

1. Rejeite com erro financeiro explícito:
   - `p_valor` nulo, zero ou negativo;
   - `p_data` nula;
   - chave de idempotência nula, em branco, com menos de 8 ou mais de 200
     caracteres;
   - origem e destino iguais.
2. Depois de obter `v_barbearia`, antes da busca por movimentação existente,
   use `pg_advisory_xact_lock` derivado de `barbearia_id` e da chave de
   idempotência, seguindo o padrão já usado na RPC de crédito.
3. Mantenha a consulta por movimentação existente após o lock. Uma repetição da
   mesma chave deve retornar o resultado idempotente, sem criar uma segunda
   transferência ou retornar erro de unicidade.
4. Preserve a transação, o escopo da barbearia, auditoria, `SECURITY DEFINER`,
   `search_path` fixo e as ACLs atuais.

## Correção 2 — Validações estritas das leituras no banco

Em `financeiro_listar_titulos`:

- rejeite explicitamente `p_tipo` nulo;
- rejeite explicitamente `p_ordenar_por` nulo;
- rejeite explicitamente `p_direcao` nula;
- mantenha `p_status` nulo como o único nulo permitido entre esses filtros;
- preserve a allowlist e não introduza SQL dinâmico.

Garanta que a agregação JSON mantenha a mesma ordem calculada na paginação. Se
for necessário explicitar a ordem dentro de `jsonb_agg`, preserve exatamente a
ordem solicitada e o desempate por `id`.

## Correção 3 — Cliente

Em `src/lib/financeiro/api.js`, faça `transferir`:

1. validar a entrada usando `exigirValorPositivo`;
2. arredondar para centavos;
3. rejeitar se o valor arredondado não continuar estritamente positivo;
4. manter a validação existente de UUID e chave de idempotência.

Não altere a assinatura pública do wrapper.

## Testes obrigatórios

Amplie `supabase/tests/financeiro_fase_2b.sql` e os testes JavaScript para
provar:

- transferência com chave nula, vazia, curta e longa é rejeitada;
- transferência com data nula é rejeitada;
- transferência zero e negativa é rejeitada;
- duas tentativas concorrentes com a mesma chave criam somente uma dupla de
  movimentações e a segunda recebe resposta idempotente;
- `p_tipo`, `p_ordenar_por` e `p_direcao` nulos são rejeitados;
- a ordem da página retornada é determinística;
- no cliente, valor que arredonda para zero é rejeitado antes da RPC.

Para o teste de concorrência, use duas sessões/conexões independentes ou uma
abordagem equivalente que realmente exercite o lock. Não simule concorrência
com duas chamadas sequenciais no mesmo bloco. As fixtures devem terminar em
`ROLLBACK` e nunca atingir produção.

## Validação local

1. Reconstrua ou aplique a migration somente no Supabase local.
2. Execute todos os testes SQL existentes e os testes JS.
3. Rode lint apenas nos arquivos alterados, `git diff --check` e build de
   produção.
4. Preserve todas as mudanças alheias do worktree.

## Relatório

```
## Relatório /financeiro-corrigir-revisao-fase-2b

### Correções aplicadas
[migration, cliente e testes]

### Evidência de idempotência
[resultado do teste concorrente, sem dados sensíveis]

### Segurança e validações
[ACL, tenant, parâmetros e acesso direto]

### Verificação local
[migration, testes, lint, diff e build]

### Fora do escopo
[sem UI, rotas ou produção]

### Próximo checkpoint
[nova auditoria humana antes do pré-deploy]
```
