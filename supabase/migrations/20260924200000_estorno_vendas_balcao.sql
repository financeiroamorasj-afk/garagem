-- Recepção R6: histórico operacional e estorno auditado de vendas avulsas.

ALTER TABLE public.vendas_balcao
  ADD COLUMN estornado_por uuid REFERENCES auth.users(id),
  ADD COLUMN estornado_em timestamptz,
  ADD COLUMN motivo_estorno text,
  ADD COLUMN estorno_chave_idempotencia uuid,
  ADD CONSTRAINT vendas_balcao_estado_estorno_check CHECK (
    (status='concluida' AND estornado_em IS NULL AND estornado_por IS NULL AND motivo_estorno IS NULL AND estorno_chave_idempotencia IS NULL)
    OR
    (status='estornada' AND estornado_em IS NOT NULL AND estornado_por IS NOT NULL
      AND length(btrim(motivo_estorno)) BETWEEN 3 AND 500 AND estorno_chave_idempotencia IS NOT NULL)
  );

CREATE UNIQUE INDEX vendas_balcao_estorno_idempotencia_unique
  ON public.vendas_balcao(barbearia_id,estorno_chave_idempotencia)
  WHERE estorno_chave_idempotencia IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recepcao_vendas_balcao_listar(
  p_data_inicial date,
  p_data_final date,
  p_limite integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  profissional_id uuid,
  profissional_nome text,
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
    vb.id,vb.profissional_id,COALESCE(p.apelido,p.nome),COALESCE(pr.nome,pr.email,'Recepção'),
    vb.valor_produtos_bruto,vb.desconto,vb.valor_final,vb.taxa,vb.valor_liquido,vb.forma_pagamento,
    vb.data_recebimento,vb.comissao_total,vb.status,vb.criado_em,vb.estornado_em,vb.motivo_estorno,
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
  LEFT JOIN public.profiles pr ON pr.id=vb.criado_por AND pr.barbearia_id=vb.barbearia_id
  WHERE vb.barbearia_id=v_barbearia AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim
  ORDER BY vb.criado_em DESC,vb.id DESC
  LIMIT p_limite;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_venda_avulsa_estornar(
  p_venda_id uuid,
  p_motivo text,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_venda_balcao public.vendas_balcao%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_saldo integer;
  v_motivo text:=btrim(COALESCE(p_motivo,''));
BEGIN
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_CHAVE_INVALIDA'; END IF;
  IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_MOTIVO_INVALIDO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text||':recepcao-estorno:'||p_venda_id::text,0));

  SELECT * INTO v_venda_balcao
  FROM public.vendas_balcao
  WHERE id=p_venda_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda_balcao.status='estornada' THEN
    IF v_venda_balcao.estorno_chave_idempotencia=p_chave_idempotencia THEN
      RETURN jsonb_build_object('idempotente',true,'venda',to_jsonb(v_venda_balcao));
    END IF;
    RAISE EXCEPTION 'RECEPCAO_ESTORNO_JA_REALIZADO';
  END IF;

  FOR v_venda IN
    SELECT *
    FROM public.vendas_produtos
    WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda_balcao.id AND status='concluida'
    ORDER BY produto_id,id
    FOR UPDATE
  LOOP
    SELECT estoque_quantidade INTO v_saldo
    FROM public.produtos
    WHERE id=v_venda.produto_id AND barbearia_id=v_barbearia
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_PRODUTO_NAO_ENCONTRADO'; END IF;
    UPDATE public.produtos
    SET estoque_quantidade=estoque_quantidade+v_venda.quantidade,updated_at=clock_timestamp()
    WHERE id=v_venda.produto_id AND barbearia_id=v_barbearia;
    UPDATE public.vendas_produtos SET status='cancelada' WHERE id=v_venda.id AND barbearia_id=v_barbearia;
    INSERT INTO public.estoque_movimentacoes(
      barbearia_id,produto_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por
    ) VALUES (
      v_barbearia,v_venda.produto_id,v_venda.id,'estorno',v_venda.quantidade,v_saldo,v_saldo+v_venda.quantidade,
      'Estorno de venda avulsa: '||v_motivo,auth.uid()
    );
  END LOOP;

  UPDATE public.financeiro_contas_receber
  SET status='estornado',updated_at=clock_timestamp()
  WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda_balcao.id AND status IN ('previsto','liquidado');
  UPDATE public.financeiro_movimentacoes
  SET status='estornado'
  WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda_balcao.id AND status='efetivado';
  UPDATE public.vendas_balcao
  SET status='estornada',estornado_por=auth.uid(),estornado_em=clock_timestamp(),motivo_estorno=v_motivo,
      estorno_chave_idempotencia=p_chave_idempotencia
  WHERE id=v_venda_balcao.id AND barbearia_id=v_barbearia
  RETURNING * INTO v_venda_balcao;

  RETURN jsonb_build_object('idempotente',false,'venda',to_jsonb(v_venda_balcao));
END;
$$;

REVOKE ALL ON FUNCTION public.recepcao_vendas_balcao_listar(date,date,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_venda_avulsa_estornar(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recepcao_vendas_balcao_listar(date,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_venda_avulsa_estornar(uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.recepcao_vendas_balcao_listar(date,date,integer) IS
  'Lista as vendas avulsas da recepcao no periodo, com itens e estado do estorno.';
COMMENT ON FUNCTION public.recepcao_venda_avulsa_estornar(uuid,text,uuid) IS
  'Estorna uma venda avulsa da recepcao, restaura estoque e marca o financeiro sem apagar o historico.';
