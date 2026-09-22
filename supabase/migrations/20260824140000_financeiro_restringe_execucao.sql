-- Correção de segurança para a Fase 1 aplicada manualmente em produção.
-- Esta migration não altera dados ou tabelas: somente normaliza EXECUTE das RPCs
-- que já existem na versão 20260824130000.
-- Pré-condição: as seis funções abaixo existem e foram auditadas no projeto alvo.

BEGIN;

-- Helpers nunca devem ser chamados pelo browser, nem por usuários autenticados.
REVOKE ALL ON FUNCTION public.financeiro_assert_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_auditar(uuid, text, text, uuid, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;

-- Remove qualquer concessão residual, inclusive grants explícitos a anon.
REVOKE ALL ON FUNCTION public.financeiro_pagar_conta(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_receber_conta(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_transferir(uuid, uuid, numeric, date, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Somente operações de negócio ficam disponíveis à sessão autenticada.
GRANT EXECUTE ON FUNCTION public.financeiro_pagar_conta(uuid, uuid, date, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_receber_conta(uuid, uuid, date, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_transferir(uuid, uuid, numeric, date, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text)
  TO authenticated;

COMMIT;
