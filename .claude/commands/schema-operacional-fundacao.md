---
description: Propõe (sem aplicar) a migration que corrige o schema operacional — preço e FK de serviço em agendamentos, tabelas reais de servicos/produtos/vendas_produtos — pré-requisito bloqueador identificado no /financeiro-fundacao
---

# /schema-operacional-fundacao

## Contexto

O `/financeiro-fundacao` identificou um bloqueador real: `agendamentos` não tem preço nem FK para `servicos`, e `servicos`/`vendas_produtos` são 100% mock local no `AdminDashboard.jsx` (`useState([...])`), nunca consultam o Supabase. Nenhuma DRE real pode existir sem isso ser corrigido primeiro.

Este comando **propõe a migration, não aplica**. Gera o arquivo SQL em `supabase/migrations/` pronto para revisão, mas não roda contra o banco. Aplicar é decisão explícita de Rafa, depois de revisar aqui no chat.

Decisões de produto já tomadas (não reabra):
- Comissão: campo único `comissao_percentual` por profissional agora. Desenhar de forma que uma tabela de comissão por serviço possa sobrepor esse valor no futuro, sem exigir nova migration destrutiva.
- Sem lógica de assinatura/plano recorrente aqui — isso é feature futura e separada, fora de escopo deste comando.

---

## Parte 1 — Confirmar o estado real antes de propor mudança

1. Tente uma leitura real do schema atual de `servicos`, `vendas_produtos` e `agendamentos` (live query, se a permissão de rede permitir desta vez; senão, `grep` por `.from('servicos')`, `.from('vendas_produtos')`, `.from('agendamentos')` em todo `src/` para confirmar que são mesmo mocks, e liste exatamente onde).
2. Confirme se `servicos` e `vendas_produtos` já existem como tabelas vazias no Postgres (só sem uso no frontend) ou se nem existem fisicamente — o `rls_setup.sql` tem policies pra elas, mas isso não prova que a tabela foi criada. Se não conseguir confirmar via live query, diga isso explicitamente no relatório em vez de assumir.
3. Liste todo lugar no frontend que hoje usa dado mockado de serviço/produto (`AdminDashboard.jsx` e qualquer outro) — isso vira a lista de consumidores que vão precisar ser religados ao Supabase depois (não neste comando, é o próximo).

---

## Parte 2 — Proposta de schema

### `servicos` (nova ou corrigida)
```
id                          uuid PK
barbearia_id                uuid FK -> barbearias, NOT NULL
nome                        text NOT NULL
descricao                   text
duracao_minutos             int NOT NULL
preco                       numeric NOT NULL CHECK (preco >= 0)
comissao_percentual         numeric NULL  -- override futuro por serviço; NULL = usa o padrão do profissional
ativo                       boolean NOT NULL DEFAULT true
created_at / updated_at     timestamptz
```

### `produtos` (catálogo — hoje não existe nem como conceito separado de vendas_produtos)
```
id                          uuid PK
barbearia_id                uuid FK -> barbearias, NOT NULL
nome                        text NOT NULL
preco_venda                 numeric NOT NULL CHECK (>= 0)
preco_custo                 numeric NOT NULL CHECK (>= 0)   -- base do CMV
estoque_quantidade          int NOT NULL DEFAULT 0
ativo                       boolean NOT NULL DEFAULT true
created_at / updated_at     timestamptz
```

### `vendas_produtos` (transação de venda — linha por item vendido)
```
id                          uuid PK
barbearia_id                uuid FK -> barbearias, NOT NULL
produto_id                  uuid FK -> produtos, NOT NULL
cliente_id                  uuid FK -> clientes, NULL
profissional_id             uuid FK -> profissionais, NULL   -- quem vendeu, se aplicável a comissão
quantidade                  int NOT NULL CHECK (> 0)
preco_unitario_snapshot     numeric NOT NULL   -- preço no momento da venda, não referencia produtos.preco_venda (preço muda com o tempo)
preco_custo_snapshot        numeric NOT NULL   -- idem, pra CMV não mudar retroativamente se o custo do produto for editado depois
status                      text CHECK (status in ('concluida','cancelada'))
data_venda                  timestamptz NOT NULL DEFAULT now()
created_at                  timestamptz
```
Nota: os campos `_snapshot` existem porque o `/financeiro-fundacao` mostrou que o Rebip calcula CMV em cima do custo atual do produto (`produtos.custo_aquisicao`), o que distorce a DRE de meses passados se o custo for editado depois. Resolver isso aqui evita herdar o mesmo problema.

### `agendamentos` (alteração — adicionar colunas, não recriar)
```
+ servico_id                uuid FK -> servicos, NULL         -- nullable no início pra não quebrar dados existentes; ver Parte 3
+ valor_cobrado_snapshot    numeric NULL                       -- preço do serviço no momento do agendamento, mesma lógica de snapshot acima
```
Manter a coluna de texto livre `servico` existente (não remover ainda) até confirmar que todos os consumidores foram migrados — evita quebra imediata de tela em produção.

### `profissionais` (alteração)
```
+ comissao_percentual       numeric NULL CHECK (comissao_percentual BETWEEN 0 AND 100)
```

---

## Parte 3 — Estratégia de migração de dados existentes

Como `agendamentos.servico` hoje é texto livre (ex: `"Corte Degradê"`), e não há garantia de que os valores batem 1:1 com nomes de serviço reais:

1. Proponha uma migration que **adiciona as colunas novas como nullable**, sem forçar preenchimento imediato.
2. Não tente auto-popular `servico_id` a partir do texto livre via matching automático — isso é arriscado (nomes podem ter variações, abreviações). Deixe como tarefa manual ou de outro comando, e documente isso explicitamente como próximo passo, não resolva aqui.
3. Garanta que RLS das tabelas novas segue o padrão existente (`get_my_barbearia_id()`), igual às demais.

---

## O que NÃO fazer

- Não aplicar a migration contra o banco (`supabase db push` ou equivalente) — só gerar o arquivo.
- Não popular dados reais em `servicos`/`produtos` (isso é cadastro de conteúdo, não schema).
- Não tocar em `AdminDashboard.jsx` nem religar o frontend ao Supabase ainda — isso é um próximo comando (`/schema-operacional-migrar` ou equivalente), depois que a migration for aprovada e aplicada.
- Não iniciar nada de Envelopes, DRE, ou conciliação — isso é `/financeiro-migrar`, depois deste.

---

## Formato do relatório

```
## Relatório /schema-operacional-fundacao

### Estado real confirmado
[o que existe de fato hoje, com base em live query ou grep — não suposição]

### Migration proposta
[caminho do arquivo gerado em supabase/migrations/, com o SQL completo]

### Consumidores no frontend que vão precisar religar depois
[lista de arquivos/linhas com mock, para o próximo comando]

### Riscos ou dúvidas
[qualquer coisa que precise de decisão antes de aplicar a migration]
```
