BEGIN;

ALTER TABLE public.financeiro_contas_pagar
  ADD COLUMN grupo_id uuid,
  ADD COLUMN modalidade text NOT NULL DEFAULT 'unico'
    CHECK (modalidade IN ('unico', 'parcelado', 'recorrente')),
  ADD COLUMN numero_repeticao integer,
  ADD COLUMN total_repeticoes integer,
  ADD CONSTRAINT financeiro_cp_repeticao_check CHECK (
    (modalidade = 'unico' AND grupo_id IS NULL AND numero_repeticao IS NULL AND total_repeticoes IS NULL)
    OR
    (modalidade IN ('parcelado', 'recorrente') AND grupo_id IS NOT NULL
      AND numero_repeticao BETWEEN 1 AND 60
      AND total_repeticoes BETWEEN 2 AND 60
      AND numero_repeticao <= total_repeticoes)
  );

ALTER TABLE public.financeiro_contas_receber
  ADD COLUMN grupo_id uuid,
  ADD COLUMN modalidade text NOT NULL DEFAULT 'unico'
    CHECK (modalidade IN ('unico', 'parcelado', 'recorrente')),
  ADD COLUMN numero_repeticao integer,
  ADD COLUMN total_repeticoes integer,
  ADD CONSTRAINT financeiro_cr_repeticao_check CHECK (
    (modalidade = 'unico' AND grupo_id IS NULL AND numero_repeticao IS NULL AND total_repeticoes IS NULL)
    OR
    (modalidade IN ('parcelado', 'recorrente') AND grupo_id IS NOT NULL
      AND numero_repeticao BETWEEN 1 AND 60
      AND total_repeticoes BETWEEN 2 AND 60
      AND numero_repeticao <= total_repeticoes)
  );

CREATE UNIQUE INDEX financeiro_cp_grupo_numero_idx
  ON public.financeiro_contas_pagar(barbearia_id, grupo_id, numero_repeticao)
  WHERE grupo_id IS NOT NULL;

CREATE UNIQUE INDEX financeiro_cr_grupo_numero_idx
  ON public.financeiro_contas_receber(barbearia_id, grupo_id, numero_repeticao)
  WHERE grupo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.financeiro_data_mensal(p_data date, p_meses integer)
RETURNS date
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT (
    date_trunc('month', p_data::timestamp)
    + make_interval(months => p_meses)
    + make_interval(days => LEAST(
        extract(day FROM p_data)::integer,
        extract(day FROM (date_trunc('month', p_data::timestamp) + make_interval(months => p_meses + 1) - interval '1 day'))::integer
      ) - 1)
  )::date;
$$;

CREATE OR REPLACE FUNCTION public.financeiro_criar_titulos_em_lote(
  p_tipo text,
  p_modalidade text,
  p_descricao text,
  p_valor numeric,
  p_taxa numeric,
  p_data_evento date,
  p_data_competencia date,
  p_metodo_pagamento text,
  p_categoria_id uuid,
  p_quantidade integer,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid := public.financeiro_assert_admin();
  v_grupo uuid := extensions.uuid_generate_v4();
  v_descricao text := btrim(p_descricao);
  v_metodo text := nullif(btrim(p_metodo_pagamento), '');
  v_chave text := btrim(p_idempotency_key);
  v_correlation text := nullif(btrim(p_correlation_id), '');
  v_valor numeric(15,2) := round(p_valor, 2);
  v_taxa numeric(15,2) := round(COALESCE(p_taxa, 0), 2);
  v_valor_centavos bigint;
  v_taxa_centavos bigint;
  v_valor_item numeric(15,2);
  v_taxa_item numeric(15,2);
  v_data_evento date;
  v_data_competencia date;
  v_payload jsonb;
  v_hash text;
  v_intencao public.financeiro_idempotencia%ROWTYPE;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_pagar public.financeiro_contas_pagar%ROWTYPE;
  v_receber public.financeiro_contas_receber%ROWTYPE;
  v_resposta jsonb;
  i integer;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_modalidade IS NULL OR p_modalidade NOT IN ('parcelado', 'recorrente') THEN RAISE EXCEPTION 'FINANCEIRO_MODALIDADE_INVALIDA'; END IF;
  IF p_quantidade IS NULL OR p_quantidade NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'FINANCEIRO_QUANTIDADE_INVALIDA'; END IF;
  IF v_descricao IS NULL OR length(v_descricao) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_DESCRICAO_INVALIDA'; END IF;
  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') OR v_valor <= 0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_data_evento IS NULL OR p_data_competencia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  IF v_chave IS NULL OR length(v_chave) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  IF v_taxa < 0 OR v_taxa > v_valor THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_tipo = 'pagar' AND (v_taxa <> 0 OR v_metodo IS NOT NULL) THEN RAISE EXCEPTION 'FINANCEIRO_CAMPOS_TITULO_INVALIDOS'; END IF;
  IF p_tipo = 'receber' AND (v_metodo IS NULL OR length(v_metodo) NOT BETWEEN 2 AND 50) THEN RAISE EXCEPTION 'FINANCEIRO_METODO_PAGAMENTO_INVALIDO'; END IF;

  IF p_categoria_id IS NOT NULL THEN
    PERFORM 1 FROM public.financeiro_categorias
    WHERE id = p_categoria_id AND barbearia_id = v_barbearia AND ativa
      AND (tipo = 'ambos' OR tipo = CASE WHEN p_tipo = 'pagar' THEN 'saida' ELSE 'entrada' END);
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_INVALIDA'; END IF;
  END IF;

  v_valor_centavos := round(v_valor * 100)::bigint;
  v_taxa_centavos := round(v_taxa * 100)::bigint;
  IF p_modalidade = 'parcelado' AND v_valor_centavos < p_quantidade THEN RAISE EXCEPTION 'FINANCEIRO_PARCELA_INVALIDA'; END IF;

  v_payload := jsonb_build_object(
    'tipo', p_tipo, 'modalidade', p_modalidade, 'descricao', v_descricao,
    'valor', v_valor, 'taxa', v_taxa, 'data_evento', p_data_evento,
    'data_competencia', p_data_competencia, 'metodo_pagamento', v_metodo,
    'categoria_id', p_categoria_id, 'quantidade', p_quantidade
  );
  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':criar_titulos_em_lote:' || v_chave, 0));
  SELECT * INTO v_intencao FROM public.financeiro_idempotencia
  WHERE barbearia_id = v_barbearia AND operacao = 'criar_titulos_em_lote:' || p_tipo
    AND idempotency_key = v_chave FOR UPDATE;
  IF FOUND THEN
    IF v_intencao.payload_hash <> v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF;
    RETURN v_intencao.resposta || jsonb_build_object('idempotente', true);
  END IF;

  FOR i IN 1..p_quantidade LOOP
    IF p_modalidade = 'parcelado' THEN
      v_valor_item := ((v_valor_centavos / p_quantidade) + CASE WHEN i <= (v_valor_centavos % p_quantidade) THEN 1 ELSE 0 END)::numeric / 100;
      v_taxa_item := ((v_taxa_centavos / p_quantidade) + CASE WHEN i <= (v_taxa_centavos % p_quantidade) THEN 1 ELSE 0 END)::numeric / 100;
    ELSE
      v_valor_item := v_valor;
      v_taxa_item := v_taxa;
    END IF;
    v_data_evento := public.financeiro_data_mensal(p_data_evento, i - 1);
    v_data_competencia := public.financeiro_data_mensal(p_data_competencia, i - 1);

    IF p_tipo = 'pagar' THEN
      INSERT INTO public.financeiro_contas_pagar(
        barbearia_id, descricao, valor, data_vencimento, data_competencia,
        categoria_id, origem, grupo_id, modalidade, numero_repeticao, total_repeticoes
      ) VALUES (
        v_barbearia, v_descricao, v_valor_item, v_data_evento, v_data_competencia,
        p_categoria_id, 'manual', v_grupo, p_modalidade, i, p_quantidade
      ) RETURNING * INTO v_pagar;
      v_item := jsonb_build_object('id', v_pagar.id, 'numero', i, 'valor', v_pagar.valor, 'data_evento', v_pagar.data_vencimento);
      PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar.id, NULL, to_jsonb(v_pagar), v_correlation);
    ELSE
      INSERT INTO public.financeiro_contas_receber(
        barbearia_id, descricao, valor_bruto, taxa, data_previsao, data_competencia,
        metodo_pagamento, categoria_id, origem, grupo_id, modalidade, numero_repeticao, total_repeticoes
      ) VALUES (
        v_barbearia, v_descricao, v_valor_item, v_taxa_item, v_data_evento, v_data_competencia,
        v_metodo, p_categoria_id, 'manual', v_grupo, p_modalidade, i, p_quantidade
      ) RETURNING * INTO v_receber;
      v_item := jsonb_build_object('id', v_receber.id, 'numero', i, 'valor', v_receber.valor_liquido, 'valor_bruto', v_receber.valor_bruto, 'taxa', v_receber.taxa, 'data_evento', v_receber.data_previsao);
      PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber.id, NULL, to_jsonb(v_receber), v_correlation);
    END IF;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;

  v_resposta := jsonb_build_object(
    'grupo_id', v_grupo, 'tipo', p_tipo, 'modalidade', p_modalidade,
    'quantidade', p_quantidade, 'items', v_items
  );
  INSERT INTO public.financeiro_idempotencia(barbearia_id, operacao, idempotency_key, payload_hash, resposta)
  VALUES(v_barbearia, 'criar_titulos_em_lote:' || p_tipo, v_chave, v_hash, v_resposta);
  RETURN v_resposta || jsonb_build_object('idempotente', false);
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
      cp.grupo_id,cp.modalidade,cp.numero_repeticao,cp.total_repeticoes,
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
      cr.grupo_id,cr.modalidade,cr.numero_repeticao,cr.total_repeticoes,
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

REVOKE ALL ON FUNCTION public.financeiro_data_mensal(date,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_criar_titulos_em_lote(text,text,text,numeric,numeric,date,date,text,uuid,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_criar_titulos_em_lote(text,text,text,numeric,numeric,date,date,text,uuid,integer,text,text) TO authenticated;

COMMENT ON FUNCTION public.financeiro_criar_titulos_em_lote(text,text,text,numeric,numeric,date,date,text,uuid,integer,text,text)
  IS 'Cria parcelas ou recorrencias mensais de forma atomica, auditada e idempotente.';

COMMIT;
