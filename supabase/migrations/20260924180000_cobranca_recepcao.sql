-- Recepção R4: conferência do carrinho e cobrança transacional no balcão.

ALTER TABLE public.atendimento_pendencias
  ADD COLUMN fechamento_id uuid,
  ADD COLUMN cobrado_por uuid REFERENCES auth.users(id),
  ADD COLUMN cobrado_em timestamptz,
  ADD CONSTRAINT atendimento_pendencias_fechamento_tenant_fkey
    FOREIGN KEY (barbearia_id, fechamento_id)
    REFERENCES public.atendimento_fechamentos(barbearia_id, id);

CREATE OR REPLACE FUNCTION public.recepcao_produtos_listar()
RETURNS TABLE (
  id uuid, nome text, sku text, categoria text, descricao text,
  preco_venda numeric, estoque_quantidade integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_barbearia uuid := public.recepcao_assert_operador();
BEGIN
  RETURN QUERY
  SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.estoque_quantidade
  FROM public.produtos p
  WHERE p.barbearia_id=v_barbearia AND p.ativo
  ORDER BY (p.estoque_quantidade>0) DESC,p.nome,p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_carrinho_salvar(
  p_pendencia_id uuid,
  p_valor_servico numeric,
  p_produtos jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_item record;
  v_count integer;
  v_total_produtos numeric(15,2) := 0;
BEGIN
  IF p_valor_servico IS NULL OR p_valor_servico<0 OR p_valor_servico>99999999 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_VALOR_INVALIDO'; END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos)>20 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_VERSAO_INVALIDA'; END IF;

  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_NAO_ENCONTRADO'; END IF;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_CONFLITO_VERSAO'; END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT item->>'produto_id'
    FROM jsonb_array_elements(p_produtos) item
    GROUP BY item->>'produto_id'
    HAVING count(*)>1
  ) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_DUPLICADOS'; END IF;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto
    FROM public.produtos
    WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_total_produtos:=v_total_produtos+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;
  IF round(p_valor_servico,2)+v_total_produtos<=0 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_VALOR_INVALIDO'; END IF;

  DELETE FROM public.atendimento_itens_pendentes
  WHERE pendencia_id=v_pendencia.id AND barbearia_id=v_barbearia;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia;
    INSERT INTO public.atendimento_itens_pendentes(
      barbearia_id,pendencia_id,produto_id,quantidade,preco_unitario_snapshot,adicionado_por_papel,adicionado_por
    ) VALUES (
      v_barbearia,v_pendencia.id,v_produto.id,v_item.quantidade,v_produto.preco_venda,'recepcao',auth.uid()
    );
  END LOOP;

  UPDATE public.atendimento_pendencias
  SET valor_servico=round(p_valor_servico,2),updated_at=clock_timestamp()
  WHERE id=v_pendencia.id
  RETURNING * INTO v_pendencia;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_pendencia.agendamento_id,v_pendencia.id,'carrinho_alterado',auth.uid(),'recepcao',
    jsonb_build_object('valor_servico',v_pendencia.valor_servico,'valor_produtos',v_total_produtos,'itens',jsonb_array_length(p_produtos))
  );

  RETURN jsonb_build_object(
    'pendencia_id',v_pendencia.id,
    'updated_at',v_pendencia.updated_at,
    'valor_servico',v_pendencia.valor_servico,
    'valor_produtos',v_total_produtos,
    'valor_total',v_pendencia.valor_servico+v_total_produtos
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS';
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_cobranca_concluir(
  p_pendencia_id uuid,
  p_desconto numeric,
  p_forma_pagamento text,
  p_taxa numeric,
  p_data_recebimento date,
  p_chave_idempotencia uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_agendamento public.agendamentos%ROWTYPE;
  v_servico public.servicos%ROWTYPE;
  v_fechamento public.atendimento_fechamentos%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_item record;
  v_conta uuid; v_categoria_servico uuid; v_categoria_produto uuid;
  v_recebivel uuid;
  v_produtos_bruto numeric(15,2):=0; v_bruto numeric(15,2); v_final numeric(15,2);
  v_servico_liquido numeric(15,2); v_produtos_liquido numeric(15,2);
  v_taxa_servico numeric(15,2); v_taxa_produtos numeric(15,2);
  v_comissao_pct numeric(5,2); v_comissao_produtos numeric(15,2):=0;
  v_linha_bruta numeric(15,2); v_linha_desconto numeric(15,2); v_linha_liquida numeric(15,2);
  v_desconto_produtos_restante numeric(15,2); v_bruto_produtos_restante numeric(15,2);
  v_saldo_antes integer; v_liquidado boolean; v_competencia date;
BEGIN
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CHAVE_INVALIDA'; END IF;

  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_NAO_ENCONTRADA'; END IF;

  SELECT * INTO v_fechamento
  FROM public.atendimento_fechamentos
  WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN
    IF v_fechamento.agendamento_id<>v_pendencia.agendamento_id THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CHAVE_EM_USO'; END IF;
    RETURN jsonb_build_object('idempotente',true,'fechamento',to_jsonb(v_fechamento));
  END IF;

  IF p_desconto IS NULL OR p_desconto<0 THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_DESCONTO_INVALIDO'; END IF;
  IF p_taxa IS NULL OR p_taxa<0 THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_TAXA_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_PAGAMENTO_INVALIDO'; END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento<current_date THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_DATA_INVALIDA'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_VERSAO_INVALIDA'; END IF;

  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CONFLITO_VERSAO'; END IF;

  SELECT * INTO v_agendamento
  FROM public.agendamentos
  WHERE id=v_pendencia.agendamento_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND OR v_agendamento.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_STATUS_INVALIDO'; END IF;
  SELECT * INTO v_servico FROM public.servicos WHERE id=v_pendencia.servico_id AND barbearia_id=v_barbearia;

  FOR v_item IN
    SELECT ai.produto_id,ai.quantidade,ai.preco_unitario_snapshot
    FROM public.atendimento_itens_pendentes ai
    WHERE ai.pendencia_id=v_pendencia.id AND ai.barbearia_id=v_barbearia
    ORDER BY ai.produto_id
  LOOP
    SELECT * INTO v_produto
    FROM public.produtos
    WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_produtos_bruto:=v_produtos_bruto+round(v_item.preco_unitario_snapshot*v_item.quantidade,2);
  END LOOP;

  v_bruto:=round(v_pendencia.valor_servico,2)+v_produtos_bruto;
  IF v_bruto<=0 OR p_desconto>v_bruto THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_DESCONTO_INVALIDO'; END IF;
  v_final:=round(v_bruto-p_desconto,2);
  IF p_taxa>v_final THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_TAXA_INVALIDA'; END IF;
  v_servico_liquido:=round(v_final*round(v_pendencia.valor_servico,2)/v_bruto,2);
  v_produtos_liquido:=v_final-v_servico_liquido;
  v_taxa_servico:=CASE WHEN v_final=0 THEN 0 ELSE round(p_taxa*v_servico_liquido/v_final,2) END;
  v_taxa_produtos:=round(p_taxa-v_taxa_servico,2);
  v_comissao_pct:=COALESCE(v_servico.comissao_percentual,(SELECT comissao_percentual FROM public.profissionais WHERE id=v_pendencia.profissional_id),0);
  v_competencia:=(v_agendamento.data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
  v_liquidado:=p_data_recebimento=current_date;

  SELECT id INTO v_conta
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia AND ativa
  ORDER BY conta_principal DESC,created_at,id LIMIT 1;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CONTA_NAO_CONFIGURADA'; END IF;
  SELECT id INTO v_categoria_servico FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_servicos' ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_categoria_produto FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_produtos' ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.atendimento_fechamentos(
    barbearia_id,agendamento_id,profissional_id,cliente_id,servico_nome_snapshot,valor_servico_bruto,
    valor_produtos_bruto,desconto,valor_servico_liquido,valor_produtos_liquido,valor_final,taxa,forma_pagamento,
    data_recebimento,comissao_servico_percentual,comissao_servico_valor,chave_idempotencia,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.id,v_pendencia.profissional_id,v_pendencia.cliente_id,COALESCE(v_servico.nome,'Servico'),v_pendencia.valor_servico,
    v_produtos_bruto,round(p_desconto,2),v_servico_liquido,v_produtos_liquido,v_final,round(p_taxa,2),p_forma_pagamento,
    p_data_recebimento,v_comissao_pct,round(v_servico_liquido*v_comissao_pct/100,2),p_chave_idempotencia,auth.uid()
  ) RETURNING * INTO v_fechamento;

  v_desconto_produtos_restante:=v_produtos_bruto-v_produtos_liquido;
  v_bruto_produtos_restante:=v_produtos_bruto;
  FOR v_item IN
    SELECT ai.produto_id,ai.quantidade,ai.preco_unitario_snapshot
    FROM public.atendimento_itens_pendentes ai
    WHERE ai.pendencia_id=v_pendencia.id AND ai.barbearia_id=v_barbearia
    ORDER BY ai.produto_id
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    v_linha_bruta:=round(v_item.preco_unitario_snapshot*v_item.quantidade,2);
    v_linha_desconto:=CASE WHEN v_bruto_produtos_restante=v_linha_bruta THEN v_desconto_produtos_restante
      ELSE round((v_produtos_bruto-v_produtos_liquido)*v_linha_bruta/v_produtos_bruto,2) END;
    v_linha_liquida:=v_linha_bruta-v_linha_desconto;
    v_saldo_antes:=v_produto.estoque_quantidade;
    UPDATE public.produtos SET estoque_quantidade=estoque_quantidade-v_item.quantidade,updated_at=clock_timestamp() WHERE id=v_produto.id;
    INSERT INTO public.vendas_produtos(
      barbearia_id,agendamento_id,profissional_id,nome_produto,valor_venda,produto_id,cliente_id,quantidade,
      preco_unitario_snapshot,preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,
      forma_pagamento,chave_idempotencia,criado_por,fechamento_id,desconto_valor
    ) VALUES (
      v_barbearia,v_agendamento.id,v_pendencia.profissional_id,v_produto.nome,v_linha_bruta,v_produto.id,v_pendencia.cliente_id,v_item.quantidade,
      v_item.preco_unitario_snapshot,v_produto.preco_custo,'concluida',COALESCE(v_produto.comissao_percentual,0),
      round(v_linha_liquida*COALESCE(v_produto.comissao_percentual,0)/100,2),p_forma_pagamento,
      extensions.uuid_generate_v4(),auth.uid(),v_fechamento.id,v_linha_desconto
    ) RETURNING * INTO v_venda;
    INSERT INTO public.estoque_movimentacoes(
      barbearia_id,produto_id,fechamento_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por
    ) VALUES (
      v_barbearia,v_produto.id,v_fechamento.id,v_venda.id,'venda',-v_item.quantidade,v_saldo_antes,v_saldo_antes-v_item.quantidade,'Venda cobrada pela recepcao',auth.uid()
    );
    v_comissao_produtos:=v_comissao_produtos+v_venda.comissao_valor;
    v_desconto_produtos_restante:=v_desconto_produtos_restante-v_linha_desconto;
    v_bruto_produtos_restante:=v_bruto_produtos_restante-v_linha_bruta;
  END LOOP;

  IF v_servico_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Atendimento - '||COALESCE(v_servico.nome,'Servico'),v_servico_liquido,v_taxa_servico,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_pendencia.cliente_id,v_categoria_servico,'servico',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(
        barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,
        conta_receber_id,agendamento_id,fechamento_id,descricao
      ) VALUES (
        v_barbearia,v_conta,'entrada',v_servico_liquido,v_competencia,p_data_recebimento,v_categoria_servico,'checkout',
        p_chave_idempotencia::text||':servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento do atendimento pela recepcao'
      );
      IF v_taxa_servico>0 THEN
        INSERT INTO public.financeiro_movimentacoes(
          barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,
          conta_receber_id,agendamento_id,fechamento_id,descricao
        ) VALUES (
          v_barbearia,v_conta,'saida',v_taxa_servico,v_competencia,p_data_recebimento,'taxa_checkout',
          p_chave_idempotencia::text||':taxa-servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa do atendimento'
        );
      END IF;
    END IF;
  END IF;

  IF v_produtos_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Produtos do atendimento',v_produtos_liquido,v_taxa_produtos,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_pendencia.cliente_id,v_categoria_produto,'produto',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(
        barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,
        conta_receber_id,agendamento_id,fechamento_id,descricao
      ) VALUES (
        v_barbearia,v_conta,'entrada',v_produtos_liquido,v_competencia,p_data_recebimento,v_categoria_produto,'checkout',
        p_chave_idempotencia::text||':produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento dos produtos pela recepcao'
      );
      IF v_taxa_produtos>0 THEN
        INSERT INTO public.financeiro_movimentacoes(
          barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,
          conta_receber_id,agendamento_id,fechamento_id,descricao
        ) VALUES (
          v_barbearia,v_conta,'saida',v_taxa_produtos,v_competencia,p_data_recebimento,'taxa_checkout',
          p_chave_idempotencia::text||':taxa-produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa dos produtos'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.atendimento_fechamentos
  SET comissao_produtos_valor=v_comissao_produtos,comissao_total=comissao_servico_valor+v_comissao_produtos
  WHERE id=v_fechamento.id
  RETURNING * INTO v_fechamento;

  UPDATE public.agendamentos
  SET status='concluido',valor_final=v_servico_liquido,
      pagamento_status=CASE WHEN v_liquidado THEN 'pago' ELSE 'pendente' END,
      pagamento_provedor=p_forma_pagamento,pagamento_referencia=v_fechamento.id::text
  WHERE id=v_agendamento.id;

  UPDATE public.atendimento_pendencias
  SET status='cobrado',fechamento_id=v_fechamento.id,cobrado_por=auth.uid(),cobrado_em=now(),updated_at=clock_timestamp()
  WHERE id=v_pendencia.id;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_agendamento.id,v_pendencia.id,'cobrado',auth.uid(),'recepcao',
    jsonb_build_object('fechamento_id',v_fechamento.id,'valor_final',v_final,'forma_pagamento',p_forma_pagamento)
  );

  RETURN jsonb_build_object('idempotente',false,'fechamento',to_jsonb(v_fechamento));
END;
$$;

REVOKE ALL ON FUNCTION public.recepcao_produtos_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_carrinho_salvar(uuid,numeric,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_cobranca_concluir(uuid,numeric,text,numeric,date,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recepcao_produtos_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_carrinho_salvar(uuid,numeric,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_cobranca_concluir(uuid,numeric,text,numeric,date,uuid,timestamptz) TO authenticated;

COMMENT ON FUNCTION public.recepcao_cobranca_concluir(uuid,numeric,text,numeric,date,uuid,timestamptz) IS
  'Confirma a cobrança da recepção e movimenta estoque, comissões e financeiro de forma atômica e idempotente.';

