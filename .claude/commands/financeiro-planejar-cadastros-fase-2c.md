---
description: "Especifica o contrato seguro para criar e editar contas bancárias e categorias financeiras, sem alterar banco ou UI."
---

# /financeiro-planejar-cadastros-fase-2c

## Objetivo

Produzir a especificação aprovada para tornar operacionais os Cadastros
financeiros: contas bancárias e categorias. Esta fase é somente de análise e
contrato; não cria migration, RPC, UI, dado real, commit ou alteração remota.

## Estado confirmado

- Fase 2B publicada e auditada: leituras/ações financeiras usam RPCs com RLS,
  escopo por barbearia e sem grants diretos às tabelas financeiras.
- A tela `/admin/financeiro/cadastros` é somente leitura e foi aprovada
visualmente.
- As contas bancárias são referência para pagamentos, recebimentos,
transferências e saldo; alterações não podem quebrar histórico.
- Categorias são referência de títulos/movimentações e grupo DRE; alterações
não podem alterar silenciosamente lançamentos históricos.

## Limites de segurança

- Nunca liberar escrita direta do browser nas tabelas `financeiro_*`.
- Nenhuma RPC pode aceitar `barbearia_id` do cliente: derive-o por
  `financeiro_assert_admin()`.
- Toda escrita deve ser auditada com antes/depois e correlation ID opcional.
- `PUBLIC` e `anon` não recebem `EXECUTE`; `authenticated` recebe apenas as
  RPCs explicitamente aprovadas.
- Não apagar conta/categoria que possua referência. Avalie desativação lógica
  (`ativa = false`) em vez de exclusão.

## Parte 1 — Inventário e regras de domínio

Revise migrations, constraints, funções e telas atuais. Relate:

1. Campos reais, defaults, checks, índices e FKs de `financeiro_contas_bancarias`
   e `financeiro_categorias`.
2. Todas as tabelas/RPCs que referenciam conta ou categoria.
3. Regra atual de uma única `conta_principal` ativa por barbearia e como
   promover outra conta sem janela com duas principais.
4. Como preservar saldo inicial e histórico: se editar saldo inicial deve ser
   permitido, bloqueado ou registrado como ajuste. Recomende a opção segura.
5. Quais tipos de conta, tipos de categoria e grupos DRE são permitidos pelo
   schema atual, sem inventar enumerações.

## Parte 2 — Proposta de RPCs mínimas

Proponha, com assinatura e resposta JSON resumida, somente o necessário:

- criar conta bancária;
- editar metadados de conta bancária;
- definir conta principal;
- ativar/desativar conta bancária;
- criar categoria;
- editar metadados de categoria;
- ativar/desativar categoria.

Para cada RPC, defina validações de nome, tipo, instituição, grupo DRE, flags,
IDs e campos editáveis. Decida explicitamente:

- saldo inicial: recomendação padrão é imutável após criação; correções devem
  ocorrer por movimento de ajuste auditável em fase própria;
- conta com títulos/movimentos: pode ser desativada, mas não removida;
- categoria com histórico: pode ter nome futuro alterado apenas se esse efeito
  for aceitável; caso contrário, recomendar desativar e criar outra;
- não permitir desativar a última conta ativa nem a conta principal sem uma
  substituta explícita, se isso puder comprometer liquidações.

Cada RPC deve usar `SECURITY DEFINER`, `search_path = public, auth`,
`financeiro_assert_admin()`, `FOR UPDATE` quando houver competição, e auditoria
por `financeiro_auditar`.

## Parte 3 — Migration e testes propostos, sem criar

Descreva a migration futura:

- funções e ACLs que seriam adicionadas/alteradas;
- mudanças de constraint/índice, somente se forem necessárias;
- estratégia transacional;
- nenhuma revogação ampla que afete RPCs da Fase 2B.

Descreva testes SQL transacionais obrigatórios:

- isolamento entre duas barbearias;
- `anon` sem execução e `authenticated` somente com RPCs aprovadas;
- criação/edição válida;
- dados inválidos e tentativas com UUID de outra barbearia rejeitados;
- corrida para conta principal não deixa duas principais;
- desativação com dependências e última conta ativa;
- logs de auditoria sem acesso direto pelo browser;
- idempotência de criação, se a RPC criar registros a partir de intenção do
  cliente (recomende chave de idempotência para toda operação de criação).

## Parte 4 — Proposta de UI futura, sem implementar

Planeje a evolução da tela aprovada:

- uma ação primária por aba: “Nova conta” ou “Nova categoria”;
- Modal acessível com confirmação, foco preso, Escape e retorno ao gatilho;
- `CurrencyInput` apenas para saldo inicial na criação, se aprovado;
- edição sem alterar campos históricos proibidos;
- ativar/desativar com confirmação e consequência explicada;
- estados loading, erro, vazio e sem permissão;
- localhost e aprovação visual antes de conectar as RPCs reais.

## Formato do relatório

```
## Relatório /financeiro-planejar-cadastros-fase-2c

### Estado e regras atuais
[schema, dependências e integridade]

### Decisões recomendadas
[saldo, histórico, principal, desativação]

### Contrato de RPCs para aprovação
[assinaturas, validações, ACLs e auditoria]

### Testes e migration futuros
[sem código]

### UI futura
[fluxos e critérios de aceite]

### Decisões necessárias
[somente escolhas do dono]
```
