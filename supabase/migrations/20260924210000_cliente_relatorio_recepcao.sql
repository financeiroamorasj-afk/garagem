-- Recepção R7: cliente opcional na venda avulsa e relatório operacional do gestor.

ALTER TABLE public.vendas_balcao
  ADD COLUMN cliente_id uuid,
  ADD CONSTRAINT vendas_balcao_cliente_tenant_fkey
    FOREIGN KEY (barbearia_id,cliente_id) REFERENCES public.clientes(barbearia_id,id);

CREATE INDEX vendas_balcao_cliente_data_idx
  ON public.vendas_balcao(barbearia_id,cliente_id,criado_em DESC)
  WHERE cliente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recepcao_venda_avulsa_concluir_cliente(
  p_produtos jsonb,
  p_profissional_id uuid,
  p_cliente_id uuid,
  p_desconto numeric,
  p_forma_pagamento text,
  p_taxa numeric,
  p_data_recebimento date,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_result jsonb;
  v_venda_id uuid;
  v_venda public.vendas_balcao%ROWTYPE;
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=p_cliente_id AND c.barbearia_id=v_barbearia
  ) THEN RAISE EXCEPTION 'RECEPCAO_VENDA_CLIENTE_INVALIDO'; END IF;

  v_result:=public.recepcao_venda_avulsa_concluir(
    p_produtos,p_profissional_id,p_desconto,p_forma_pagamento,p_taxa,p_data_recebimento,p_chave_idempotencia
  );
  v_venda_id:=(v_result->'venda'->>'id')::uuid;
  SELECT * INTO v_venda
  FROM public.vendas_balcao
  WHERE id=v_venda_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_VENDA_NAO_ENCONTRADA'; END IF;

  IF COALESCE((v_result->>'idempotente')::boolean,false) AND v_venda.cliente_id IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION 'RECEPCAO_VENDA_CHAVE_EM_USO';
  END IF;

  UPDATE public.vendas_balcao
  SET cliente_id=p_cliente_id
  WHERE id=v_venda.id AND barbearia_id=v_barbearia
  RETURNING * INTO v_venda;
  UPDATE public.financeiro_contas_receber
  SET cliente_id=p_cliente_id,updated_at=clock_timestamp()
  WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda.id;

  RETURN jsonb_set(v_result,'{venda}',to_jsonb(v_venda),false);
END;
$$;

DROP FUNCTION public.recepcao_vendas_balcao_listar(date,date,integer);

CREATE FUNCTION public.recepcao_vendas_balcao_listar(
  p_data_inicial date,
  p_data_final date,
  p_limite integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  profissional_id uuid,
  profissional_nome text,
  cliente_id uuid,
  cliente_nome text,
  criado_por_nome text,
  valor_produtos_bruto numeric,
  desconto numeric,
  valor_final numeric,
  taxa numeric,
  valor_liquido numeric,
  forma_pagamento text,
  data_recebimento date,
  comissao_total numeric,
  status text,
  criado_em timestamptz,
  estornado_em timestamptz,
  motivo_estorno text,
  produtos jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>31 THEN
    RAISE EXCEPTION 'RECEPCAO_VENDAS_PERIODO_INVALIDO';
  END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RECEPCAO_VENDAS_LIMITE_INVALIDO'; END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT
    vb.id,vb.profissional_id,COALESCE(p.apelido,p.nome),vb.cliente_id,c.nome,
    COALESCE(pr.nome,pr.email,'Recepção'),vb.valor_produtos_bruto,vb.desconto,vb.valor_final,vb.taxa,
    vb.valor_liquido,vb.forma_pagamento,vb.data_recebimento,vb.comissao_total,vb.status,vb.criado_em,
    vb.estornado_em,vb.motivo_estorno,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',vp.id,'produto_id',vp.produto_id,'nome',vp.nome_produto,'quantidade',vp.quantidade,
        'valor_bruto',vp.valor_venda,'desconto',vp.desconto_valor,'valor_liquido',vp.valor_liquido,
        'status',vp.status
      ) ORDER BY vp.nome_produto,vp.id)
      FROM public.vendas_produtos vp
      WHERE vp.barbearia_id=v_barbearia AND vp.venda_balcao_id=vb.id
    ),'[]'::jsonb)
  FROM public.vendas_balcao vb
  LEFT JOIN public.profissionais p ON p.id=vb.profissional_id AND p.barbearia_id=vb.barbearia_id
  LEFT JOIN public.clientes c ON c.id=vb.cliente_id AND c.barbearia_id=vb.barbearia_id
  LEFT JOIN public.profiles pr ON pr.id=vb.criado_por AND pr.barbearia_id=vb.barbearia_id
  WHERE vb.barbearia_id=v_barbearia AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim
  ORDER BY vb.criado_em DESC,vb.id DESC
  LIMIT p_limite;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recepcao_resumo(p_data_inicial date,p_data_final date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_admin();
  v_inicio timestamptz;
  v_fim timestamptz;
  v_resumo jsonb;
  v_operadores jsonb;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>92 THEN
    RAISE EXCEPTION 'RECEPCAO_RELATORIO_PERIODO_INVALIDO';
  END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object(
    'cobrancas_atendimentos',count(*) FILTER (WHERE f.status='concluido'),
    'valor_atendimentos',COALESCE(sum(f.valor_final) FILTER (WHERE f.status='concluido'),0),
    'vendas_avulsas',(SELECT count(*) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'valor_vendas_avulsas',(SELECT COALESCE(sum(vb.valor_final),0) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'produtos_vendidos',(SELECT COALESCE(sum(vp.quantidade),0) FROM public.vendas_produtos vp JOIN public.vendas_balcao vb ON vb.id=vp.venda_balcao_id AND vb.barbearia_id=vp.barbearia_id WHERE vp.barbearia_id=v_barbearia AND vp.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'estornos_avulsos',(SELECT count(*) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim),
    'valor_estornado',(SELECT COALESCE(sum(vb.valor_final),0) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim),
    'devolucoes_ao_barbeiro',(SELECT count(*) FROM public.atendimento_operacao_log l WHERE l.barbearia_id=v_barbearia AND l.evento='cancelado' AND l.ator_papel='recepcao' AND l.criado_em>=v_inicio AND l.criado_em<v_fim)
  ) INTO v_resumo
  FROM public.atendimento_fechamentos f
  JOIN public.profiles fp ON fp.id=f.criado_por AND fp.barbearia_id=f.barbearia_id AND fp.role='recepcao'
  WHERE f.barbearia_id=v_barbearia AND f.criado_em>=v_inicio AND f.criado_em<v_fim;

  WITH operadores AS (
    SELECT p.id,p.nome,p.email,p.ativo
    FROM public.profiles p
    WHERE p.barbearia_id=v_barbearia AND p.role='recepcao'
  ), fechamentos AS (
    SELECT f.criado_por operador_id,count(*) FILTER (WHERE f.status='concluido')::integer cobrancas,
      COALESCE(sum(f.valor_final) FILTER (WHERE f.status='concluido'),0) valor
    FROM public.atendimento_fechamentos f
    WHERE f.barbearia_id=v_barbearia AND f.criado_em>=v_inicio AND f.criado_em<v_fim
    GROUP BY f.criado_por
  ), vendas AS (
    SELECT vb.criado_por operador_id,count(*) FILTER (WHERE vb.status='concluida')::integer vendas,
      COALESCE(sum(vb.valor_final) FILTER (WHERE vb.status='concluida'),0) valor,
      COALESCE(sum((SELECT sum(vp.quantidade) FROM public.vendas_produtos vp WHERE vp.barbearia_id=vb.barbearia_id AND vp.venda_balcao_id=vb.id AND vp.status='concluida')) FILTER (WHERE vb.status='concluida'),0)::integer produtos
    FROM public.vendas_balcao vb
    WHERE vb.barbearia_id=v_barbearia AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim
    GROUP BY vb.criado_por
  ), estornos AS (
    SELECT vb.estornado_por operador_id,count(*)::integer estornos
    FROM public.vendas_balcao vb
    WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim
    GROUP BY vb.estornado_por
  ), devolucoes AS (
    SELECT l.ator_id operador_id,count(*)::integer devolucoes
    FROM public.atendimento_operacao_log l
    WHERE l.barbearia_id=v_barbearia AND l.evento='cancelado' AND l.ator_papel='recepcao' AND l.criado_em>=v_inicio AND l.criado_em<v_fim
    GROUP BY l.ator_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',o.id,'nome',o.nome,'email',o.email,'ativo',o.ativo,
    'cobrancas_atendimentos',COALESCE(f.cobrancas,0),'valor_atendimentos',COALESCE(f.valor,0),
    'vendas_avulsas',COALESCE(v.vendas,0),'valor_vendas_avulsas',COALESCE(v.valor,0),
    'produtos_vendidos',COALESCE(v.produtos,0),'estornos',COALESCE(e.estornos,0),
    'devolucoes_ao_barbeiro',COALESCE(d.devolucoes,0)
  ) ORDER BY o.ativo DESC,lower(o.nome),o.id),'[]'::jsonb)
  INTO v_operadores
  FROM operadores o
  LEFT JOIN fechamentos f ON f.operador_id=o.id
  LEFT JOIN vendas v ON v.operador_id=o.id
  LEFT JOIN estornos e ON e.operador_id=o.id
  LEFT JOIN devolucoes d ON d.operador_id=o.id;

  RETURN jsonb_build_object('data_inicial',p_data_inicial,'data_final',p_data_final,'resumo',v_resumo,'operadores',v_operadores);
END;
$$;

REVOKE ALL ON FUNCTION public.recepcao_venda_avulsa_concluir_cliente(jsonb,uuid,uuid,numeric,text,numeric,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_vendas_balcao_listar(date,date,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_recepcao_resumo(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recepcao_venda_avulsa_concluir_cliente(jsonb,uuid,uuid,numeric,text,numeric,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_vendas_balcao_listar(date,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recepcao_resumo(date,date) TO authenticated;

COMMENT ON FUNCTION public.recepcao_venda_avulsa_concluir_cliente(jsonb,uuid,uuid,numeric,text,numeric,date,uuid) IS
  'Conclui venda avulsa atomica e associa opcionalmente um cliente da mesma barbearia.';
COMMENT ON FUNCTION public.admin_recepcao_resumo(date,date) IS
  'Resumo operacional da recepcao para o gestor, sem expor o ledger financeiro ao operador de balcao.';
