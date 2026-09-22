-- A entrada registra o bruto e a taxa a saída: saldo líquido = bruto - taxa.
-- Registrar a entrada já líquida e também a taxa como saída reduziria o caixa duas vezes.
CREATE OR REPLACE FUNCTION public.financeiro_receber_conta(p_conta_receber_id uuid, p_conta_bancaria_id uuid, p_data date, p_idempotency_key text, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_titulo public.financeiro_contas_receber%ROWTYPE; v_entrada uuid; v_taxa uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  SELECT * INTO v_titulo FROM public.financeiro_contas_receber WHERE id = p_conta_receber_id AND barbearia_id = v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_RECEBIVEL_NAO_ENCONTRADO'; END IF;
  IF v_titulo.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_RECEBIVEL_NAO_PREVISTO'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE id = p_conta_bancaria_id AND barbearia_id = v_barbearia AND ativa;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  SELECT id INTO v_entrada FROM public.financeiro_movimentacoes WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF v_entrada IS NOT NULL THEN RETURN jsonb_build_object('idempotente', true, 'movimentacao_id', v_entrada); END IF;
  UPDATE public.financeiro_contas_receber SET status = 'liquidado', data_liquidacao = p_data, conta_destino_id = p_conta_bancaria_id, updated_at = now() WHERE id = v_titulo.id;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, categoria_id, origem, idempotency_key, conta_receber_id, descricao)
  VALUES (v_barbearia, p_conta_bancaria_id, 'entrada', v_titulo.valor_bruto, v_titulo.data_previsao, p_data, v_titulo.categoria_id, 'conta_receber', p_idempotency_key, v_titulo.id, v_titulo.descricao) RETURNING id INTO v_entrada;
  IF v_titulo.taxa > 0 THEN
    INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, idempotency_key, conta_receber_id, descricao)
    VALUES (v_barbearia, p_conta_bancaria_id, 'saida', v_titulo.taxa, v_titulo.data_previsao, p_data, 'taxa_cartao', p_idempotency_key || ':taxa', v_titulo.id, 'Taxa financeira: ' || v_titulo.descricao) RETURNING id INTO v_taxa;
  END IF;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_titulo.id, to_jsonb(v_titulo), jsonb_build_object('status','liquidado','movimentacao_id',v_entrada,'taxa_movimentacao_id',v_taxa), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'movimentacao_id', v_entrada, 'taxa_movimentacao_id', v_taxa);
END; $$;
