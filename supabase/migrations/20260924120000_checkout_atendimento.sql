-- Checkout transacional do atendimento.
-- Consolida memoria do corte, servico, produtos, comissoes, estoque e financeiro
-- em uma unica operacao idempotente. O valor_final do agendamento permanece sendo
-- apenas a parcela liquida do servico; produtos continuam em vendas_produtos.

CREATE TABLE public.atendimento_fechamentos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL,
  profissional_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'concluido' CHECK (status IN ('concluido','estornado')),
  servico_nome_snapshot text NOT NULL,
  valor_servico_bruto numeric(15,2) NOT NULL CHECK (valor_servico_bruto >= 0),
  valor_produtos_bruto numeric(15,2) NOT NULL DEFAULT 0 CHECK (valor_produtos_bruto >= 0),
  desconto numeric(15,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  valor_servico_liquido numeric(15,2) NOT NULL CHECK (valor_servico_liquido >= 0),
  valor_produtos_liquido numeric(15,2) NOT NULL CHECK (valor_produtos_liquido >= 0),
  valor_final numeric(15,2) NOT NULL CHECK (valor_final >= 0),
  taxa numeric(15,2) NOT NULL DEFAULT 0 CHECK (taxa >= 0),
  valor_liquido numeric(15,2) GENERATED ALWAYS AS (valor_final - taxa) STORED,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('dinheiro','pix','debito','credito','outro')),
  data_recebimento date NOT NULL,
  comissao_servico_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (comissao_servico_percentual BETWEEN 0 AND 100),
  comissao_servico_valor numeric(15,2) NOT NULL DEFAULT 0 CHECK (comissao_servico_valor >= 0),
  comissao_produtos_valor numeric(15,2) NOT NULL DEFAULT 0 CHECK (comissao_produtos_valor >= 0),
  comissao_total numeric(15,2) NOT NULL DEFAULT 0 CHECK (comissao_total >= 0),
  chave_idempotencia uuid NOT NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  estornado_por uuid REFERENCES auth.users(id),
  estornado_em timestamptz,
  motivo_estorno text,
  UNIQUE (barbearia_id,id),
  UNIQUE (barbearia_id,agendamento_id),
  UNIQUE (barbearia_id,chave_idempotencia),
  CONSTRAINT atendimento_fechamento_agendamento_tenant_fkey FOREIGN KEY (barbearia_id,agendamento_id)
    REFERENCES public.agendamentos(barbearia_id,id),
  CONSTRAINT atendimento_fechamento_profissional_tenant_fkey FOREIGN KEY (barbearia_id,profissional_id)
    REFERENCES public.profissionais(barbearia_id,id),
  CONSTRAINT atendimento_fechamento_cliente_tenant_fkey FOREIGN KEY (barbearia_id,cliente_id)
    REFERENCES public.clientes(barbearia_id,id),
  CHECK (desconto <= valor_servico_bruto + valor_produtos_bruto),
  CHECK (valor_final = valor_servico_liquido + valor_produtos_liquido),
  CHECK (valor_final = valor_servico_bruto + valor_produtos_bruto - desconto),
  CHECK (taxa <= valor_final),
  CHECK ((status='concluido' AND estornado_em IS NULL) OR (status='estornado' AND estornado_em IS NOT NULL))
);

ALTER TABLE public.vendas_produtos
  ADD COLUMN fechamento_id uuid,
  ADD COLUMN desconto_valor numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN valor_liquido numeric(15,2) GENERATED ALWAYS AS (valor_venda-desconto_valor) STORED;

ALTER TABLE public.vendas_produtos
  ADD CONSTRAINT vendas_produtos_desconto_check CHECK (desconto_valor >= 0 AND desconto_valor <= valor_venda),
  ADD CONSTRAINT vendas_produtos_valor_liquido_check CHECK (valor_liquido = valor_venda - desconto_valor),
  ADD CONSTRAINT vendas_produtos_fechamento_tenant_fkey FOREIGN KEY (barbearia_id,fechamento_id)
    REFERENCES public.atendimento_fechamentos(barbearia_id,id);

ALTER TABLE public.financeiro_contas_receber
  ADD COLUMN fechamento_id uuid,
  ADD CONSTRAINT financeiro_cr_fechamento_tenant_fkey FOREIGN KEY (barbearia_id,fechamento_id)
    REFERENCES public.atendimento_fechamentos(barbearia_id,id);

ALTER TABLE public.financeiro_movimentacoes
  ADD COLUMN fechamento_id uuid,
  ADD CONSTRAINT financeiro_mov_fechamento_tenant_fkey FOREIGN KEY (barbearia_id,fechamento_id)
    REFERENCES public.atendimento_fechamentos(barbearia_id,id);

CREATE UNIQUE INDEX financeiro_cr_checkout_componente_unique
  ON public.financeiro_contas_receber(barbearia_id,fechamento_id,origem)
  WHERE fechamento_id IS NOT NULL;

CREATE TABLE public.estoque_movimentacoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  fechamento_id uuid,
  venda_produto_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('venda','estorno','entrada','ajuste')),
  quantidade integer NOT NULL CHECK (quantidade <> 0),
  saldo_antes integer NOT NULL CHECK (saldo_antes >= 0),
  saldo_depois integer NOT NULL CHECK (saldo_depois >= 0),
  descricao text,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id,id),
  CONSTRAINT estoque_mov_fechamento_tenant_fkey FOREIGN KEY (barbearia_id,fechamento_id)
    REFERENCES public.atendimento_fechamentos(barbearia_id,id),
  CONSTRAINT estoque_mov_venda_tenant_fkey FOREIGN KEY (barbearia_id,venda_produto_id)
    REFERENCES public.vendas_produtos(barbearia_id,id),
  CHECK (saldo_depois = saldo_antes + quantidade)
);

CREATE INDEX estoque_mov_produto_data_idx ON public.estoque_movimentacoes(barbearia_id,produto_id,criado_em DESC);
CREATE INDEX atendimento_fechamentos_profissional_data_idx ON public.atendimento_fechamentos(barbearia_id,profissional_id,criado_em DESC);

ALTER TABLE public.atendimento_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY atendimento_fechamentos_admin_leitura ON public.atendimento_fechamentos FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY atendimento_fechamentos_barbeiro_leitura ON public.atendimento_fechamentos FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND profissional_id=public.get_my_profissional_id());
CREATE POLICY estoque_movimentacoes_admin_leitura ON public.estoque_movimentacoes FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY estoque_movimentacoes_barbeiro_leitura ON public.estoque_movimentacoes FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND EXISTS (
    SELECT 1 FROM public.atendimento_fechamentos f
    WHERE f.id=fechamento_id AND f.barbearia_id=estoque_movimentacoes.barbearia_id
      AND f.profissional_id=public.get_my_profissional_id()
  ));

REVOKE ALL ON TABLE public.atendimento_fechamentos,public.estoque_movimentacoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.atendimento_fechamentos,public.estoque_movimentacoes TO authenticated;

CREATE OR REPLACE FUNCTION public.barbeiro_checkout_concluir(
  p_agendamento_id uuid,
  p_memoria jsonb,
  p_produtos jsonb,
  p_valor_servico numeric,
  p_desconto numeric,
  p_forma_pagamento text,
  p_taxa numeric,
  p_data_recebimento date,
  p_chave_idempotencia uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_profissional uuid:=public.get_my_profissional_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_servico public.servicos%ROWTYPE;
  v_fechamento public.atendimento_fechamentos%ROWTYPE;
  v_corte public.cliente_cortes%ROWTYPE;
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
  v_saldo_antes integer; v_prefixo text; v_liquidado boolean; v_competencia date;
  v_estilo text; v_foto_path text; v_foto_mime text; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_NAO_AUTORIZADO';
  END IF;
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CHAVE_INVALIDA'; END IF;
  SELECT * INTO v_fechamento FROM public.atendimento_fechamentos
  WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN
    IF v_fechamento.agendamento_id<>p_agendamento_id THEN RAISE EXCEPTION 'CHECKOUT_CHAVE_EM_USO'; END IF;
    RETURN jsonb_build_object('idempotente',true,'fechamento',to_jsonb(v_fechamento));
  END IF;

  IF p_valor_servico IS NULL OR p_valor_servico<0 OR p_valor_servico>99999999 THEN RAISE EXCEPTION 'CHECKOUT_VALOR_INVALIDO'; END IF;
  IF p_desconto IS NULL OR p_desconto<0 THEN RAISE EXCEPTION 'CHECKOUT_DESCONTO_INVALIDO'; END IF;
  IF p_taxa IS NULL OR p_taxa<0 THEN RAISE EXCEPTION 'CHECKOUT_TAXA_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'CHECKOUT_PAGAMENTO_INVALIDO'; END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento<current_date THEN RAISE EXCEPTION 'CHECKOUT_DATA_RECEBIMENTO_INVALIDA'; END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos)>20 THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_INVALIDOS'; END IF;
  IF p_memoria IS NULL OR jsonb_typeof(p_memoria)<>'object' THEN RAISE EXCEPTION 'CHECKOUT_MEMORIA_INVALIDA'; END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
  WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_AGENDAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_agendamento.status<>'em_atendimento' THEN RAISE EXCEPTION 'CHECKOUT_STATUS_INVALIDO'; END IF;
  IF v_agendamento.cliente_id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CLIENTE_OBRIGATORIO'; END IF;
  SELECT * INTO v_servico FROM public.servicos WHERE id=v_agendamento.servico_id AND barbearia_id=v_barbearia;

  v_estilo:=btrim(COALESCE(p_memoria->>'estilo',''));
  IF length(v_estilo) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'CHECKOUT_MEMORIA_INVALIDA'; END IF;
  IF length(COALESCE(p_memoria->>'pentes',''))>120 OR length(COALESCE(p_memoria->>'acabamento',''))>80
    OR length(COALESCE(p_memoria->>'barba',''))>80 OR length(COALESCE(p_memoria->>'observacoes',''))>1000
    OR length(COALESCE(p_memoria->>'preferencias_cliente',''))>1000 THEN RAISE EXCEPTION 'CHECKOUT_MEMORIA_INVALIDA'; END IF;
  v_foto_path:=NULLIF(p_memoria->>'foto_path',''); v_foto_mime:=NULLIF(p_memoria->>'foto_mime','');
  v_prefixo:=v_barbearia::text||'/'||v_agendamento.cliente_id::text||'/';
  IF v_foto_path IS NOT NULL AND (v_foto_path NOT LIKE v_prefixo||'%' OR v_foto_mime NOT IN ('image/webp','image/jpeg')
    OR COALESCE((p_memoria->>'foto_bytes')::integer,0) NOT BETWEEN 1 AND 1048576
    OR COALESCE((p_memoria->>'foto_largura')::integer,0) NOT BETWEEN 1 AND 1600
    OR COALESCE((p_memoria->>'foto_altura')::integer,0) NOT BETWEEN 1 AND 1600) THEN RAISE EXCEPTION 'CHECKOUT_FOTO_INVALIDA'; END IF;
  IF v_foto_path IS NULL AND (v_foto_mime IS NOT NULL OR p_memoria ? 'foto_bytes' OR p_memoria ? 'foto_largura' OR p_memoria ? 'foto_altura') THEN
    RAISE EXCEPTION 'CHECKOUT_FOTO_INVALIDA';
  END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT item->>'produto_id' id FROM jsonb_array_elements(p_produtos) item GROUP BY item->>'produto_id' HAVING count(*)>1
  ) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_DUPLICADOS'; END IF;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade<1 OR v_item.quantidade>100 THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'CHECKOUT_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_produtos_bruto:=v_produtos_bruto+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;

  v_bruto:=round(p_valor_servico,2)+v_produtos_bruto;
  IF v_bruto<=0 OR p_desconto>v_bruto THEN RAISE EXCEPTION 'CHECKOUT_DESCONTO_INVALIDO'; END IF;
  v_final:=round(v_bruto-p_desconto,2);
  IF p_taxa>v_final THEN RAISE EXCEPTION 'CHECKOUT_TAXA_INVALIDA'; END IF;
  v_servico_liquido:=round(v_final*round(p_valor_servico,2)/v_bruto,2);
  v_produtos_liquido:=v_final-v_servico_liquido;
  v_taxa_servico:=CASE WHEN v_final=0 THEN 0 ELSE round(p_taxa*v_servico_liquido/v_final,2) END;
  v_taxa_produtos:=round(p_taxa-v_taxa_servico,2);
  v_comissao_pct:=COALESCE(v_servico.comissao_percentual,(SELECT comissao_percentual FROM public.profissionais WHERE id=v_profissional),0);
  v_competencia:=(v_agendamento.data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
  v_liquidado:=p_data_recebimento=current_date;

  SELECT id INTO v_conta FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia AND ativa ORDER BY conta_principal DESC,created_at,id LIMIT 1;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CONTA_NAO_CONFIGURADA'; END IF;
  SELECT id INTO v_categoria_servico FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_servicos' ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_categoria_produto FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_produtos' ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.atendimento_fechamentos(
    barbearia_id,agendamento_id,profissional_id,cliente_id,servico_nome_snapshot,valor_servico_bruto,
    valor_produtos_bruto,desconto,valor_servico_liquido,valor_produtos_liquido,valor_final,taxa,forma_pagamento,
    data_recebimento,comissao_servico_percentual,comissao_servico_valor,chave_idempotencia,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.id,v_profissional,v_agendamento.cliente_id,COALESCE(v_servico.nome,'Servico'),round(p_valor_servico,2),
    v_produtos_bruto,round(p_desconto,2),v_servico_liquido,v_produtos_liquido,v_final,round(p_taxa,2),p_forma_pagamento,
    p_data_recebimento,v_comissao_pct,round(v_servico_liquido*v_comissao_pct/100,2),p_chave_idempotencia,auth.uid()
  ) RETURNING * INTO v_fechamento;

  v_desconto_produtos_restante:=v_produtos_bruto-v_produtos_liquido;
  v_bruto_produtos_restante:=v_produtos_bruto;
  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    v_linha_bruta:=round(v_produto.preco_venda*v_item.quantidade,2);
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
      v_barbearia,v_agendamento.id,v_profissional,v_produto.nome,v_linha_bruta,v_produto.id,v_agendamento.cliente_id,v_item.quantidade,
      v_produto.preco_venda,v_produto.preco_custo,'concluida',COALESCE(v_produto.comissao_percentual,0),
      round(v_linha_liquida*COALESCE(v_produto.comissao_percentual,0)/100,2),p_forma_pagamento,
      extensions.uuid_generate_v4(),auth.uid(),v_fechamento.id,v_linha_desconto
    ) RETURNING * INTO v_venda;
    INSERT INTO public.estoque_movimentacoes(barbearia_id,produto_id,fechamento_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por)
    VALUES(v_barbearia,v_produto.id,v_fechamento.id,v_venda.id,'venda',-v_item.quantidade,v_saldo_antes,v_saldo_antes-v_item.quantidade,'Venda no atendimento',auth.uid());
    v_comissao_produtos:=v_comissao_produtos+v_venda.comissao_valor;
    v_desconto_produtos_restante:=v_desconto_produtos_restante-v_linha_desconto;
    v_bruto_produtos_restante:=v_bruto_produtos_restante-v_linha_bruta;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agendamento.cliente_id::text||':corte',0));
  UPDATE public.cliente_cortes SET ativo=false,arquivado_em=now()
  WHERE barbearia_id=v_barbearia AND cliente_id=v_agendamento.cliente_id AND ativo;
  INSERT INTO public.cliente_cortes(
    barbearia_id,cliente_id,agendamento_id,profissional_id,estilo,pentes,acabamento,barba,observacoes,
    preferencias_cliente,foto_path,foto_mime,foto_bytes,foto_largura,foto_altura,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.cliente_id,v_agendamento.id,v_profissional,v_estilo,NULLIF(btrim(p_memoria->>'pentes'),''),
    NULLIF(btrim(p_memoria->>'acabamento'),''),NULLIF(btrim(p_memoria->>'barba'),''),NULLIF(btrim(p_memoria->>'observacoes'),''),
    NULLIF(btrim(p_memoria->>'preferencias_cliente'),''),v_foto_path,v_foto_mime,(p_memoria->>'foto_bytes')::integer,
    (p_memoria->>'foto_largura')::integer,(p_memoria->>'foto_altura')::integer,auth.uid()
  ) RETURNING * INTO v_corte;
  UPDATE public.clientes SET notas_preferencias=NULLIF(btrim(p_memoria->>'preferencias_cliente'),'')
  WHERE id=v_agendamento.cliente_id AND barbearia_id=v_barbearia;

  IF v_servico_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Atendimento - '||COALESCE(v_servico.nome,'Servico'),v_servico_liquido,v_taxa_servico,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_agendamento.cliente_id,v_categoria_servico,'servico',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
      VALUES(v_barbearia,v_conta,'entrada',v_servico_liquido,v_competencia,p_data_recebimento,v_categoria_servico,'checkout',p_chave_idempotencia::text||':servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento do atendimento');
      IF v_taxa_servico>0 THEN
        INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
        VALUES(v_barbearia,v_conta,'saida',v_taxa_servico,v_competencia,p_data_recebimento,'taxa_checkout',p_chave_idempotencia::text||':taxa-servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa do atendimento');
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
      v_conta,v_agendamento.cliente_id,v_categoria_produto,'produto',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
      VALUES(v_barbearia,v_conta,'entrada',v_produtos_liquido,v_competencia,p_data_recebimento,v_categoria_produto,'checkout',p_chave_idempotencia::text||':produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento dos produtos');
      IF v_taxa_produtos>0 THEN
        INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
        VALUES(v_barbearia,v_conta,'saida',v_taxa_produtos,v_competencia,p_data_recebimento,'taxa_checkout',p_chave_idempotencia::text||':taxa-produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa dos produtos');
      END IF;
    END IF;
  END IF;

  UPDATE public.atendimento_fechamentos SET comissao_produtos_valor=v_comissao_produtos,
    comissao_total=comissao_servico_valor+v_comissao_produtos WHERE id=v_fechamento.id RETURNING * INTO v_fechamento;
  UPDATE public.agendamentos SET status='concluido',valor_final=v_servico_liquido,
    pagamento_status=CASE WHEN v_liquidado THEN 'pago' ELSE 'pendente' END,
    pagamento_provedor=p_forma_pagamento,pagamento_referencia=v_fechamento.id::text WHERE id=v_agendamento.id;

  RETURN jsonb_build_object('idempotente',false,'fechamento',to_jsonb(v_fechamento),'corte',public.cliente_corte_json(v_corte));
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_INVALIDOS';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_checkout_estornar(p_fechamento_id uuid,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_f public.atendimento_fechamentos%ROWTYPE; v_venda public.vendas_produtos%ROWTYPE; v_saldo integer;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'CHECKOUT_ESTORNO_NAO_AUTORIZADO'; END IF;
  IF length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'CHECKOUT_ESTORNO_MOTIVO_INVALIDO'; END IF;
  SELECT * INTO v_f FROM public.atendimento_fechamentos WHERE id=p_fechamento_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_NAO_ENCONTRADO'; END IF;
  IF v_f.status<>'concluido' THEN RAISE EXCEPTION 'CHECKOUT_JA_ESTORNADO'; END IF;
  FOR v_venda IN SELECT * FROM public.vendas_produtos WHERE barbearia_id=v_barbearia AND fechamento_id=v_f.id AND status='concluida' ORDER BY produto_id FOR UPDATE
  LOOP
    SELECT estoque_quantidade INTO v_saldo FROM public.produtos WHERE id=v_venda.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    UPDATE public.produtos SET estoque_quantidade=estoque_quantidade+v_venda.quantidade,updated_at=clock_timestamp() WHERE id=v_venda.produto_id;
    UPDATE public.vendas_produtos SET status='cancelada' WHERE id=v_venda.id;
    INSERT INTO public.estoque_movimentacoes(barbearia_id,produto_id,fechamento_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por)
    VALUES(v_barbearia,v_venda.produto_id,v_f.id,v_venda.id,'estorno',v_venda.quantidade,v_saldo,v_saldo+v_venda.quantidade,'Estorno: '||btrim(p_motivo),auth.uid());
  END LOOP;
  UPDATE public.financeiro_contas_receber SET status='estornado',updated_at=now() WHERE barbearia_id=v_barbearia AND fechamento_id=v_f.id AND status IN ('previsto','liquidado');
  UPDATE public.financeiro_movimentacoes SET status='estornado' WHERE barbearia_id=v_barbearia AND fechamento_id=v_f.id AND status='efetivado';
  UPDATE public.atendimento_fechamentos SET status='estornado',estornado_por=auth.uid(),estornado_em=now(),motivo_estorno=btrim(p_motivo) WHERE id=v_f.id RETURNING * INTO v_f;
  UPDATE public.agendamentos SET pagamento_status='estornado' WHERE id=v_f.agendamento_id AND barbearia_id=v_barbearia;
  RETURN to_jsonb(v_f);
END;
$$;

CREATE OR REPLACE FUNCTION public.financeiro_listar_titulos(
  p_tipo text, p_data_inicio date, p_data_fim date, p_status text DEFAULT NULL,
  p_ordenar_por text DEFAULT 'data', p_direcao text DEFAULT 'asc',
  p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_barbearia uuid; v_total bigint; v_items jsonb;
BEGIN
  v_barbearia:=public.financeiro_assert_admin();
  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar','receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio>p_data_fim OR (p_data_fim-p_data_inicio)>365 THEN RAISE EXCEPTION 'FINANCEIRO_PERIODO_INVALIDO'; END IF;
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
      (cp.envelope_resgate_transacao_id IS NOT NULL) possui_reserva,NULL::uuid fechamento_id,false pode_estornar
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
      (cr.origem='manual' AND cr.status='previsto'),false,cr.fechamento_id,
      (cr.fechamento_id IS NOT NULL AND cr.status IN ('previsto','liquidado'))
    FROM public.financeiro_contas_receber cr
    LEFT JOIN public.financeiro_categorias cat ON cat.id=cr.categoria_id AND cat.barbearia_id=v_barbearia
    LEFT JOIN public.clientes cli ON cli.id=cr.cliente_id AND cli.barbearia_id=v_barbearia
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id=cr.conta_destino_id AND cb.barbearia_id=v_barbearia
    WHERE p_tipo='receber' AND cr.barbearia_id=v_barbearia AND cr.data_previsao BETWEEN p_data_inicio AND p_data_fim AND (p_status IS NULL OR cr.status=p_status)
  ), ordenados AS (
    SELECT *,row_number() OVER (ORDER BY
      CASE WHEN p_direcao='asc' AND p_ordenar_por='data' THEN data_evento END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='data' THEN data_evento END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='descricao' THEN descricao END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='descricao' THEN descricao END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='valor' THEN valor END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='valor' THEN valor END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='status' THEN status END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='status' THEN status END DESC,id
    ) ordem FROM titulos
  ), pagina AS (SELECT * FROM ordenados ORDER BY ordem OFFSET (p_pagina-1)*p_por_pagina LIMIT p_por_pagina)
  SELECT (SELECT count(*) FROM titulos),COALESCE((SELECT jsonb_agg(to_jsonb(p)-'ordem' ORDER BY p.ordem) FROM pagina p),'[]'::jsonb) INTO v_total,v_items;
  RETURN jsonb_build_object('items',v_items,'pagina',p_pagina,'por_pagina',p_por_pagina,'total_itens',v_total,'total_paginas',CASE WHEN v_total=0 THEN 0 ELSE ceil(v_total::numeric/p_por_pagina)::integer END);
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
      COALESCE(sum(vp.valor_liquido) FILTER(WHERE vp.status='concluida'),0) valor_produtos,
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

REVOKE ALL ON FUNCTION public.barbeiro_checkout_concluir(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_checkout_estornar(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.barbeiro_atendimento_concluir(uuid,text,text,text,text,text,text,text,text,integer,integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_checkout_concluir(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_checkout_estornar(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.barbeiro_checkout_concluir(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid)
  IS 'Fecha atendimento de forma atomica: memoria, produtos, estoque, comissoes e financeiro.';
COMMENT ON FUNCTION public.admin_checkout_estornar(uuid,text)
  IS 'Estorna checkout, financeiro e estoque preservando a memoria do atendimento para auditoria.';
