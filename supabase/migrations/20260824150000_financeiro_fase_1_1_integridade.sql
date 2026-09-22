BEGIN;

-- Chaves candidatas compostas permitem que as FKs validem tambem o tenant.
ALTER TABLE public.financeiro_categorias ADD CONSTRAINT financeiro_categorias_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_contas_bancarias ADD CONSTRAINT financeiro_contas_bancarias_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_contas_pagar ADD CONSTRAINT financeiro_contas_pagar_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_contas_receber ADD CONSTRAINT financeiro_contas_receber_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_movimentacoes ADD CONSTRAINT financeiro_movimentacoes_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_creditos_clientes ADD CONSTRAINT financeiro_creditos_clientes_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_creditos_movimentacoes ADD CONSTRAINT financeiro_creditos_movimentacoes_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_audit_log ADD CONSTRAINT financeiro_audit_log_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.clientes ADD CONSTRAINT clientes_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.profissionais ADD CONSTRAINT profissionais_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.vendas_produtos ADD CONSTRAINT vendas_produtos_barbearia_id_id_key UNIQUE (barbearia_id, id);

ALTER TABLE public.financeiro_contas_pagar
  ADD CONSTRAINT financeiro_cp_categoria_tenant_fkey FOREIGN KEY (barbearia_id, categoria_id) REFERENCES public.financeiro_categorias (barbearia_id, id),
  ADD CONSTRAINT financeiro_cp_conta_tenant_fkey FOREIGN KEY (barbearia_id, conta_bancaria_id) REFERENCES public.financeiro_contas_bancarias (barbearia_id, id),
  ADD CONSTRAINT financeiro_cp_profissional_tenant_fkey FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais (barbearia_id, id),
  ADD CONSTRAINT financeiro_cp_agendamento_tenant_fkey FOREIGN KEY (barbearia_id, agendamento_id) REFERENCES public.agendamentos (barbearia_id, id),
  ADD CONSTRAINT financeiro_cp_venda_produto_tenant_fkey FOREIGN KEY (barbearia_id, venda_produto_id) REFERENCES public.vendas_produtos (barbearia_id, id);

ALTER TABLE public.financeiro_contas_receber
  ADD CONSTRAINT financeiro_cr_categoria_tenant_fkey FOREIGN KEY (barbearia_id, categoria_id) REFERENCES public.financeiro_categorias (barbearia_id, id),
  ADD CONSTRAINT financeiro_cr_conta_tenant_fkey FOREIGN KEY (barbearia_id, conta_destino_id) REFERENCES public.financeiro_contas_bancarias (barbearia_id, id),
  ADD CONSTRAINT financeiro_cr_cliente_tenant_fkey FOREIGN KEY (barbearia_id, cliente_id) REFERENCES public.clientes (barbearia_id, id),
  ADD CONSTRAINT financeiro_cr_agendamento_tenant_fkey FOREIGN KEY (barbearia_id, agendamento_id) REFERENCES public.agendamentos (barbearia_id, id),
  ADD CONSTRAINT financeiro_cr_venda_produto_tenant_fkey FOREIGN KEY (barbearia_id, venda_produto_id) REFERENCES public.vendas_produtos (barbearia_id, id);

ALTER TABLE public.financeiro_movimentacoes
  ADD CONSTRAINT financeiro_mov_conta_tenant_fkey FOREIGN KEY (barbearia_id, conta_bancaria_id) REFERENCES public.financeiro_contas_bancarias (barbearia_id, id),
  ADD CONSTRAINT financeiro_mov_categoria_tenant_fkey FOREIGN KEY (barbearia_id, categoria_id) REFERENCES public.financeiro_categorias (barbearia_id, id),
  ADD CONSTRAINT financeiro_mov_cp_tenant_fkey FOREIGN KEY (barbearia_id, conta_pagar_id) REFERENCES public.financeiro_contas_pagar (barbearia_id, id),
  ADD CONSTRAINT financeiro_mov_cr_tenant_fkey FOREIGN KEY (barbearia_id, conta_receber_id) REFERENCES public.financeiro_contas_receber (barbearia_id, id),
  ADD CONSTRAINT financeiro_mov_agendamento_tenant_fkey FOREIGN KEY (barbearia_id, agendamento_id) REFERENCES public.agendamentos (barbearia_id, id),
  ADD CONSTRAINT financeiro_mov_venda_produto_tenant_fkey FOREIGN KEY (barbearia_id, venda_produto_id) REFERENCES public.vendas_produtos (barbearia_id, id);

ALTER TABLE public.financeiro_creditos_clientes
  ADD CONSTRAINT financeiro_creditos_cliente_tenant_fkey FOREIGN KEY (barbearia_id, cliente_id) REFERENCES public.clientes (barbearia_id, id);

ALTER TABLE public.financeiro_creditos_movimentacoes
  ADD CONSTRAINT financeiro_credito_mov_saldo_tenant_fkey FOREIGN KEY (barbearia_id, credito_cliente_id) REFERENCES public.financeiro_creditos_clientes (barbearia_id, id),
  ADD CONSTRAINT financeiro_credito_mov_agendamento_tenant_fkey FOREIGN KEY (barbearia_id, agendamento_id) REFERENCES public.agendamentos (barbearia_id, id),
  ADD CONSTRAINT financeiro_credito_mov_venda_tenant_fkey FOREIGN KEY (barbearia_id, venda_produto_id) REFERENCES public.vendas_produtos (barbearia_id, id),
  ADD COLUMN idempotency_key text;

CREATE UNIQUE INDEX financeiro_credito_mov_idempotency_unico
  ON public.financeiro_creditos_movimentacoes (barbearia_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

REVOKE ALL PRIVILEGES ON TABLE
  public.financeiro_categorias,
  public.financeiro_contas_bancarias,
  public.financeiro_contas_pagar,
  public.financeiro_contas_receber,
  public.financeiro_movimentacoes,
  public.financeiro_creditos_clientes,
  public.financeiro_creditos_movimentacoes,
  public.financeiro_audit_log
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text);

CREATE FUNCTION public.financeiro_credito_movimentar(
  p_cliente_id uuid, p_motivo text, p_valor numeric, p_origem text,
  p_idempotency_key text, p_referencia_externa text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid;
  v_credito public.financeiro_creditos_clientes%ROWTYPE;
  v_existente public.financeiro_creditos_movimentacoes%ROWTYPE;
  v_antes numeric;
  v_depois numeric;
  v_id uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_valor <= 0 OR p_motivo NOT IN ('emissao','uso','estorno','ajuste','expiracao') THEN
    RAISE EXCEPTION 'FINANCEIRO_CREDITO_INVALIDO';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':' || p_idempotency_key, 0));
  SELECT * INTO v_existente FROM public.financeiro_creditos_movimentacoes
   WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('movimentacao_id', v_existente.id, 'saldo_antes', v_existente.saldo_antes, 'saldo_depois', v_existente.saldo_depois);
  END IF;

  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id AND barbearia_id = v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CLIENTE_INVALIDO'; END IF;
  INSERT INTO public.financeiro_creditos_clientes (barbearia_id, cliente_id)
    VALUES (v_barbearia, p_cliente_id) ON CONFLICT (barbearia_id, cliente_id) DO NOTHING;
  SELECT * INTO v_credito FROM public.financeiro_creditos_clientes
   WHERE barbearia_id = v_barbearia AND cliente_id = p_cliente_id FOR UPDATE;
  v_antes := v_credito.saldo;
  v_depois := CASE WHEN p_motivo IN ('uso','expiracao') THEN v_antes - p_valor ELSE v_antes + p_valor END;
  IF v_depois < 0 THEN RAISE EXCEPTION 'FINANCEIRO_SALDO_INSUFICIENTE'; END IF;

  UPDATE public.financeiro_creditos_clientes SET saldo = v_depois, updated_at = now() WHERE id = v_credito.id;
  INSERT INTO public.financeiro_creditos_movimentacoes
    (barbearia_id, credito_cliente_id, motivo, valor, saldo_antes, saldo_depois, origem, referencia_externa, idempotency_key)
  VALUES
    (v_barbearia, v_credito.id, p_motivo, p_valor, v_antes, v_depois, p_origem, p_referencia_externa, p_idempotency_key)
  RETURNING id INTO v_id;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_creditos_clientes', v_credito.id,
    jsonb_build_object('saldo',v_antes),
    jsonb_build_object('saldo',v_depois,'movimentacao_id',v_id,'idempotency_key',p_idempotency_key), p_correlation_id);
  RETURN jsonb_build_object('movimentacao_id', v_id, 'saldo_antes', v_antes, 'saldo_depois', v_depois);
END; $$;

CREATE FUNCTION public.financeiro_listar_categorias()
RETURNS TABLE (id uuid, nome text, tipo text, grupo_dre text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT c.id, c.nome, c.tipo, c.grupo_dre
  FROM public.financeiro_categorias c
  WHERE c.barbearia_id = public.financeiro_assert_admin() AND c.ativa
  ORDER BY c.nome, c.id;
$$;

CREATE FUNCTION public.financeiro_listar_contas_bancarias()
RETURNS TABLE (id uuid, nome text, instituicao text, tipo text, saldo_inicial numeric, conta_principal boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT c.id, c.nome, c.instituicao, c.tipo, c.saldo_inicial, c.conta_principal
  FROM public.financeiro_contas_bancarias c
  WHERE c.barbearia_id = public.financeiro_assert_admin() AND c.ativa
  ORDER BY c.conta_principal DESC, c.nome, c.id;
$$;

REVOKE ALL ON FUNCTION public.financeiro_assert_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_auditar(uuid, text, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_pagar_conta(uuid, uuid, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_receber_conta(uuid, uuid, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_transferir(uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_listar_categorias() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_listar_contas_bancarias() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.financeiro_pagar_conta(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_receber_conta(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_transferir(uuid, uuid, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_categorias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_contas_bancarias() TO authenticated;

COMMIT;
