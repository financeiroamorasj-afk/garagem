---
description: "Implementa em localhost a tela real de leitura dos envelopes Fase 2D, sem operações de distribuição ou resgate."
---

# /financeiro-implantar-ui-envelopes-leitura-2d

## Escopo autorizado

Implementar a primeira tela operacional de Envelopes em localhost, com consultas reais e sem qualquer escrita financeira. Não criar migrations, não chamar RPCs mutáveis, não distribuir, resgatar, estornar, alterar envelopes, criar dados, acessar produção para escrita, commit ou push.

## Regra de versionamento

O worktree possui alterações preexistentes e compartilhadas em arquivos do design system. Não criar commit nesta etapa e não usar `git add`, reset, checkout ou qualquer ação que mexa no índice. O commit exclusivo será planejado após aprovação visual, usando lista de arquivos confirmada.

## Leitura obrigatória

Antes de editar, revisar:

- `docs/design-system/DESIGN-SYSTEM.md` e `src/index.css`;
- `src/components/ui` e `Modal.jsx`;
- `src/pages/financeiro/FinanceOverview.jsx`, `FinanceTitles.jsx` e `FinanceRegistrations.jsx`;
- `src/lib/financeiro/api.js`, schemas e helpers de autorização;
- contrato publicado da Fase 2D e `docs/financeiro/REFERENCIA-ENVELOPES-REBIP.md`.

## Rota e navegação

Adicionar a rota protegida `/admin/financeiro/envelopes` e o item “Envelopes” na seção Financeiro. Reutilizar o mesmo controle real de sessão/perfil admin/master. Barbeiro, perfil ausente, sessão ausente ou erro de autorização não podem renderizar dados ou menu financeiro.

## Consultas permitidas

Conectar somente os wrappers de leitura para:

- `financeiro_listar_envelopes(false)`;
- `financeiro_saldos_disponiveis_contas()`;
- `financeiro_listar_transacoes_envelope(...)` quando o usuário abrir o extrato.

Criar/adaptar wrappers mínimos em `src/lib/financeiro/api.js`, com validação de parâmetros e tratamento de erro já adotado no módulo. Não usar `.from('financeiro_*')`, `service_role`, chaves privilegiadas ou armazenamento local de permissões.

## Interface aprovada

Criar `FinanceEnvelopes.jsx` usando cards como visualização principal:

- resumo por conta: saldo bancário, reservado e disponível, explicando que reserva não reduz saldo bancário real;
- grade responsiva de cards de envelopes, com nome, finalidade, conta vinculada, percentual, saldo reservado, situação e medidor acessível;
- desktop em grade; 360 px com um card por linha; nenhuma rolagem horizontal do documento;
- estados de loading, erro recuperável, sem contas, sem envelopes, sem saldo, atenção e inativo;
- botão “Ver extrato” em cada card; abrir modal acessível e carregar o extrato real somente então;
- extrato com dados BRT, tipo, direção, valor e saldo posterior, mais paginação simples se necessária;
- ações “Distribuir lucro diário” e “Usar / resgatar” devem permanecer claramente desabilitadas e explicar que a integração operacional será a próxima fase.

Não renderizar dados fictícios em tela operacional. Não portar visual claro do Rebip: usar exclusivamente tokens, componentes e identidade do Garagem.

## Segurança e experiência

- não expor `barbearia_id`, hashes, chaves de idempotência, dados de auditoria ou campos internos;
- não inferir saldo disponível no frontend: exibir somente o resultado da RPC;
- o modal mantém foco, Escape/overlay fecham e foco retorna ao card de origem;
- erros de RPC exibem mensagem recuperável sem detalhes de banco;
- não permitir interação em botões futuros, inclusive por teclado.

## Validação local

Criar testes de leitura/autorização e de transformação de dados quando necessário. Rodar testes, lint dos arquivos alterados, build, `git diff --check` e servidor local. Confirmar a rota com HTTP 200.

Não alegar inspeção desktop/360 px sem navegador conectado. Solicitar aprovação visual humana antes de integrar qualquer RPC mutável.

## Relatório

Entregar `Relatório /financeiro-implantar-ui-envelopes-leitura-2d` com rota, RPCs usadas, arquivos modificados, evidência de segurança, validações e URL localhost. Confirmar que nenhuma operação financeira, migration, produção ou commit foi realizada.

