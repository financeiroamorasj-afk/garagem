-- Congela as tabelas financeiras legadas herdadas do modelo tenant_id.
-- O MVP opera exclusivamente no modelo novo com barbearia_id.
-- Não remove dados nem altera o schema: apenas fecha o acesso pela API.

BEGIN;

REVOKE ALL ON TABLE
  public.vendas,
  public.contas_receber,
  public.movimentacoes_financeiras
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_financeiras ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.vendas IS
  'LEGACY CONGELADA: modelo tenant_id herdado. O MVP usa atendimento_fechamentos e vendas_produtos.';

COMMENT ON TABLE public.contas_receber IS
  'LEGACY CONGELADA: modelo tenant_id herdado. O MVP usa financeiro_contas_receber.';

COMMENT ON TABLE public.movimentacoes_financeiras IS
  'LEGACY CONGELADA: modelo tenant_id herdado. O MVP usa financeiro_movimentacoes.';

COMMIT;
