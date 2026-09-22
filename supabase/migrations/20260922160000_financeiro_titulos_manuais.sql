BEGIN;

ALTER TABLE public.financeiro_contas_receber
  ADD COLUMN data_competencia date;

UPDATE public.financeiro_contas_receber
SET data_competencia = data_previsao
WHERE data_competencia IS NULL;

ALTER TABLE public.financeiro_contas_receber
  ALTER COLUMN data_competencia SET NOT NULL;

CREATE FUNCTION public.financeiro_criar_titulo_manual(
  p_tipo text,
  p_descricao text,
  p_valor numeric,
  p_taxa numeric,
  p_data_evento date,
  p_data_competencia date,
  p_metodo_pagamento text,
  p_categoria_id uuid,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid;
  v_descricao text;
  v_metodo text;
  v_chave text;
  v_correlation text;
  v_valor numeric(15,2);
  v_taxa numeric(15,2);
  v_payload jsonb;
  v_hash text;
  v_intencao public.financeiro_idempotencia%ROWTYPE;
  v_pagar public.financeiro_contas_pagar%ROWTYPE;
  v_receber public.financeiro_contas_receber%ROWTYPE;
  v_resposta jsonb;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_descricao := btrim(p_descricao);
  v_metodo := nullif(btrim(p_metodo_pagamento), '');
  v_chave := btrim(p_idempotency_key);
  v_correlation := nullif(btrim(p_correlation_id), '');

  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF v_descricao IS NULL OR length(v_descricao) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_DESCRICAO_INVALIDA'; END IF;
  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') OR p_valor <= 0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_data_evento IS NULL OR p_data_competencia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  IF v_chave IS NULL OR length(v_chave) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;

  v_valor := round(p_valor, 2);
  v_taxa := round(COALESCE(p_taxa, 0), 2);
  IF v_valor <= 0 OR v_taxa < 0 OR v_taxa > v_valor THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_tipo = 'pagar' AND (v_taxa <> 0 OR v_metodo IS NOT NULL) THEN RAISE EXCEPTION 'FINANCEIRO_CAMPOS_TITULO_INVALIDOS'; END IF;
  IF p_tipo = 'receber' AND (v_metodo IS NULL OR length(v_metodo) NOT BETWEEN 2 AND 50) THEN RAISE EXCEPTION 'FINANCEIRO_METODO_PAGAMENTO_INVALIDO'; END IF;

  IF p_categoria_id IS NOT NULL THEN
    PERFORM 1
    FROM public.financeiro_categorias
    WHERE id = p_categoria_id
      AND barbearia_id = v_barbearia
      AND ativa
      AND (tipo = 'ambos' OR tipo = CASE WHEN p_tipo = 'pagar' THEN 'saida' ELSE 'entrada' END);
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_INVALIDA'; END IF;
  END IF;

  v_payload := jsonb_build_object(
    'tipo', p_tipo,
    'descricao', v_descricao,
    'valor', v_valor,
    'taxa', v_taxa,
    'data_evento', p_data_evento,
    'data_competencia', p_data_competencia,
    'metodo_pagamento', v_metodo,
    'categoria_id', p_categoria_id
  );
  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':criar_titulo_manual:' || v_chave, 0));
  SELECT * INTO v_intencao
  FROM public.financeiro_idempotencia
  WHERE barbearia_id = v_barbearia
    AND operacao = 'criar_titulo_manual:' || p_tipo
    AND idempotency_key = v_chave
  FOR UPDATE;

  IF FOUND THEN
    IF v_intencao.payload_hash <> v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF;
    RETURN v_intencao.resposta || jsonb_build_object('idempotente', true);
  END IF;

  IF p_tipo = 'pagar' THEN
    INSERT INTO public.financeiro_contas_pagar(
      barbearia_id, descricao, valor, data_vencimento, data_competencia, categoria_id, origem
    ) VALUES (
      v_barbearia, v_descricao, v_valor, p_data_evento, p_data_competencia, p_categoria_id, 'manual'
    ) RETURNING * INTO v_pagar;

    v_resposta := jsonb_build_object(
      'id', v_pagar.id, 'tipo', 'pagar', 'descricao', v_pagar.descricao,
      'valor', v_pagar.valor, 'taxa', 0, 'data_evento', v_pagar.data_vencimento,
      'data_competencia', v_pagar.data_competencia, 'metodo_pagamento', NULL,
      'categoria_id', v_pagar.categoria_id, 'status', v_pagar.status,
      'origem', v_pagar.origem, 'updated_at', v_pagar.updated_at
    );
    PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar.id, NULL, to_jsonb(v_pagar), v_correlation);
  ELSE
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id, descricao, valor_bruto, taxa, data_previsao, data_competencia,
      metodo_pagamento, categoria_id, origem
    ) VALUES (
      v_barbearia, v_descricao, v_valor, v_taxa, p_data_evento, p_data_competencia,
      v_metodo, p_categoria_id, 'manual'
    ) RETURNING * INTO v_receber;

    v_resposta := jsonb_build_object(
      'id', v_receber.id, 'tipo', 'receber', 'descricao', v_receber.descricao,
      'valor', v_receber.valor_liquido, 'valor_bruto', v_receber.valor_bruto,
      'taxa', v_receber.taxa, 'data_evento', v_receber.data_previsao,
      'data_competencia', v_receber.data_competencia, 'metodo_pagamento', v_receber.metodo_pagamento,
      'categoria_id', v_receber.categoria_id, 'status', v_receber.status,
      'origem', v_receber.origem, 'updated_at', v_receber.updated_at
    );
    PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber.id, NULL, to_jsonb(v_receber), v_correlation);
  END IF;

  INSERT INTO public.financeiro_idempotencia(barbearia_id, operacao, idempotency_key, payload_hash, resposta)
  VALUES(v_barbearia, 'criar_titulo_manual:' || p_tipo, v_chave, v_hash, v_resposta);

  RETURN v_resposta || jsonb_build_object('idempotente', false);
END; $$;

CREATE FUNCTION public.financeiro_editar_titulo_manual(
  p_tipo text,
  p_titulo_id uuid,
  p_descricao text,
  p_valor numeric,
  p_taxa numeric,
  p_data_evento date,
  p_data_competencia date,
  p_metodo_pagamento text,
  p_categoria_id uuid,
  p_expected_updated_at timestamptz,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid;
  v_descricao text;
  v_metodo text;
  v_correlation text;
  v_valor numeric(15,2);
  v_taxa numeric(15,2);
  v_pagar_antes public.financeiro_contas_pagar%ROWTYPE;
  v_pagar_depois public.financeiro_contas_pagar%ROWTYPE;
  v_receber_antes public.financeiro_contas_receber%ROWTYPE;
  v_receber_depois public.financeiro_contas_receber%ROWTYPE;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_descricao := btrim(p_descricao);
  v_metodo := nullif(btrim(p_metodo_pagamento), '');
  v_correlation := nullif(btrim(p_correlation_id), '');

  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_titulo_id IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_descricao IS NULL OR length(v_descricao) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_DESCRICAO_INVALIDA'; END IF;
  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') OR p_valor <= 0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_data_evento IS NULL OR p_data_competencia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_VERSAO_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;

  v_valor := round(p_valor, 2);
  v_taxa := round(COALESCE(p_taxa, 0), 2);
  IF v_valor <= 0 OR v_taxa < 0 OR v_taxa > v_valor THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_tipo = 'pagar' AND (v_taxa <> 0 OR v_metodo IS NOT NULL) THEN RAISE EXCEPTION 'FINANCEIRO_CAMPOS_TITULO_INVALIDOS'; END IF;
  IF p_tipo = 'receber' AND (v_metodo IS NULL OR length(v_metodo) NOT BETWEEN 2 AND 50) THEN RAISE EXCEPTION 'FINANCEIRO_METODO_PAGAMENTO_INVALIDO'; END IF;

  IF p_categoria_id IS NOT NULL THEN
    PERFORM 1
    FROM public.financeiro_categorias
    WHERE id = p_categoria_id
      AND barbearia_id = v_barbearia
      AND ativa
      AND (tipo = 'ambos' OR tipo = CASE WHEN p_tipo = 'pagar' THEN 'saida' ELSE 'entrada' END);
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_INVALIDA'; END IF;
  END IF;

  IF p_tipo = 'pagar' THEN
    SELECT * INTO v_pagar_antes
    FROM public.financeiro_contas_pagar
    WHERE id = p_titulo_id AND barbearia_id = v_barbearia
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
    IF v_pagar_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
    IF v_pagar_antes.status <> 'pendente' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_EDITAVEL'; END IF;
    IF v_pagar_antes.envelope_resgate_transacao_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_COM_RESERVA'; END IF;
    IF v_pagar_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

    UPDATE public.financeiro_contas_pagar
    SET descricao = v_descricao,
        valor = v_valor,
        data_vencimento = p_data_evento,
        data_competencia = p_data_competencia,
        categoria_id = p_categoria_id,
        updated_at = clock_timestamp()
    WHERE id = v_pagar_antes.id
    RETURNING * INTO v_pagar_depois;

    PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar_depois.id, to_jsonb(v_pagar_antes), to_jsonb(v_pagar_depois), v_correlation);
    RETURN jsonb_build_object(
      'id', v_pagar_depois.id, 'tipo', 'pagar', 'descricao', v_pagar_depois.descricao,
      'valor', v_pagar_depois.valor, 'taxa', 0, 'data_evento', v_pagar_depois.data_vencimento,
      'data_competencia', v_pagar_depois.data_competencia, 'metodo_pagamento', NULL,
      'categoria_id', v_pagar_depois.categoria_id, 'status', v_pagar_depois.status,
      'origem', v_pagar_depois.origem, 'updated_at', v_pagar_depois.updated_at
    );
  END IF;

  SELECT * INTO v_receber_antes
  FROM public.financeiro_contas_receber
  WHERE id = p_titulo_id AND barbearia_id = v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_receber_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
  IF v_receber_antes.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_EDITAVEL'; END IF;
  IF v_receber_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

  UPDATE public.financeiro_contas_receber
  SET descricao = v_descricao,
      valor_bruto = v_valor,
      taxa = v_taxa,
      data_previsao = p_data_evento,
      data_competencia = p_data_competencia,
      metodo_pagamento = v_metodo,
      categoria_id = p_categoria_id,
      updated_at = clock_timestamp()
  WHERE id = v_receber_antes.id
  RETURNING * INTO v_receber_depois;

  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber_depois.id, to_jsonb(v_receber_antes), to_jsonb(v_receber_depois), v_correlation);
  RETURN jsonb_build_object(
    'id', v_receber_depois.id, 'tipo', 'receber', 'descricao', v_receber_depois.descricao,
    'valor', v_receber_depois.valor_liquido, 'valor_bruto', v_receber_depois.valor_bruto,
    'taxa', v_receber_depois.taxa, 'data_evento', v_receber_depois.data_previsao,
    'data_competencia', v_receber_depois.data_competencia, 'metodo_pagamento', v_receber_depois.metodo_pagamento,
    'categoria_id', v_receber_depois.categoria_id, 'status', v_receber_depois.status,
    'origem', v_receber_depois.origem, 'updated_at', v_receber_depois.updated_at
  );
END; $$;

CREATE FUNCTION public.financeiro_cancelar_titulo_manual(
  p_tipo text,
  p_titulo_id uuid,
  p_expected_updated_at timestamptz,
  p_motivo text,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid;
  v_motivo text;
  v_correlation text;
  v_pagar_antes public.financeiro_contas_pagar%ROWTYPE;
  v_pagar_depois public.financeiro_contas_pagar%ROWTYPE;
  v_receber_antes public.financeiro_contas_receber%ROWTYPE;
  v_receber_depois public.financeiro_contas_receber%ROWTYPE;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_motivo := btrim(p_motivo);
  v_correlation := nullif(btrim(p_correlation_id), '');

  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_titulo_id IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_VERSAO_INVALIDA'; END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_MOTIVO_INVALIDO'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;

  IF p_tipo = 'pagar' THEN
    SELECT * INTO v_pagar_antes
    FROM public.financeiro_contas_pagar
    WHERE id = p_titulo_id AND barbearia_id = v_barbearia
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
    IF v_pagar_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
    IF v_pagar_antes.status <> 'pendente' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_CANCELAVEL'; END IF;
    IF v_pagar_antes.envelope_resgate_transacao_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_COM_RESERVA'; END IF;
    IF v_pagar_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

    UPDATE public.financeiro_contas_pagar
    SET status = 'cancelado', updated_at = clock_timestamp()
    WHERE id = v_pagar_antes.id
    RETURNING * INTO v_pagar_depois;

    PERFORM public.financeiro_auditar(
      v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar_depois.id,
      to_jsonb(v_pagar_antes), to_jsonb(v_pagar_depois) || jsonb_build_object('motivo_cancelamento', v_motivo), v_correlation
    );
    RETURN jsonb_build_object('id', v_pagar_depois.id, 'tipo', 'pagar', 'status', v_pagar_depois.status, 'updated_at', v_pagar_depois.updated_at);
  END IF;

  SELECT * INTO v_receber_antes
  FROM public.financeiro_contas_receber
  WHERE id = p_titulo_id AND barbearia_id = v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_receber_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
  IF v_receber_antes.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_CANCELAVEL'; END IF;
  IF v_receber_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

  UPDATE public.financeiro_contas_receber
  SET status = 'cancelado', updated_at = clock_timestamp()
  WHERE id = v_receber_antes.id
  RETURNING * INTO v_receber_depois;

  PERFORM public.financeiro_auditar(
    v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber_depois.id,
    to_jsonb(v_receber_antes), to_jsonb(v_receber_depois) || jsonb_build_object('motivo_cancelamento', v_motivo), v_correlation
  );
  RETURN jsonb_build_object('id', v_receber_depois.id, 'tipo', 'receber', 'status', v_receber_depois.status, 'updated_at', v_receber_depois.updated_at);
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
    SELECT cp.id,'pagar'::text tipo,cp.descricao,cp.valor,cp.valor valor_bruto,0::numeric taxa,cp.status,
      cp.data_competencia,cp.data_vencimento data_evento,cp.data_liquidacao,cp.categoria_id,
      cat.nome categoria,prof.nome contraparte,cb.nome conta_bancaria,cp.origem,NULL::text metodo_pagamento,cp.updated_at,
      (cp.status='pendente') pode_liquidar,
      (cp.origem='manual' AND cp.status='pendente' AND cp.envelope_resgate_transacao_id IS NULL) pode_editar,
      (cp.origem='manual' AND cp.status='pendente' AND cp.envelope_resgate_transacao_id IS NULL) pode_cancelar,
      (cp.envelope_resgate_transacao_id IS NOT NULL) possui_reserva
    FROM public.financeiro_contas_pagar cp
    LEFT JOIN public.financeiro_categorias cat ON cat.id=cp.categoria_id AND cat.barbearia_id=v_barbearia
    LEFT JOIN public.profissionais prof ON prof.id=cp.profissional_id AND prof.barbearia_id=v_barbearia
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id=cp.conta_bancaria_id AND cb.barbearia_id=v_barbearia
    WHERE p_tipo='pagar' AND cp.barbearia_id=v_barbearia AND cp.data_vencimento BETWEEN p_data_inicio AND p_data_fim AND (p_status IS NULL OR cp.status=p_status)
    UNION ALL
    SELECT cr.id,'receber',cr.descricao,cr.valor_liquido,cr.valor_bruto,cr.taxa,cr.status,
      cr.data_competencia,cr.data_previsao,cr.data_liquidacao,cr.categoria_id,
      cat.nome,cli.nome,cb.nome,cr.origem,cr.metodo_pagamento,cr.updated_at,
      (cr.status='previsto'),(cr.origem='manual' AND cr.status='previsto'),
      (cr.origem='manual' AND cr.status='previsto'),false
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

CREATE OR REPLACE FUNCTION public.financeiro_receber_conta(
  p_conta_receber_id uuid, p_conta_bancaria_id uuid, p_data date,
  p_idempotency_key text, p_correlation_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
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
  VALUES (v_barbearia, p_conta_bancaria_id, 'entrada', v_titulo.valor_bruto, v_titulo.data_competencia, p_data, v_titulo.categoria_id, 'conta_receber', p_idempotency_key, v_titulo.id, v_titulo.descricao) RETURNING id INTO v_entrada;
  IF v_titulo.taxa > 0 THEN
    INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, idempotency_key, conta_receber_id, descricao)
    VALUES (v_barbearia, p_conta_bancaria_id, 'saida', v_titulo.taxa, v_titulo.data_competencia, p_data, 'taxa_cartao', p_idempotency_key || ':taxa', v_titulo.id, 'Taxa financeira: ' || v_titulo.descricao) RETURNING id INTO v_taxa;
  END IF;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_titulo.id, to_jsonb(v_titulo), jsonb_build_object('status','liquidado','movimentacao_id',v_entrada,'taxa_movimentacao_id',v_taxa), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'movimentacao_id', v_entrada, 'taxa_movimentacao_id', v_taxa);
END; $$;

REVOKE ALL ON FUNCTION public.financeiro_criar_titulo_manual(text,text,numeric,numeric,date,date,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_editar_titulo_manual(text,uuid,text,numeric,numeric,date,date,text,uuid,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_cancelar_titulo_manual(text,uuid,timestamptz,text,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.financeiro_criar_titulo_manual(text,text,numeric,numeric,date,date,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_editar_titulo_manual(text,uuid,text,numeric,numeric,date,date,text,uuid,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_cancelar_titulo_manual(text,uuid,timestamptz,text,text) TO authenticated;

COMMIT;
