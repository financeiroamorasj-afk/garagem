---
description: "Conecta em localhost o botão Adicionar reserva à RPC auditada de aporte avulso em envelopes Fase 2D.1."
---

# /financeiro-integrar-ui-aporte-avulso-envelopes-2d-1

## Pré-condição aprovada

A migration `20260827100000_financeiro_aporte_avulso_envelopes_2d_1.sql` foi aplicada e auditada em produção. A auditoria confirmou a RPC:

```text
financeiro_aportar_envelope(uuid, numeric, text, text)
```

com `SECURITY DEFINER`, `search_path = public, auth`, execução somente para `authenticated`, 28 RPCs financeiras públicas, zero para `anon` e `PUBLIC`, RLS ativo e tabelas sem grants diretos.

## Escopo autorizado

Integrar em localhost o aporte avulso à tela existente:

```text
/admin/financeiro/envelopes
```

Adicionar o botão **Adicionar reserva** nos cards e conectá-lo à RPC auditada. Nesta etapa:

- testar mutações exclusivamente no Supabase local;
- não criar ou alterar migrations, funções, RLS, grants ou dados remotos;
- não habilitar resgate;
- não criar commit, push ou deploy;
- preservar todas as alterações alheias já existentes no worktree.

## Wrapper e validação

Adicionar em `src/lib/financeiro/api.js` um wrapper mínimo para `financeiro_aportar_envelope`, recebendo:

- `envelopeId`;
- `valor`;
- `idempotencyKey`;
- `correlationId` opcional.

Enviar exatamente:

```text
p_envelope_id
p_valor
p_idempotency_key
p_correlation_id
```

Validar no cliente:

- UUID do envelope;
- valor numérico, finito e maior que zero;
- arredondar para centavos e validar novamente, rejeitando valores que virem zero;
- chave idempotente entre 8 e 200 caracteres;
- correlation ID opcional conforme o padrão atual.

Não usar `.from('financeiro_*')`, `service_role`, tenant enviado pelo browser ou acesso direto às tabelas.

## Botão no card

Em `src/pages/financeiro/FinanceEnvelopes.jsx`, adicionar **Adicionar reserva** como ação operacional clara no card:

- disponível somente quando o envelope estiver ativo e a conta vinculada tiver sido carregada;
- desabilitado para envelope inativo;
- se `saldo_disponivel <= 0`, manter desabilitado e explicar que a conta não possui valor disponível para reservar;
- manter **Usar / resgatar** desabilitado com a explicação existente;
- preservar **Editar**, ativar/desativar e **Ver extrato**;
- organizar as ações para não deixar o card excessivamente alto ou desalinhado na grade.

## Modal de aporte

Usar os primitivos aprovados `Modal`, `Button`, `CurrencyInput`, `Label` e tokens do design system. Não criar um segundo componente monetário.

O modal deve mostrar:

- nome do envelope;
- conta vinculada;
- saldo disponível atual da conta, exatamente como retornado por `financeiro_saldos_disponiveis_contas`;
- `CurrencyInput` com o rótulo **Valor a reservar**;
- texto claro: “Esta operação reserva parte do saldo da conta no sistema. O saldo bancário real não é movimentado.”;
- confirmação **Adicionar reserva** e cancelamento.

Não exibir um “saldo disponível depois” como valor confirmado calculado pelo frontend. O banco é a autoridade; após o sucesso, recarregar pela RPC e mostrar o valor atualizado.

O modal deve preservar foco, Escape, overlay, retorno de foco, labels associados, `aria-invalid`, mensagem de erro e funcionamento em 360 px sem overflow horizontal.

## Idempotência da intenção

Usar o padrão existente de `envelopeIntentKeyFor`:

- ao abrir o modal, criar intenção `aportar` vinculada ao ID do envelope;
- retries da mesma intenção reutilizam exatamente a mesma chave;
- erro recuperável mantém a chave;
- cancelar, fechar, trocar de envelope ou concluir com sucesso descarta a chave;
- uma nova abertura cria uma nova chave;
- desabilitar confirmação durante envio para impedir duplo clique visual, sem depender disso para segurança.

Gerar um `correlationId` por intenção ou reutilizar a própria chave idempotente, conforme o padrão já adotado, sem armazenar no navegador.

## Resultado e atualização

Após sucesso:

1. fechar o modal;
2. mostrar feedback claro, por exemplo “Reserva adicionada ao envelope com sucesso.”;
3. recarregar `financeiro_listar_envelopes` e `financeiro_saldos_disponiveis_contas`;
4. se o extrato do mesmo envelope estiver aberto, recarregar sua primeira página;
5. não alterar saldos localmente por soma/subtração otimista.

O evento `aporte_avulso` deve aparecer no extrato com rótulo amigável **Aporte avulso** ou **Reserva adicionada**, direção crédito, valor e data. Nunca mostrar o nome técnico cru quando houver formatação de tipo.

## Erros amigáveis

Ampliar `mensagemErroEnvelope` para mapear, sem expor SQL:

- `FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE`: “A conta vinculada não possui saldo disponível suficiente para esta reserva.”;
- `FINANCEIRO_ENVELOPE_INATIVO`: “Este envelope está inativo e não pode receber reservas.”;
- `FINANCEIRO_ENVELOPE_NAO_ENCONTRADO`: “O envelope não foi encontrado. Recarregue os dados.”;
- `FINANCEIRO_VALOR_INVALIDO`: “Informe um valor maior que zero.”;
- `FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE`: manter a mensagem segura já existente;
- autorização negada: manter o tratamento administrativo atual.

Erros recuperáveis mantêm o modal e o valor digitado. Em falha de disponibilidade, recarregar os saldos da conta antes de permitir nova tentativa.

## Segurança e testes locais

Adicionar ou ampliar testes no local natural da suíte, evitando arquivos redundantes, para comprovar:

- wrapper chama somente `financeiro_aportar_envelope` com quatro parâmetros corretos;
- valor é arredondado a centavos e validado novamente;
- `500` digitado no `CurrencyInput` representa R$ 5,00;
- intenção é reutilizada em retry e renovada após cancelamento, sucesso ou troca de envelope;
- botão aparece somente nas condições aprovadas;
- sucesso recarrega envelopes e saldos pelas RPCs, sem atualização aritmética local;
- evento `aporte_avulso` recebe rótulo amigável no extrato;
- erros estáveis recebem mensagens amigáveis;
- resgate continua sem wrapper conectado e desabilitado na UI;
- não existe `.from('financeiro_...')`, `service_role` ou mutação remota na tela.

Executar smoke test mutável somente no Supabase local com fixture descartável admin/master:

- aporte em envelope ativo reduz a disponibilidade e aumenta a reserva;
- retry da mesma intenção cria uma única transação;
- valor acima do disponível falha sem escrita parcial;
- limpar todas as fixtures no final, inclusive em falha.

Se o Supabase local estiver indisponível, não apontar a aplicação para produção. Relatar o teste de integração como bloqueado e ainda executar testes puros, lint e build.

## Design system e validação

Antes de editar, revisar `docs/design-system/DESIGN-SYSTEM.md`, especialmente campos monetários, botões, cards e modal. Reutilizar somente tokens e primitivos aprovados. Não adicionar hex, dependências, sombras em cards, gradientes novos ou `type="number"` para moeda.

Executar:

- testes financeiros e de UI relevantes;
- ESLint somente dos arquivos alterados;
- `npm run build`;
- `git diff --check`;
- HTTP 200 da rota local.

Manter o servidor Vite ativo e informar a URL para revisão visual desktop e 360 px. Não alegar inspeção visual que não tenha sido executada.

## Relatório obrigatório

Entregar `Relatório /financeiro-integrar-ui-aporte-avulso-envelopes-2d-1` com:

- arquivos alterados;
- RPC e fluxo conectados;
- comportamento de idempotência;
- atualização de saldos e extrato;
- segurança e resultado dos testes locais;
- limitações, incluindo resgate ainda indisponível;
- URL localhost para aprovação visual;
- confirmação de que nenhuma escrita remota, migration, commit ou push foi realizado.

Parar após o relatório e aguardar aprovação visual humana antes de qualquer commit.
