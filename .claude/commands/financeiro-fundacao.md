---
description: Lê o módulo financeiro do amora-avalia-v2 (Rebip) em detalhe e produz uma spec de adaptação para o Garagem System — schema, endpoints, regras de negócio — sem implementar nada. Saída é para revisão humana antes do comando de implementação.
---

# /financeiro-fundacao

## Objetivo

Este comando **não escreve nenhum código no Garagem System**. É leitura profunda do módulo financeiro do `amora-avalia-v2` (aberto no VSCode) + produção de uma spec de adaptação para revisão. A implementação real vira um comando separado (`/financeiro-migrar` ou nome equivalente), só depois da spec ser aprovada.

Pressuposto: você está rodando isso com o `amora-avalia-v2` aberto como projeto ativo (ou acessível via path relativo/absoluto informado por Rafa). Se não conseguir localizar o repo, pare e peça o path em vez de inventar estrutura.

## Parte -1 — Design system (obrigatória antes de qualquer proposta de tela)

Leia por completo `docs/design-system/DESIGN-SYSTEM.md`, `src/index.css`, a rota
`/design-system` e os primitivos disponíveis em `src/components/ui/`. Registre no
relatório, sem alterar nenhum arquivo:

1. Os tokens e primitivos que serão usados em cada tipo de tela financeira
   (indicador, tabela, filtro, formulário, modal, estados vazio/carregando/erro).
2. As regras de acessibilidade aplicáveis: contraste, texto mínimo, cor nunca
   como único indicador de estado, foco visível e `prefers-reduced-motion`.
3. Qualquer componente que a fase de implementação precise criar porque não há
   primitivo aprovado que o cubra. Não improvise estilos nem proponha hex,
   sombras ou raios fora da especificação.

Esta parte é uma checagem de conformidade visual; ela não autoriza implementar
telas. A implementação só pode começar após a aprovação humana da spec inteira.

---

## Parte 0 — Contexto funcional já disponível (não precisa redescobrir)

Rafa forneceu a documentação funcional completa do Rebip (`DOCUMENTACAO_SECOES.pdf`, seção 5 — Financeiro). Use-a como referência de UX/produto, complementar à leitura de código da Parte 1 — a doc explica o "porquê" e o comportamento visível; o código explica o "como". Pontos já extraídos dela, não repita o trabalho:

- **Painel Executivo tem 5 abas**: Resultado, Despesas, Vendas, Fornecedoras, Passivos. Badge de saúde (verde/amarelo/vermelho por margem líquida), "Semáforo Anti-Loop" com metas (15% = breakeven, 25% = saudável), card "Resultado do Mês" com parecer textual automático por regras (não IA).
- **Aba Despesas**: cards Entrou/Saiu/Sobrou, breakdown por categoria DRE, top 5 despesas, alerta de duplicata (mesmo valor + mesma data), "Compromissos Futuros" 30/60/90 dias (acumulativo) com % sobre receita média dos últimos 3 meses.
- **Aba Passivos**: créditos e cupons em circulação da cliente, "Régua de Risco" comparando passivo total com receita média mensal (verde <30%, amarelo 30-80%, vermelho ≥80%).
- **Envelopes**: distribuição percentual do lucro em categorias (reserva, reinvestimento, sócios), aportes/resgates registrados como par de movimentações (evita dupla contagem), cálculo do lucro do dia em fuso BRT.

Já identificado como **não-portável** (específico do modelo de brechó/consignação), não precisa reconfirmar na Parte 2:
- CMV segmentado por origem (Consignação/Próprio/Garimpo/Manual)
- Aba "Fornecedoras" inteira do Painel Executivo (ranking, retorno por lote)
- Módulo Consignados (carência, repasse) inteiro

**Decisão já tomada por Rafa**: o Garagem TERÁ crédito/cupom de cliente (tipo vale, pacote pré-pago) — a aba "Passivos" é escopo válido, não descartar. Ao propor o schema na Parte 3, inclua isso. Atenção: isso pode se sobrepor com uma ideia mais antiga de "assinatura/plano recorrente" de cliente (registrada em conversa anterior, fora deste repo) — se encontrar qualquer menção a plano recorrente/assinatura em algum lugar do Garagem, sinalize a sobreposição como pergunta aberta em vez de assumir que são a mesma coisa ou coisas diferentes.

---

## Parte 1 — Leitura completa e literal do financeiro do Rebip

Não resuma de memória do relatório anterior — leia os arquivos de verdade, na íntegra, agora:

1. `pages/api/financeiro/dre.js` e `dre-kpis.js` — lógica completa de cálculo, não só a assinatura da função.
2. A RPC `fn_consolidado_financeiro_mensal` — se o SQL dela estiver em alguma migration/seed do projeto, leia o corpo da função inteiro (não só o nome).
3. `pages/api/executivo/resultado-mes.js` — a lógica do "parecer" condicional (as regras de decisão exatas, não uma paráfrase).
4. Fluxo de conciliação: `pages/api/financeiro/conciliar.js`, `conciliacao/confirmar-match.js`, `conciliacao/lancar-orfao.js`, e o script auxiliar `scripts/marco-zero-amora/matching.js`.
5. Comissionamento: `pages/api/rh/comissoes/detalhe.js` e onde `funcionarios.comissao_percentual` é lido/aplicado.
6. Componentes de tela: `components/financeiro/ConciliacaoBancaria.js`, `PainelEnvelopes.js`, `ContasAPagar.js`, `components/executivo/PainelExecutivo.js`.
7. Todas as tabelas envolvidas: `movimentacoes_financeiras`, `contas_a_pagar`, `contas_receber`, `contas_bancarias`, `categorias_financeiras`, `envelopes`, `envelopes_transacoes` — schema completo de colunas de cada uma (via migration/seed do Rebip, não inferência).
8. O SKILL.md do financeiro do Rebip (mencionado como fonte da lacuna de "sem helper centralizado") — leia o conteúdo completo, não só a conclusão.

---

## Parte 2 — Separar o que é específico de brechó/consignação do que é genérico de gestão financeira

O `amora-avalia-v2` é um sistema de brechó/consignação, não de barbearia. Para cada peça mapeada na Parte 1, classifique:

- **Genérico/portável** — lógica de DRE, conciliação, comissionamento, envelopes que faz sentido pra qualquer negócio de serviço/varejo pequeno.
- **Específico de consignação, não portável** — ex: campos de curadoria, split com o consignante original, lógica de peça única vs estoque replicável, ou qualquer coisa amarrada ao modelo de negócio de brechó.

Liste explicitamente o que cai em cada categoria. Não assuma — se não tiver certeza se algo é genérico ou específico, marque como "verificar com Rafa".

---

## Parte 3 — Spec de adaptação para o Garagem System

Com base nas Partes 1 e 2, produza uma proposta de adaptação, respeitando o que já existe no Garagem (schema com `barbearia_id`, RLS via `get_my_barbearia_id()`/`get_my_role()`, ver `rls_setup.sql`):

### Schema proposto
Para cada tabela do Rebip considerada portável, proponha o equivalente no Garagem:
- Nome de tabela (adaptado ao vocabulário do domínio: barbearia, não brechó)
- Colunas, com `barbearia_id` no lugar de `tenant_id`
- Como ela se relaciona com as tabelas que já existem (`agendamentos`, `vendas_produtos`, `profissionais`)

Inclua também proposta de schema para **crédito/cupom de cliente** (equivalente à aba Passivos do Rebip) — Rafa confirmou que isso entra no escopo. Estruture como o Rebip estrutura (créditos e cupons em circulação, resgates), mas adapte pro contexto de barbearia (ex: pacote pré-pago de cortes, vale-presente). Se encontrar no repo do Garagem qualquer menção anterior a "assinatura" ou "plano recorrente" de cliente, pare e sinalize a sobreposição como pergunta aberta — não assuma que é a mesma feature nem que são features diferentes.

Ponto que precisa de atenção explícita: no Rebip, a receita provavelmente é só venda de produto (com CMV). No Garagem, existem **dois tipos de receita**: serviço prestado (agendamento, sem CMV, mas com comissão do profissional) e venda de produto (`vendas_produtos`, com CMV, ver o markup de 30% já usado no AdminDashboard atual). A DRE do Garagem precisa somar os dois corretamente, sem tratar serviço como se fosse produto com custo zero por acidente. Documente como isso deveria funcionar.

### Endpoints/rotas propostos
Liste as rotas de API (ou RPCs Supabase, se preferir esse padrão em vez de API routes) equivalentes às do Rebip, adaptadas.

### Regras de negócio a decidir com Rafa (não decida sozinho)
Liste como perguntas explícitas, por exemplo:
- A tolerância de conciliação (±R$0,02, janela de 5 dias) deve ser igual, ou o Garagem tem outro perfil de operação que justificaria mudar?
- Comissionamento: o Rebip usa % fixo por funcionário sobre venda líquida. O Garagem tem profissionais com comissão sobre serviço prestado — é a mesma lógica, ou serviço vs produto precisam de tratamento de comissão diferente?
- Envelopes de orçamento: portar como está, ou é dispensável nessa primeira fase?

### Correção das lacunas documentadas do Rebip
O relatório anterior identificou duas dívidas explícitas do Rebip: (1) nenhum helper financeiro centralizado — tudo duplicado por rota de API; (2) políticas de Storage não versionadas. Para o Garagem:
- Proponha uma estrutura de helper/service compartilhado para lógica financeira (ex: `src/lib/financeiro.js` ou equivalente), em vez de replicar cálculo em cada componente/rota.
- Isso é sobre o financeiro especificamente — Storage é escopo de outra feature (ficha de corte), não precisa detalhar aqui, só mencionar que a mesma disciplina de versionamento deve valer lá também.

---

## O que NÃO fazer neste comando

- Não crie migrations.
- Não crie componentes React.
- Não crie rotas novas no `App.jsx`.
- Não instale dependências.
- Não decida sozinho nenhum item da seção "Regras de negócio a decidir com Rafa" — liste como pergunta aberta.

---

## Formato do relatório final

```
## Relatório /financeiro-fundacao

### 1. Leitura literal do Rebip
[resumo por arquivo/tabela, com trechos de lógica real quando relevante — não só nomes]

### 2. Classificação portável vs específico de consignação
[lista categorizada]

### 3. Spec de adaptação
#### Schema proposto
[tabelas, colunas, relações]
#### Tratamento de receita dupla (serviço vs produto)
[proposta]
#### Endpoints/rotas propostos
[lista]
#### Regras de negócio a decidir com Rafa
[perguntas abertas, não decisões]
#### Estrutura de helper centralizado proposta
[proposta de organização de código]

### Riscos ou pontos de atenção
[qualquer coisa que precise de decisão antes de virar o comando de implementação]
```
