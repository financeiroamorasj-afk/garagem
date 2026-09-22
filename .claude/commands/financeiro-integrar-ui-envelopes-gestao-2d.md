---
description: "Conecta em localhost a gestão e distribuição segura de envelopes Fase 2D, mantendo resgate bloqueado até existirem lançamentos manuais."
---

# /financeiro-integrar-ui-envelopes-gestao-2d

## Escopo autorizado

Conectar a tela `/admin/financeiro/envelopes` às RPCs já publicadas para criar, editar, ativar/desativar, simular e distribuir envelopes. Testar operações mutáveis exclusivamente no Supabase local.

Não criar migrations, alterar ACL/RLS, aplicar produção, criar dados reais, habilitar resgate, commit ou push.

## Fluxos a implementar

### Cadastro e manutenção

- Botão **Novo envelope** no cabeçalho.
- Modal acessível com nome, finalidade, conta bancária ativa vinculada e percentual de distribuição opcional.
- Ações **Editar** e **Ativar/Desativar** em cada card.
- Filtro **Ativos / Todos** para permitir reativação.
- A edição deve enviar `updated_at` e manter o modal aberto em conflito de versão, oferecendo “Recarregar dados”.
- Se houver saldo, a UI deve desabilitar a troca de conta e a desativação, explicando que primeiro é necessário resgatar todo o saldo. O banco continua sendo a autoridade e os erros de RPC devem ser tratados.
- Não oferecer excluir, ajuste manual ou transferência de saldo entre envelopes.

### Distribuição diária

- Botão **Distribuir lucro diário** abre primeiro uma etapa de simulação, usando `financeiro_simular_distribuicao_diaria`.
- Permitir escolher data BRT não futura.
- Mostrar base distribuível, percentual total, resíduo não distribuído e valores por envelope/conta antes de confirmar.
- Se a disponibilidade de uma conta vinculada for insuficiente, mostrar orientação para registrar uma transferência real em Contas antes de distribuir. Não tentar transferir automaticamente.
- A confirmação chama `financeiro_distribuir_envelopes_diario` com chave idempotente criada ao abrir a confirmação e reutilizada em retries da mesma intenção.
- Cancelamento, sucesso, mudança de data ou nova simulação descartam a chave e criam outra apenas para a nova intenção.
- Após sucesso, recarregar envelopes e saldos; nunca calcular saldo disponível no frontend.

### Resgate

Manter **Usar / resgatar** desabilitado. Exibir: “Disponível após a implantação de lançamentos manuais a pagar.”

Não chamar `financeiro_resgatar_envelope` nem `financeiro_estornar_resgate_envelope`: o contrato exige título manual pendente e a criação desses títulos ainda não existe na UI nem nas RPCs públicas.

## Wrappers e validações

Adicionar somente wrappers necessários em `src/lib/financeiro/api.js` e validações puras em schemas/helpers:

- criar, editar e definir envelope ativo;
- simular e distribuir diariamente;
- validação de finalidade, percentual entre 0 e 100, data BRT, UUID, booleano, versão e chave idempotente.

Não usar `.from('financeiro_*')`, `service_role`, storage local de permissão ou dados de tenant enviados pela UI.

## Mensagens de erro

Mapear ao menos:

- nome ativo em uso;
- percentual total excedido;
- disponibilidade da conta vinculada insuficiente;
- sem lucro distribuível;
- distribuição já realizada para o dia;
- conflito de versão;
- envelope com saldo;
- tentativa de trocar conta com saldo;
- falha de autorização;
- idempotência com payload divergente.

Mensagens devem ser claras, sem detalhes de SQL, e conservar modal/estado quando for possível corrigir.

## Design e acessibilidade

Reutilizar cards aprovados, `Modal`, `Button`, `CurrencyInput`, `Tabs`/filtros e tokens existentes. Não reintroduzir lista como visualização primária, cores hex, dependências ou aparência da Rebip.

Todos os modais precisam manter foco, fechar por Escape/overlay, retornar foco ao gatilho, ter labels e erros associados. A experiência deve funcionar em 360 px sem overflow horizontal.

## Segurança e validação local

- Validar sessão/perfil admin/master como o restante do financeiro.
- Criar testes de wrappers, idempotência de intenção, cancelamento, conflito e mapeamento de erros.
- Executar mutações e smoke tests apenas no Supabase local com fixtures descartáveis.
- Validar que não houve chamada mutável no remoto e que resgate continua ausente da UI.
- Rodar testes, lint dos arquivos alterados, build e `git diff --check`.

## Relatório

Entregar `Relatório /financeiro-integrar-ui-envelopes-gestao-2d` com RPCs conectadas, operações locais realizadas, testes, limitações de resgate, arquivos alterados e URL localhost para aprovação visual. Não criar commit; parar após a revisão humana.

