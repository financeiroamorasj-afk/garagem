BEGIN;

CREATE OR REPLACE FUNCTION public.financeiro_transferir(
  p_origem_id uuid, p_destino_id uuid, p_valor numeric, p_data date,
  p_idempotency_key text, p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_transferencia uuid := extensions.uuid_generate_v4(); v_saida uuid; v_entrada uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_valor IS NULL OR p_valor <= 0 OR p_data IS NULL OR p_origem_id = p_destino_id THEN RAISE EXCEPTION 'FINANCEIRO_TRANSFERENCIA_INVALIDA'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 OR length(p_idempotency_key) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE id IN (p_origem_id, p_destino_id) AND barbearia_id = v_barbearia AND ativa GROUP BY barbearia_id HAVING count(*) = 2;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':' || p_idempotency_key, 0));
  SELECT id INTO v_saida FROM public.financeiro_movimentacoes WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF v_saida IS NOT NULL THEN RETURN jsonb_build_object('idempotente', true, 'movimentacao_id', v_saida); END IF;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, transferencia_id, idempotency_key, descricao)
  VALUES (v_barbearia, p_origem_id, 'saida', p_valor, p_data, p_data, 'transferencia', v_transferencia, p_idempotency_key, 'Transferência entre contas') RETURNING id INTO v_saida;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, transferencia_id, idempotency_key, descricao)
  VALUES (v_barbearia, p_destino_id, 'entrada', p_valor, p_data, p_data, 'transferencia', v_transferencia, p_idempotency_key || ':entrada', 'Transferência entre contas') RETURNING id INTO v_entrada;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_movimentacoes', v_saida, NULL, jsonb_build_object('transferencia_id',v_transferencia,'entrada_id',v_entrada), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'transferencia_id', v_transferencia, 'saida_id', v_saida, 'entrada_id', v_entrada);
END; $$;

CREATE OR REPLACE FUNCTION public.financeiro_resumo_periodo(p_data_inicio date, p_data_fim date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_resultado jsonb;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio > p_data_fim OR (p_data_fim - p_data_inicio) > 365 THEN
    RAISE EXCEPTION 'FINANCEIRO_PERIODO_INVALIDO';
  END IF;

  WITH movimentos_periodo AS (
    SELECT m.* FROM public.financeiro_movimentacoes m
    WHERE m.barbearia_id = v_barbearia AND m.status = 'efetivado'
      AND m.data_liquidacao BETWEEN p_data_inicio AND p_data_fim AND m.origem <> 'transferencia'
  ), dias AS (
    SELECT d::date AS data FROM generate_series(p_data_inicio, p_data_fim, interval '1 day') d
  ), contas AS (
    SELECT c.id, c.nome, c.saldo_inicial,
      COALESCE(sum(m.valor) FILTER (WHERE m.direcao='entrada' AND m.data_liquidacao BETWEEN p_data_inicio AND p_data_fim),0) AS entradas,
      COALESCE(sum(m.valor) FILTER (WHERE m.direcao='saida' AND m.data_liquidacao BETWEEN p_data_inicio AND p_data_fim),0) AS saidas,
      c.saldo_inicial + COALESCE(sum(CASE WHEN m.direcao='entrada' THEN m.valor ELSE -m.valor END) FILTER (WHERE m.data_liquidacao <= p_data_fim),0) AS saldo_atual
    FROM public.financeiro_contas_bancarias c
    LEFT JOIN public.financeiro_movimentacoes m ON m.conta_bancaria_id=c.id AND m.barbearia_id=v_barbearia AND m.status='efetivado'
    WHERE c.barbearia_id=v_barbearia AND c.ativa
    GROUP BY c.id, c.nome, c.saldo_inicial
  ), serie AS (
    SELECT d.data,
      COALESCE(sum(m.valor) FILTER (WHERE m.direcao='entrada'),0) AS entradas,
      COALESCE(sum(m.valor) FILTER (WHERE m.direcao='saida'),0) AS saidas
    FROM dias d LEFT JOIN movimentos_periodo m ON m.data_liquidacao=d.data GROUP BY d.data ORDER BY d.data
  ), vencimentos AS (
    SELECT 'pagar'::text tipo, id, descricao, data_vencimento data, valor
    FROM public.financeiro_contas_pagar WHERE barbearia_id=v_barbearia AND status='pendente' AND data_vencimento BETWEEN current_date AND current_date+30
    UNION ALL
    SELECT 'receber', id, descricao, data_previsao, valor_liquido
    FROM public.financeiro_contas_receber WHERE barbearia_id=v_barbearia AND status='previsto' AND data_previsao BETWEEN current_date AND current_date+30
  ), proximos AS (SELECT * FROM vencimentos ORDER BY data, tipo, id LIMIT 10)
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_data_inicio,'fim',p_data_fim),
    'totais', jsonb_build_object(
      'entradas',COALESCE((SELECT sum(valor) FROM movimentos_periodo WHERE direcao='entrada'),0),
      'saidas',COALESCE((SELECT sum(valor) FROM movimentos_periodo WHERE direcao='saida'),0),
      'resultado',COALESCE((SELECT sum(CASE WHEN direcao='entrada' THEN valor ELSE -valor END) FROM movimentos_periodo),0)),
    'contas',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.nome,c.id) FROM contas c),'[]'::jsonb),
    'serie',COALESCE((SELECT jsonb_agg(jsonb_build_object('data',s.data,'entradas',s.entradas,'saidas',s.saidas,'resultado',s.entradas-s.saidas) ORDER BY s.data) FROM serie s),'[]'::jsonb),
    'proximos_vencimentos',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.data,p.tipo,p.id) FROM proximos p),'[]'::jsonb)
  ) INTO v_resultado;
  RETURN v_resultado;
END; $$;

CREATE OR REPLACE FUNCTION public.financeiro_listar_titulos(
  p_tipo text, p_data_inicio date, p_data_fim date, p_status text DEFAULT NULL,
  p_ordenar_por text DEFAULT 'data', p_direcao text DEFAULT 'asc',
  p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_total bigint; v_items jsonb;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar','receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio > p_data_fim OR (p_data_fim-p_data_inicio)>365 THEN RAISE EXCEPTION 'FINANCEIRO_PERIODO_INVALIDO'; END IF;
  IF (p_tipo='pagar' AND p_status IS NOT NULL AND p_status NOT IN ('pendente','pago','estornado','cancelado')) OR
     (p_tipo='receber' AND p_status IS NOT NULL AND p_status NOT IN ('previsto','liquidado','estornado','cancelado')) THEN RAISE EXCEPTION 'FINANCEIRO_STATUS_INVALIDO'; END IF;
  IF p_ordenar_por IS NULL OR p_direcao IS NULL OR p_ordenar_por NOT IN ('data','descricao','valor','status') OR p_direcao NOT IN ('asc','desc') THEN RAISE EXCEPTION 'FINANCEIRO_ORDENACAO_INVALIDA'; END IF;
  IF p_pagina IS NULL OR p_pagina<1 OR p_por_pagina IS NULL OR p_por_pagina<1 OR p_por_pagina>100 THEN RAISE EXCEPTION 'FINANCEIRO_PAGINACAO_INVALIDA'; END IF;

  WITH titulos AS (
    SELECT cp.id,'pagar'::text tipo,cp.descricao,cp.valor,cp.status,cp.data_competencia,cp.data_vencimento data_evento,cp.data_liquidacao,
      cat.nome categoria,prof.nome contraparte,cb.nome conta_bancaria,(cp.status='pendente') pode_liquidar
    FROM public.financeiro_contas_pagar cp
    LEFT JOIN public.financeiro_categorias cat ON cat.id=cp.categoria_id AND cat.barbearia_id=v_barbearia
    LEFT JOIN public.profissionais prof ON prof.id=cp.profissional_id AND prof.barbearia_id=v_barbearia
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id=cp.conta_bancaria_id AND cb.barbearia_id=v_barbearia
    WHERE p_tipo='pagar' AND cp.barbearia_id=v_barbearia AND cp.data_vencimento BETWEEN p_data_inicio AND p_data_fim AND (p_status IS NULL OR cp.status=p_status)
    UNION ALL
    SELECT cr.id,'receber',cr.descricao,cr.valor_liquido,cr.status,cr.data_previsao,cr.data_previsao,cr.data_liquidacao,
      cat.nome,cli.nome,cb.nome,(cr.status='previsto')
    FROM public.financeiro_contas_receber cr
    LEFT JOIN public.financeiro_categorias cat ON cat.id=cr.categoria_id AND cat.barbearia_id=v_barbearia
    LEFT JOIN public.clientes cli ON cli.id=cr.cliente_id AND cli.barbearia_id=v_barbearia
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id=cr.conta_destino_id AND cb.barbearia_id=v_barbearia
    WHERE p_tipo='receber' AND cr.barbearia_id=v_barbearia AND cr.data_previsao BETWEEN p_data_inicio AND p_data_fim AND (p_status IS NULL OR cr.status=p_status)
  ), ordenados AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_direcao='asc' AND p_ordenar_por='data' THEN data_evento END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='data' THEN data_evento END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='descricao' THEN descricao END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='descricao' THEN descricao END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='valor' THEN valor END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='valor' THEN valor END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='status' THEN status END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='status' THEN status END DESC, id
    ) AS ordem FROM titulos
  ), pagina AS (SELECT * FROM ordenados ORDER BY ordem OFFSET (p_pagina-1)*p_por_pagina LIMIT p_por_pagina)
  SELECT (SELECT count(*) FROM titulos), COALESCE((SELECT jsonb_agg(to_jsonb(p)-'ordem' ORDER BY p.ordem) FROM pagina p),'[]'::jsonb) INTO v_total,v_items;
  RETURN jsonb_build_object('items',v_items,'pagina',p_pagina,'por_pagina',p_por_pagina,'total_itens',v_total,'total_paginas',CASE WHEN v_total=0 THEN 0 ELSE ceil(v_total::numeric/p_por_pagina)::integer END);
END; $$;

REVOKE ALL ON FUNCTION public.financeiro_transferir(uuid,uuid,numeric,date,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_resumo_periodo(date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_listar_titulos(text,date,date,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_pagar_conta(uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_receber_conta(uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_transferir(uuid,uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_credito_movimentar(uuid,text,numeric,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_categorias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_contas_bancarias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_resumo_periodo(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_titulos(text,date,date,text,text,text,integer,integer) TO authenticated;

COMMIT;
