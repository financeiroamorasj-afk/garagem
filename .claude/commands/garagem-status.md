---
description: Gera um relatório estruturado do estado atual do Garagem System — schema real do Supabase, árvore de rotas, e o mapeamento já feito da arquitetura do Rebip/adm-repi — para decidir a próxima frente de trabalho
---

# /garagem-status

## Objetivo

Este comando **não implementa nada**. É leitura e relatório, para eu (Rafa) e o Claude (chat) decidirmos juntos qual frente entra primeiro: Módulo Financeiro, Captação de Lead, ou padrões gerais do adm-repi.

Não confie em relatórios anteriores ou em memória de sessões passadas — leia o estado real do código e do banco agora.

---

## Parte 1 — Schema real do Supabase

Não infira a partir de nomes de componentes. Leia o schema de verdade:

1. Se houver migrations em `supabase/migrations/` ou arquivos `.sql` no repo (ex: `rls_setup.sql`), liste todos os arquivos e resuma o que cada um faz.
2. Liste todas as tabelas existentes, com colunas e tipos.
3. Liste todas as políticas de RLS ativas, por tabela.
4. Confirme: todas as tabelas de negócio (`agendamentos`, `clientes`, `profissionais`, `servicos`, `vendas_produtos`, etc.) têm coluna `barbearia_id`? Alguma ficou de fora?
5. Existe alguma tabela ou coluna relacionada a financeiro (transações, comissões, pagamentos, forma de pagamento) já criada, mesmo que vazia/não usada no frontend? Ou é 100% inexistente ainda?
6. Existe alguma tabela ou campo relacionado a "leads" (captação da landing page)? Ou é 100% inexistente?
7. Existe bucket de Supabase Storage configurado? Algum já em uso?

## Parte 2 — Árvore de rotas e estrutura do ADM

1. Mostre a árvore de rotas completa (React Router v6), incluindo rotas aninhadas dentro de `AdminLayout`.
2. Onde exatamente fica o `<Outlet/>` e o que cada rota filha renderiza hoje.
3. `ProtectedRoute` e `AdminLayout` — são a mesma coisa ou camadas diferentes? Como se relacionam?
4. A raiz (`/`) está de fato livre para a landing page, ou ainda tem algo nela?
5. Existe algum ponto de extensão já pensado para novos módulos (ex: um item de menu "Financeiro" já no sidebar, mesmo sem rota implementada)?

## Parte 3 — Mapeamento já feito da arquitetura Rebip/adm-repi

O resumo da sprint mencionou que "já temos o escopo exato" mapeado do Rebip para: Módulo Financeiro (DRE e conciliação bancária inteligente), infraestrutura de Supabase Storage, utilitários de compressão de imagem via Canvas.

**Reproduza esse mapeamento aqui, por completo**, não resuma em uma frase. Para cada item:

### Módulo Financeiro (DRE + conciliação)
- Como o Rebip estrutura a DRE? Quais tabelas/views ele usa?
- Como funciona a "conciliação bancária inteligente" no Rebip — é importação de extrato (OFX/CSV), matching automático por valor/data, algo mais sofisticado?
- Como o Rebip modela comissionamento (percentual fixo por profissional? por serviço? split configurável?)
- Quais telas/componentes do adm-repi implementam isso hoje? (nomes de arquivo, se possível)

### Supabase Storage
- Como o Rebip estrutura buckets — um bucket por tenant, ou um bucket único com paths segmentados por tenant?
- Que políticas de acesso (RLS de storage) o Rebip usa?

### Compressão de imagem via Canvas
- Qual utilitário/lib o Rebip usa para compressão?
- Em que fluxo ele é chamado (upload direto, antes de enviar pro Storage)?
- Existe redimensionamento além de compressão (thumbnails, múltiplas resoluções)?

Se qualquer um desses pontos **não foi realmente mapeado ainda** (ex: foi mencionado no resumo da sprint mas não há detalhe concreto por trás), diga isso explicitamente em vez de preencher com suposição.

## Parte 4 — Landing page e captação de lead

1. Qual é o estado atual da landing page local (a que não tem controle de versão)? Ela já tem algum formulário de contato/lead?
2. Se tem formulário, pra onde os dados vão hoje (nenhum lugar, um `mailto:`, um serviço externo, nada)?
3. Confirme: a landing e o sistema Garagem (ADM) são dois projetos/repositórios separados hoje, ou já foram unificados na reestruturação de rotas mencionada no resumo da sprint?

---

## Formato do relatório

```
## Relatório /garagem-status

### 1. Schema Supabase
[tabelas, colunas, RLS, gaps]

### 2. Rotas e estrutura ADM
[árvore de rotas, AdminLayout, pontos de extensão]

### 3. Mapeamento Rebip/adm-repi
#### Financeiro (DRE + conciliação)
[detalhe real ou "não mapeado ainda, apenas mencionado"]
#### Storage
[detalhe real ou "não mapeado ainda"]
#### Compressão de imagem
[detalhe real ou "não mapeado ainda"]

### 4. Landing page / captação de lead
[estado atual, separado ou unificado, formulário existe ou não]

### Riscos ou lacunas identificadas
[qualquer coisa que pareça inconsistente entre o que foi reportado na sprint e o que o código realmente mostra]
```
