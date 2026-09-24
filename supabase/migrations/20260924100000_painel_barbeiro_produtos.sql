-- Centro operacional do barbeiro e varejo: agenda semanal, indicadores próprios,
-- catálogo de produtos e venda com baixa atômica de estoque.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric(5,2);

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_estoque_minimo_check,
  ADD CONSTRAINT produtos_estoque_minimo_check CHECK (estoque_minimo >= 0),
  DROP CONSTRAINT IF EXISTS produtos_comissao_percentual_check,
  ADD CONSTRAINT produtos_comissao_percentual_check
    CHECK (comissao_percentual IS NULL OR comissao_percentual BETWEEN 0 AND 100);

ALTER TABLE public.vendas_produtos
  ADD COLUMN IF NOT EXISTS comissao_percentual_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS comissao_valor numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS chave_idempotencia uuid,
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users(id);

ALTER TABLE public.vendas_produtos
  DROP CONSTRAINT IF EXISTS vendas_produtos_comissao_percentual_check,
  ADD CONSTRAINT vendas_produtos_comissao_percentual_check
    CHECK (comissao_percentual_snapshot IS NULL OR comissao_percentual_snapshot BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS vendas_produtos_comissao_valor_check,
  ADD CONSTRAINT vendas_produtos_comissao_valor_check CHECK (comissao_valor >= 0),
  DROP CONSTRAINT IF EXISTS vendas_produtos_forma_pagamento_check,
  ADD CONSTRAINT vendas_produtos_forma_pagamento_check CHECK (
    forma_pagamento IS NULL OR forma_pagamento IN ('dinheiro','pix','debito','credito','outro')
  );

CREATE UNIQUE INDEX IF NOT EXISTS vendas_produtos_idempotencia_idx
  ON public.vendas_produtos(barbearia_id, chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendas_produtos_profissional_periodo_idx
  ON public.vendas_produtos(barbearia_id, profissional_id, criado_em DESC);

CREATE OR REPLACE FUNCTION public.produtos_catalogo_listar(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (
  id uuid, nome text, sku text, categoria text, descricao text,
  preco_venda numeric, preco_custo numeric, estoque_quantidade integer,
  estoque_minimo integer, comissao_percentual numeric, ativo boolean, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_role text:=public.get_my_role();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO';
  END IF;
  RETURN QUERY SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.preco_custo,
    p.estoque_quantidade,p.estoque_minimo,p.comissao_percentual,p.ativo,p.updated_at
  FROM public.produtos p
  WHERE p.barbearia_id=v_barbearia AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC,p.nome,p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.produto_catalogo_criar(
  p_nome text, p_sku text, p_categoria text, p_descricao text,
  p_preco_venda numeric, p_preco_custo numeric, p_estoque_quantidade integer,
  p_estoque_minimo integer, p_comissao_percentual numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_row public.produtos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PRODUTO_NOME_INVALIDO'; END IF;
  IF p_preco_venda IS NULL OR p_preco_venda<0 OR p_preco_custo IS NULL OR p_preco_custo<0 THEN RAISE EXCEPTION 'PRODUTO_PRECO_INVALIDO'; END IF;
  IF p_estoque_quantidade IS NULL OR p_estoque_quantidade<0 OR p_estoque_minimo IS NULL OR p_estoque_minimo<0 THEN RAISE EXCEPTION 'PRODUTO_ESTOQUE_INVALIDO'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'PRODUTO_COMISSAO_INVALIDA'; END IF;
  IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND lower(btrim(p.nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'PRODUTO_NOME_DUPLICADO'; END IF;
  IF NULLIF(btrim(p_sku),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND lower(btrim(p.sku))=lower(btrim(p_sku))) THEN RAISE EXCEPTION 'PRODUTO_SKU_DUPLICADO'; END IF;
  INSERT INTO public.produtos(barbearia_id,nome,sku,categoria,descricao,preco_venda,preco_custo,estoque_quantidade,estoque_minimo,comissao_percentual)
  VALUES(v_barbearia,btrim(p_nome),NULLIF(btrim(p_sku),''),NULLIF(btrim(p_categoria),''),NULLIF(btrim(p_descricao),''),round(p_preco_venda,2),round(p_preco_custo,2),p_estoque_quantidade,p_estoque_minimo,p_comissao_percentual)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.produto_catalogo_atualizar(
  p_id uuid, p_nome text, p_sku text, p_categoria text, p_descricao text,
  p_preco_venda numeric, p_preco_custo numeric, p_estoque_quantidade integer,
  p_estoque_minimo integer, p_comissao_percentual numeric, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_row public.produtos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PRODUTO_NOME_INVALIDO'; END IF;
  IF p_preco_venda IS NULL OR p_preco_venda<0 OR p_preco_custo IS NULL OR p_preco_custo<0 THEN RAISE EXCEPTION 'PRODUTO_PRECO_INVALIDO'; END IF;
  IF p_estoque_quantidade IS NULL OR p_estoque_quantidade<0 OR p_estoque_minimo IS NULL OR p_estoque_minimo<0 THEN RAISE EXCEPTION 'PRODUTO_ESTOQUE_INVALIDO'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'PRODUTO_COMISSAO_INVALIDA'; END IF;
  IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND p.id<>p_id AND lower(btrim(p.nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'PRODUTO_NOME_DUPLICADO'; END IF;
  IF NULLIF(btrim(p_sku),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND p.id<>p_id AND lower(btrim(p.sku))=lower(btrim(p_sku))) THEN RAISE EXCEPTION 'PRODUTO_SKU_DUPLICADO'; END IF;
  UPDATE public.produtos p SET nome=btrim(p_nome),sku=NULLIF(btrim(p_sku),''),categoria=NULLIF(btrim(p_categoria),''),
    descricao=NULLIF(btrim(p_descricao),''),preco_venda=round(p_preco_venda,2),preco_custo=round(p_preco_custo,2),
    estoque_quantidade=p_estoque_quantidade,estoque_minimo=p_estoque_minimo,comissao_percentual=p_comissao_percentual,
    updated_at=clock_timestamp()
  WHERE p.id=p_id AND p.barbearia_id=v_barbearia AND p.updated_at=p_expected_updated_at
  RETURNING p.* INTO v_row;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_id AND p.barbearia_id=v_barbearia) THEN RAISE EXCEPTION 'PRODUTO_CONFLITO_VERSAO'; END IF;
    RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO';
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.produto_catalogo_definir_ativo(p_id uuid,p_ativo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_row public.produtos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO'; END IF;
  UPDATE public.produtos p SET ativo=p_ativo,updated_at=clock_timestamp()
  WHERE p.id=p_id AND p.barbearia_id=v_barbearia RETURNING p.* INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO'; END IF;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_agenda_listar_periodo(p_data_inicial date,p_data_final date)
RETURNS TABLE (
  id uuid,profissional_id uuid,cliente_id uuid,cliente_nome text,cliente_telefone text,
  cliente_preferencias text,servico_id uuid,servico_nome text,duracao_minutos integer,
  data_hora timestamptz,status text,valor_final numeric,ultimo_corte jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_profissional uuid:=public.get_my_profissional_id(); v_barbearia uuid:=public.get_my_barbearia_id(); v_inicio timestamptz; v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial THEN RAISE EXCEPTION 'AGENDA_PERIODO_INVALIDO'; END IF;
  IF p_data_final-p_data_inicial>31 THEN RAISE EXCEPTION 'AGENDA_PERIODO_MUITO_LONGO'; END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  RETURN QUERY SELECT a.id,a.profissional_id,a.cliente_id,COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),c.telefone,c.notas_preferencias,
    a.servico_id,COALESCE(s.nome,'Serviço não informado'),COALESCE(a.duracao_minutos_snapshot,s.duracao_minutos,30),a.data_hora,a.status,a.valor_final,
    CASE WHEN cc.id IS NULL THEN NULL ELSE public.cliente_corte_json(cc) END
  FROM public.agendamentos a
  LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
  LEFT JOIN LATERAL (SELECT cut.* FROM public.cliente_cortes cut WHERE cut.barbearia_id=a.barbearia_id AND cut.cliente_id=a.cliente_id AND cut.ativo ORDER BY cut.criado_em DESC LIMIT 1) cc ON true
  WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional AND a.data_hora>=v_inicio AND a.data_hora<v_fim
  ORDER BY a.data_hora,a.criado_em,a.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_painel_resumo(p_data_inicial date,p_data_final date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_profissional uuid:=public.get_my_profissional_id(); v_barbearia uuid:=public.get_my_barbearia_id(); v_inicio timestamptz; v_fim timestamptz; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'PAINEL_BARBEIRO_NAO_AUTORIZADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>92 THEN RAISE EXCEPTION 'PAINEL_PERIODO_INVALIDO'; END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo'; v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  WITH atendimento AS (
    SELECT count(*) FILTER(WHERE a.status='concluido')::int atendimentos,
      count(*) FILTER(WHERE a.status IN ('pendente','confirmado','encaixe','em_atendimento'))::int proximos,
      COALESCE(sum(COALESCE(a.valor_final,s.preco,0)) FILTER(WHERE a.status='concluido'),0) valor_servicos,
      COALESCE(sum(round(COALESCE(a.valor_final,s.preco,0)*COALESCE(s.comissao_percentual,p.comissao_percentual,0)/100,2)) FILTER(WHERE a.status='concluido'),0) comissao_servicos
    FROM public.profissionais p
    LEFT JOIN public.agendamentos a ON a.profissional_id=p.id AND a.barbearia_id=p.barbearia_id AND a.data_hora>=v_inicio AND a.data_hora<v_fim
    LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
    WHERE p.id=v_profissional AND p.barbearia_id=v_barbearia
  ), produto AS (
    SELECT count(*) FILTER(WHERE vp.status='concluida')::int vendas_produtos,
      COALESCE(sum(vp.valor_venda) FILTER(WHERE vp.status='concluida'),0) valor_produtos,
      COALESCE(sum(vp.comissao_valor) FILTER(WHERE vp.status='concluida'),0) comissao_produtos
    FROM public.vendas_produtos vp WHERE vp.barbearia_id=v_barbearia AND vp.profissional_id=v_profissional AND vp.criado_em>=v_inicio AND vp.criado_em<v_fim
  ) SELECT jsonb_build_object('data_inicial',p_data_inicial,'data_final',p_data_final,
    'atendimentos',a.atendimentos,'proximos',a.proximos,'valor_servicos',a.valor_servicos,
    'comissao_servicos',a.comissao_servicos,'vendas_produtos',pr.vendas_produtos,
    'valor_produtos',pr.valor_produtos,'comissao_produtos',pr.comissao_produtos,
    'valor_total',a.valor_servicos+pr.valor_produtos,'comissao_total',a.comissao_servicos+pr.comissao_produtos)
  INTO v_result FROM atendimento a CROSS JOIN produto pr;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_produtos_listar()
RETURNS TABLE(id uuid,nome text,sku text,categoria text,descricao text,preco_venda numeric,estoque_quantidade integer,comissao_percentual numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR public.get_my_profissional_id() IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_AUTORIZADA'; END IF;
  RETURN QUERY SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.estoque_quantidade,p.comissao_percentual
  FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND p.ativo ORDER BY (p.estoque_quantidade>0) DESC,p.nome,p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_produto_vender(p_produto_id uuid,p_quantidade integer,p_agendamento_id uuid,p_forma_pagamento text,p_chave_idempotencia uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.get_my_profissional_id(); v_produto public.produtos%ROWTYPE; v_agendamento public.agendamentos%ROWTYPE; v_venda public.vendas_produtos%ROWTYPE; v_total numeric; v_comissao numeric;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_AUTORIZADA'; END IF;
  IF p_quantidade IS NULL OR p_quantidade<1 OR p_quantidade>100 THEN RAISE EXCEPTION 'VENDA_PRODUTO_QUANTIDADE_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'VENDA_PRODUTO_PAGAMENTO_INVALIDO'; END IF;
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_CHAVE_INVALIDA'; END IF;
  SELECT * INTO v_venda FROM public.vendas_produtos WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN RETURN to_jsonb(v_venda); END IF;
  SELECT * INTO v_produto FROM public.produtos WHERE id=p_produto_id AND barbearia_id=v_barbearia AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_ENCONTRADO'; END IF;
  IF v_produto.estoque_quantidade<p_quantidade THEN RAISE EXCEPTION 'VENDA_PRODUTO_ESTOQUE_INSUFICIENTE'; END IF;
  IF p_agendamento_id IS NOT NULL THEN
    SELECT * INTO v_agendamento FROM public.agendamentos WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional;
    IF NOT FOUND THEN RAISE EXCEPTION 'VENDA_PRODUTO_ATENDIMENTO_INVALIDO'; END IF;
  END IF;
  v_total:=round(v_produto.preco_venda*p_quantidade,2); v_comissao:=round(v_total*COALESCE(v_produto.comissao_percentual,0)/100,2);
  UPDATE public.produtos SET estoque_quantidade=estoque_quantidade-p_quantidade,updated_at=clock_timestamp() WHERE id=v_produto.id;
  INSERT INTO public.vendas_produtos(barbearia_id,agendamento_id,profissional_id,nome_produto,valor_venda,produto_id,cliente_id,quantidade,preco_unitario_snapshot,preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,forma_pagamento,chave_idempotencia,criado_por)
  VALUES(v_barbearia,p_agendamento_id,v_profissional,v_produto.nome,v_total,v_produto.id,CASE WHEN p_agendamento_id IS NULL THEN NULL ELSE v_agendamento.cliente_id END,p_quantidade,v_produto.preco_venda,v_produto.preco_custo,'concluida',COALESCE(v_produto.comissao_percentual,0),v_comissao,p_forma_pagamento,p_chave_idempotencia,auth.uid())
  RETURNING * INTO v_venda;
  RETURN to_jsonb(v_venda);
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_catalogo_listar(boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.produto_catalogo_criar(text,text,text,text,numeric,numeric,integer,integer,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.produto_catalogo_atualizar(uuid,text,text,text,text,numeric,numeric,integer,integer,numeric,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.produto_catalogo_definir_ativo(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_agenda_listar_periodo(date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_painel_resumo(date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_produtos_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_produto_vender(uuid,integer,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.produtos_catalogo_listar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produto_catalogo_criar(text,text,text,text,numeric,numeric,integer,integer,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produto_catalogo_atualizar(uuid,text,text,text,text,numeric,numeric,integer,integer,numeric,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produto_catalogo_definir_ativo(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_agenda_listar_periodo(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_painel_resumo(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_produtos_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_produto_vender(uuid,integer,uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.barbeiro_painel_resumo(date,date) IS 'Indicadores de serviços, produtos e comissões limitados ao profissional autenticado.';
COMMENT ON FUNCTION public.barbeiro_produto_vender(uuid,integer,uuid,text,uuid) IS 'Registra venda do profissional autenticado e baixa estoque de forma atômica e idempotente.';
