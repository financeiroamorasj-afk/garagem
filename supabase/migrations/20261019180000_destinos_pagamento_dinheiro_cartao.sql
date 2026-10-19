BEGIN;

CREATE OR REPLACE FUNCTION public.financeiro_resolver_conta_recebimento(
  p_barbearia_id uuid,
  p_forma_pagamento text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_conta_id uuid;
BEGIN
  IF p_forma_pagamento = 'dinheiro' THEN
    SELECT id INTO v_conta_id
    FROM public.financeiro_contas_bancarias
    WHERE barbearia_id=p_barbearia_id AND ativa AND tipo='caixa'
    ORDER BY conta_principal DESC,created_at,id
    LIMIT 1;
  ELSIF p_forma_pagamento IN ('debito','credito') THEN
    SELECT id INTO v_conta_id
    FROM public.financeiro_contas_bancarias
    WHERE barbearia_id=p_barbearia_id AND ativa AND tipo='cartao'
    ORDER BY conta_principal DESC,created_at,id
    LIMIT 1;
  ELSE
    SELECT id INTO v_conta_id
    FROM public.financeiro_contas_bancarias
    WHERE barbearia_id=p_barbearia_id AND ativa
    ORDER BY conta_principal DESC,created_at,id
    LIMIT 1;
  END IF;

  IF v_conta_id IS NULL AND p_forma_pagamento = 'dinheiro' THEN
    RAISE EXCEPTION 'FINANCEIRO_CONTA_CAIXA_NAO_CONFIGURADA';
  ELSIF v_conta_id IS NULL AND p_forma_pagamento IN ('debito','credito') THEN
    RAISE EXCEPTION 'FINANCEIRO_CONTA_CARTAO_NAO_CONFIGURADA';
  ELSIF v_conta_id IS NULL THEN
    RAISE EXCEPTION 'FINANCEIRO_CONTA_PRINCIPAL_NAO_CONFIGURADA';
  END IF;

  RETURN v_conta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.financeiro_direcionar_recebimento_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
BEGIN
  IF (NEW.fechamento_id IS NOT NULL OR NEW.venda_balcao_id IS NOT NULL)
     AND NEW.origem IN ('servico','produto') THEN
    NEW.conta_destino_id := public.financeiro_resolver_conta_recebimento(
      NEW.barbearia_id,
      NEW.metodo_pagamento
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financeiro_direcionar_recebimento_checkout_trigger
  ON public.financeiro_contas_receber;
CREATE TRIGGER financeiro_direcionar_recebimento_checkout_trigger
BEFORE INSERT OR UPDATE OF metodo_pagamento,conta_destino_id
ON public.financeiro_contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.financeiro_direcionar_recebimento_checkout();

CREATE OR REPLACE FUNCTION public.financeiro_direcionar_movimento_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_conta_id uuid;
BEGIN
  IF NEW.conta_receber_id IS NOT NULL
     AND (NEW.fechamento_id IS NOT NULL OR NEW.venda_balcao_id IS NOT NULL)
     AND NEW.origem IN ('checkout','taxa_checkout','venda_balcao') THEN
    SELECT conta_destino_id INTO v_conta_id
    FROM public.financeiro_contas_receber
    WHERE id=NEW.conta_receber_id AND barbearia_id=NEW.barbearia_id;
    IF v_conta_id IS NULL THEN
      RAISE EXCEPTION 'FINANCEIRO_DESTINO_RECEBIMENTO_INVALIDO';
    END IF;
    NEW.conta_bancaria_id := v_conta_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financeiro_direcionar_movimento_checkout_trigger
  ON public.financeiro_movimentacoes;
CREATE TRIGGER financeiro_direcionar_movimento_checkout_trigger
BEFORE INSERT OR UPDATE OF conta_bancaria_id
ON public.financeiro_movimentacoes
FOR EACH ROW
EXECUTE FUNCTION public.financeiro_direcionar_movimento_checkout();

CREATE OR REPLACE FUNCTION public.financeiro_destinos_recebimento()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia_id uuid:=public.get_my_barbearia_id();
  v_principal record;
  v_caixa record;
  v_cartao record;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia_id IS NULL THEN
    RAISE EXCEPTION 'FINANCEIRO_NAO_AUTORIZADO';
  END IF;

  SELECT id,nome INTO v_principal
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia_id AND ativa
  ORDER BY conta_principal DESC,created_at,id
  LIMIT 1;

  SELECT id,nome INTO v_caixa
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia_id AND ativa AND tipo='caixa'
  ORDER BY conta_principal DESC,created_at,id
  LIMIT 1;

  SELECT id,nome INTO v_cartao
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia_id AND ativa AND tipo='cartao'
  ORDER BY conta_principal DESC,created_at,id
  LIMIT 1;

  RETURN jsonb_build_object(
    'pix',jsonb_build_object('configurado',v_principal.id IS NOT NULL,'conta_nome',v_principal.nome),
    'outro',jsonb_build_object('configurado',v_principal.id IS NOT NULL,'conta_nome',v_principal.nome),
    'dinheiro',jsonb_build_object('configurado',v_caixa.id IS NOT NULL,'conta_nome',v_caixa.nome),
    'debito',jsonb_build_object('configurado',v_cartao.id IS NOT NULL,'conta_nome',v_cartao.nome),
    'credito',jsonb_build_object('configurado',v_cartao.id IS NOT NULL,'conta_nome',v_cartao.nome)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_resolver_conta_recebimento(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.financeiro_direcionar_recebimento_checkout() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.financeiro_direcionar_movimento_checkout() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.financeiro_destinos_recebimento() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_destinos_recebimento() TO authenticated;

COMMENT ON FUNCTION public.financeiro_destinos_recebimento() IS
  'Informa ao operador se a conta principal, o caixa de dinheiro e a conta de recebimentos da maquininha estao configurados.';

COMMIT;
