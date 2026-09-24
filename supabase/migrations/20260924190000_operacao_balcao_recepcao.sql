-- Recepção R5: devolução auditada da fila e venda avulsa de produtos no balcão.

ALTER TABLE public.atendimento_pendencias
  DROP CONSTRAINT atendimento_pendencias_barbearia_id_agendamento_id_key;

CREATE UNIQUE INDEX atendimento_pendencias_aberta_agendamento_unique
  ON public.atendimento_pendencias(barbearia_id,agendamento_id)
  WHERE status='aguardando_pagamento';

CREATE TABLE public.vendas_balcao (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  profissional_id uuid,
  valor_produtos_bruto numeric(15,2) NOT NULL CHECK (valor_produtos_bruto>0),
  desconto numeric(15,2) NOT NULL DEFAULT 0 CHECK (desconto>=0),
  valor_final numeric(15,2) NOT NULL CHECK (valor_final>=0),
  taxa numeric(15,2) NOT NULL DEFAULT 0 CHECK (taxa>=0),
  valor_liquido numeric(15,2) GENERATED ALWAYS AS (valor_final-taxa) STORED,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('dinheiro','pix','debito','credito','outro')),
  data_recebimento date NOT NULL,
  comissao_total numeric(15,2) NOT NULL DEFAULT 0 CHECK (comissao_total>=0),
  status text NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','estornada')),
  chave_idempotencia uuid NOT NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id,id),
  UNIQUE (barbearia_id,chave_idempotencia),
  CONSTRAINT vendas_balcao_profissional_tenant_fkey
    FOREIGN KEY (barbearia_id,profissional_id) REFERENCES public.profissionais(barbearia_id,id),
  CHECK (desconto<=valor_produtos_bruto),
  CHECK (valor_final=valor_produtos_bruto-desconto),
  CHECK (taxa<=valor_final)
);

ALTER TABLE public.vendas_produtos
  ADD COLUMN venda_balcao_id uuid,
  ADD CONSTRAINT vendas_produtos_balcao_tenant_fkey
    FOREIGN KEY (barbearia_id,venda_balcao_id) REFERENCES public.vendas_balcao(barbearia_id,id);

ALTER TABLE public.financeiro_contas_receber
  ADD COLUMN venda_balcao_id uuid,
  ADD CONSTRAINT financeiro_cr_venda_balcao_tenant_fkey
    FOREIGN KEY (barbearia_id,venda_balcao_id) REFERENCES public.vendas_balcao(barbearia_id,id);

ALTER TABLE public.financeiro_movimentacoes
  ADD COLUMN venda_balcao_id uuid,
  ADD CONSTRAINT financeiro_mov_venda_balcao_tenant_fkey
    FOREIGN KEY (barbearia_id,venda_balcao_id) REFERENCES public.vendas_balcao(barbearia_id,id);

CREATE INDEX vendas_balcao_data_idx ON public.vendas_balcao(barbearia_id,criado_em DESC);
CREATE INDEX vendas_produtos_balcao_idx ON public.vendas_produtos(barbearia_id,venda_balcao_id);

ALTER TABLE public.vendas_balcao ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendas_balcao_admin_leitura ON public.vendas_balcao FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY vendas_balcao_barbeiro_leitura ON public.vendas_balcao FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND profissional_id=public.get_my_profissional_id());
REVOKE ALL ON TABLE public.vendas_balcao FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.vendas_balcao TO authenticated;

CREATE OR REPLACE FUNCTION public.recepcao_profissionais_listar()
RETURNS TABLE(id uuid,nome text,apelido text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.recepcao_assert_operador();
BEGIN
  RETURN QUERY
  SELECT p.id,p.nome,p.apelido
  FROM public.profissionais p
  WHERE p.barbearia_id=v_barbearia AND p.ativo
  ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_fila_devolver(
  p_pendencia_id uuid,
  p_motivo text,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_motivo text:=btrim(COALESCE(p_motivo,''));
BEGIN
  IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_MOTIVO_INVALIDO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_VERSAO_INVALIDA'; END IF;
  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_NAO_ENCONTRADA'; END IF;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_CONFLITO_VERSAO'; END IF;

  UPDATE public.atendimento_pendencias
  SET status='cancelado',updated_at=clock_timestamp()
  WHERE id=v_pendencia.id
  RETURNING * INTO v_pendencia;
  UPDATE public.agendamentos
  SET status='em_atendimento'
  WHERE id=v_pendencia.agendamento_id AND barbearia_id=v_barbearia AND status='aguardando_pagamento';
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_STATUS_INVALIDO'; END IF;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_pendencia.agendamento_id,v_pendencia.id,'cancelado',auth.uid(),'recepcao',
    jsonb_build_object('acao','devolvido_ao_barbeiro','motivo',v_motivo)
  );
  RETURN jsonb_build_object('pendencia_id',v_pendencia.id,'status','cancelado','agendamento_status','em_atendimento');
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_venda_avulsa_concluir(
  p_produtos jsonb,
  p_profissional_id uuid,
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
  v_venda_balcao public.vendas_balcao%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_profissional public.profissionais%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_item record;
  v_count integer;
  v_conta uuid; v_categoria uuid; v_recebivel uuid;
  v_bruto numeric(15,2):=0; v_final numeric(15,2);
  v_linha_bruta numeric(15,2); v_linha_desconto numeric(15,2); v_linha_liquida numeric(15,2);
  v_desconto_restante numeric(15,2); v_bruto_restante numeric(15,2);
  v_comissao_pct numeric(5,2); v_comissao_total numeric(15,2):=0;
  v_saldo_antes integer; v_liquidado boolean;
BEGIN
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'RECEPCAO_VENDA_CHAVE_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text||':recepcao-venda:'||p_chave_idempotencia::text,0));
  SELECT * INTO v_venda_balcao
  FROM public.vendas_balcao
  WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN RETURN jsonb_build_object('idempotente',true,'venda',to_jsonb(v_venda_balcao)); END IF;

  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_INVALIDOS'; END IF;
  IF p_desconto IS NULL OR p_desconto<0 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_DESCONTO_INVALIDO'; END IF;
  IF p_taxa IS NULL OR p_taxa<0 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_TAXA_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PAGAMENTO_INVALIDO'; END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento<current_date THEN RAISE EXCEPTION 'RECEPCAO_VENDA_DATA_INVALIDA'; END IF;

  IF p_profissional_id IS NOT NULL THEN
    SELECT * INTO v_profissional
    FROM public.profissionais
    WHERE id=p_profissional_id AND barbearia_id=v_barbearia AND ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PROFISSIONAL_INVALIDO'; END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT item->>'produto_id'
    FROM jsonb_array_elements(p_produtos) item
    GROUP BY item->>'produto_id'
    HAVING count(*)>1
  ) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_DUPLICADOS'; END IF;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto
    FROM public.produtos
    WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'RECEPCAO_VENDA_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_bruto:=v_bruto+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;

  IF p_desconto>v_bruto THEN RAISE EXCEPTION 'RECEPCAO_VENDA_DESCONTO_INVALIDO'; END IF;
  v_final:=round(v_bruto-p_desconto,2);
  IF p_taxa>v_final THEN RAISE EXCEPTION 'RECEPCAO_VENDA_TAXA_INVALIDA'; END IF;
  v_liquidado:=p_data_recebimento=current_date;

  SELECT id INTO v_conta
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia AND ativa
  ORDER BY conta_principal DESC,created_at,id LIMIT 1;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'RECEPCAO_VENDA_CONTA_NAO_CONFIGURADA'; END IF;
  SELECT id INTO v_categoria
  FROM public.financeiro_categorias
  WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_produtos'
  ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.vendas_balcao(
    barbearia_id,profissional_id,valor_produtos_bruto,desconto,valor_final,taxa,forma_pagamento,
    data_recebimento,chave_idempotencia,criado_por
  ) VALUES (
    v_barbearia,p_profissional_id,v_bruto,round(p_desconto,2),v_final,round(p_taxa,2),p_forma_pagamento,
    p_data_recebimento,p_chave_idempotencia,auth.uid()
  ) RETURNING * INTO v_venda_balcao;

  v_desconto_restante:=v_bruto-v_final;
  v_bruto_restante:=v_bruto;
  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    v_linha_bruta:=round(v_produto.preco_venda*v_item.quantidade,2);
    v_linha_desconto:=CASE WHEN v_bruto_restante=v_linha_bruta THEN v_desconto_restante
      ELSE round((v_bruto-v_final)*v_linha_bruta/v_bruto,2) END;
    v_linha_liquida:=v_linha_bruta-v_linha_desconto;
    v_comissao_pct:=CASE WHEN p_profissional_id IS NULL THEN 0 ELSE COALESCE(v_produto.comissao_percentual,v_profissional.comissao_produtos_percentual,0) END;
    v_saldo_antes:=v_produto.estoque_quantidade;
    UPDATE public.produtos
    SET estoque_quantidade=estoque_quantidade-v_item.quantidade,updated_at=clock_timestamp()
    WHERE id=v_produto.id;
    INSERT INTO public.vendas_produtos(
      barbearia_id,profissional_id,nome_produto,valor_venda,produto_id,quantidade,preco_unitario_snapshot,
      preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,forma_pagamento,chave_idempotencia,
      criado_por,desconto_valor,venda_balcao_id
    ) VALUES (
      v_barbearia,p_profissional_id,v_produto.nome,v_linha_bruta,v_produto.id,v_item.quantidade,v_produto.preco_venda,
      v_produto.preco_custo,'concluida',v_comissao_pct,round(v_linha_liquida*v_comissao_pct/100,2),p_forma_pagamento,
      extensions.uuid_generate_v4(),auth.uid(),v_linha_desconto,v_venda_balcao.id
    ) RETURNING * INTO v_venda;
    INSERT INTO public.estoque_movimentacoes(
      barbearia_id,produto_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por
    ) VALUES (
      v_barbearia,v_produto.id,v_venda.id,'venda',-v_item.quantidade,v_saldo_antes,v_saldo_antes-v_item.quantidade,
      'Venda avulsa na recepcao',auth.uid()
    );
    v_comissao_total:=v_comissao_total+v_venda.comissao_valor;
    v_desconto_restante:=v_desconto_restante-v_linha_desconto;
    v_bruto_restante:=v_bruto_restante-v_linha_bruta;
  END LOOP;

  UPDATE public.vendas_balcao SET comissao_total=v_comissao_total
  WHERE id=v_venda_balcao.id RETURNING * INTO v_venda_balcao;

  INSERT INTO public.financeiro_contas_receber(
    barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
    conta_destino_id,categoria_id,origem,referencia_externa,venda_balcao_id
  ) VALUES (
    v_barbearia,'Venda avulsa de produtos',v_final,round(p_taxa,2),p_data_recebimento,current_date,
    CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
    v_conta,v_categoria,'produto',v_venda_balcao.id::text,v_venda_balcao.id
  ) RETURNING id INTO v_recebivel;
  IF v_liquidado THEN
    INSERT INTO public.financeiro_movimentacoes(
      barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,
      idempotency_key,conta_receber_id,venda_balcao_id,descricao
    ) VALUES (
      v_barbearia,v_conta,'entrada',v_final,current_date,p_data_recebimento,v_categoria,'venda_balcao',
      p_chave_idempotencia::text||':entrada',v_recebivel,v_venda_balcao.id,'Recebimento de venda no balcao'
    );
    IF p_taxa>0 THEN
      INSERT INTO public.financeiro_movimentacoes(
        barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,
        conta_receber_id,venda_balcao_id,descricao
      ) VALUES (
        v_barbearia,v_conta,'saida',round(p_taxa,2),current_date,p_data_recebimento,'taxa_checkout',
        p_chave_idempotencia::text||':taxa',v_recebivel,v_venda_balcao.id,'Taxa de venda no balcao'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('idempotente',false,'venda',to_jsonb(v_venda_balcao));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_INVALIDOS';
END;
$$;

REVOKE ALL ON FUNCTION public.recepcao_profissionais_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_fila_devolver(uuid,text,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_venda_avulsa_concluir(jsonb,uuid,numeric,text,numeric,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recepcao_profissionais_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_fila_devolver(uuid,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_venda_avulsa_concluir(jsonb,uuid,numeric,text,numeric,date,uuid) TO authenticated;

COMMENT ON FUNCTION public.recepcao_fila_devolver(uuid,text,timestamptz) IS
  'Retira uma pendencia da fila, registra o motivo e devolve o agendamento ao barbeiro sem movimentacao financeira.';
COMMENT ON FUNCTION public.recepcao_venda_avulsa_concluir(jsonb,uuid,numeric,text,numeric,date,uuid) IS
  'Conclui um carrinho avulso da recepcao com estoque e financeiro atomicos; profissional responsavel e opcional.';

