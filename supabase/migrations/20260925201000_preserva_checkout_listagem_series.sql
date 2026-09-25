BEGIN;

-- Preserva o contrato ampliado pelo checkout ao acrescentar os metadados de série.
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
      (cp.envelope_resgate_transacao_id IS NOT NULL) possui_reserva,
      NULL::uuid fechamento_id,false pode_estornar
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
      (cr.origem='manual' AND cr.status='previsto'),false,
      cr.fechamento_id,(cr.fechamento_id IS NOT NULL AND cr.status IN ('previsto','liquidado'))
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

COMMIT;
