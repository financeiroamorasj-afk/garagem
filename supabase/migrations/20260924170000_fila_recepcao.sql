-- Recepção R3: passagem da execução técnica para a fila de cobrança.

ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_status_check;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('pendente','confirmado','em_atendimento','aguardando_pagamento','concluido','cancelado','encaixe'));

CREATE TABLE public.atendimento_pendencias (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE RESTRICT,
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  servico_id uuid REFERENCES public.servicos(id) ON DELETE RESTRICT,
  memoria_corte_id uuid NOT NULL REFERENCES public.cliente_cortes(id) ON DELETE RESTRICT,
  valor_servico numeric(15,2) NOT NULL CHECK (valor_servico >= 0),
  status text NOT NULL DEFAULT 'aguardando_pagamento' CHECK (status IN ('aguardando_pagamento','cobrado','cancelado')),
  chave_idempotencia uuid NOT NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, agendamento_id),
  UNIQUE (barbearia_id, chave_idempotencia)
);

CREATE TABLE public.atendimento_itens_pendentes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  pendencia_id uuid NOT NULL REFERENCES public.atendimento_pendencias(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade integer NOT NULL CHECK (quantidade BETWEEN 1 AND 100),
  preco_unitario_snapshot numeric(15,2) NOT NULL CHECK (preco_unitario_snapshot >= 0),
  adicionado_por_papel text NOT NULL CHECK (adicionado_por_papel IN ('barbeiro','recepcao')),
  adicionado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pendencia_id, produto_id)
);

CREATE TABLE public.atendimento_operacao_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE RESTRICT,
  pendencia_id uuid REFERENCES public.atendimento_pendencias(id) ON DELETE RESTRICT,
  evento text NOT NULL CHECK (evento IN ('enviado_recepcao','carrinho_alterado','cobrado','cancelado')),
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  ator_papel text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atendimento_pendencias_fila_idx ON public.atendimento_pendencias(barbearia_id,status,criado_em);
CREATE INDEX atendimento_itens_pendentes_tenant_idx ON public.atendimento_itens_pendentes(barbearia_id,pendencia_id);
CREATE INDEX atendimento_operacao_log_agendamento_idx ON public.atendimento_operacao_log(barbearia_id,agendamento_id,criado_em);

ALTER TABLE public.atendimento_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_itens_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_operacao_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.atendimento_pendencias, public.atendimento_itens_pendentes, public.atendimento_operacao_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.atendimento_operacao_log_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.barbeiro_atendimento_enviar_recepcao(
  p_agendamento_id uuid,
  p_memoria jsonb,
  p_produtos jsonb,
  p_valor_servico numeric,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_profissional uuid := public.get_my_profissional_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_corte public.cliente_cortes%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_item record;
  v_estilo text;
  v_foto_path text;
  v_foto_mime text;
  v_prefixo text;
  v_count integer;
  v_total_produtos numeric(15,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN RAISE EXCEPTION 'FILA_RECEPCAO_NAO_AUTORIZADO'; END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'FILA_RECEPCAO_MODULO_INATIVO'; END IF;
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'FILA_RECEPCAO_CHAVE_INVALIDA'; END IF;

  SELECT * INTO v_pendencia FROM public.atendimento_pendencias WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN
    IF v_pendencia.agendamento_id<>p_agendamento_id THEN RAISE EXCEPTION 'FILA_RECEPCAO_CHAVE_EM_USO'; END IF;
    RETURN jsonb_build_object('idempotente',true,'modo','recepcao','pendencia_id',v_pendencia.id,'status',v_pendencia.status);
  END IF;

  IF p_valor_servico IS NULL OR p_valor_servico<0 OR p_valor_servico>99999999 THEN RAISE EXCEPTION 'FILA_RECEPCAO_VALOR_INVALIDO'; END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos)>20 THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_INVALIDOS'; END IF;
  IF p_memoria IS NULL OR jsonb_typeof(p_memoria)<>'object' THEN RAISE EXCEPTION 'FILA_RECEPCAO_MEMORIA_INVALIDA'; END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
  WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FILA_RECEPCAO_AGENDAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_agendamento.status<>'em_atendimento' THEN RAISE EXCEPTION 'FILA_RECEPCAO_STATUS_INVALIDO'; END IF;
  IF v_agendamento.cliente_id IS NULL THEN RAISE EXCEPTION 'FILA_RECEPCAO_CLIENTE_OBRIGATORIO'; END IF;

  v_estilo:=btrim(COALESCE(p_memoria->>'estilo',''));
  IF length(v_estilo) NOT BETWEEN 2 AND 80 OR length(COALESCE(p_memoria->>'pentes',''))>120
    OR length(COALESCE(p_memoria->>'acabamento',''))>80 OR length(COALESCE(p_memoria->>'barba',''))>80
    OR length(COALESCE(p_memoria->>'observacoes',''))>1000 OR length(COALESCE(p_memoria->>'preferencias_cliente',''))>1000
  THEN RAISE EXCEPTION 'FILA_RECEPCAO_MEMORIA_INVALIDA'; END IF;

  v_foto_path:=NULLIF(p_memoria->>'foto_path',''); v_foto_mime:=NULLIF(p_memoria->>'foto_mime','');
  v_prefixo:=v_barbearia::text||'/'||v_agendamento.cliente_id::text||'/';
  IF v_foto_path IS NOT NULL AND (v_foto_path NOT LIKE v_prefixo||'%' OR v_foto_mime NOT IN ('image/webp','image/jpeg')
    OR COALESCE((p_memoria->>'foto_bytes')::integer,0) NOT BETWEEN 1 AND 1048576
    OR COALESCE((p_memoria->>'foto_largura')::integer,0) NOT BETWEEN 1 AND 1600
    OR COALESCE((p_memoria->>'foto_altura')::integer,0) NOT BETWEEN 1 AND 1600) THEN RAISE EXCEPTION 'FILA_RECEPCAO_FOTO_INVALIDA'; END IF;
  IF v_foto_path IS NULL AND (v_foto_mime IS NOT NULL OR p_memoria ? 'foto_bytes' OR p_memoria ? 'foto_largura' OR p_memoria ? 'foto_altura') THEN RAISE EXCEPTION 'FILA_RECEPCAO_FOTO_INVALIDA'; END IF;

  SELECT count(*) INTO v_count FROM (SELECT item->>'produto_id' FROM jsonb_array_elements(p_produtos) item GROUP BY item->>'produto_id' HAVING count(*)>1) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_DUPLICADOS'; END IF;
  FOR v_item IN SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'FILA_RECEPCAO_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_total_produtos:=v_total_produtos+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;
  IF round(p_valor_servico,2)+v_total_produtos<=0 THEN RAISE EXCEPTION 'FILA_RECEPCAO_VALOR_INVALIDO'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agendamento.cliente_id::text||':corte',0));
  UPDATE public.cliente_cortes SET ativo=false,arquivado_em=now() WHERE barbearia_id=v_barbearia AND cliente_id=v_agendamento.cliente_id AND ativo;
  INSERT INTO public.cliente_cortes(barbearia_id,cliente_id,agendamento_id,profissional_id,estilo,pentes,acabamento,barba,observacoes,preferencias_cliente,foto_path,foto_mime,foto_bytes,foto_largura,foto_altura,criado_por)
  VALUES(v_barbearia,v_agendamento.cliente_id,v_agendamento.id,v_profissional,v_estilo,NULLIF(btrim(p_memoria->>'pentes'),''),NULLIF(btrim(p_memoria->>'acabamento'),''),NULLIF(btrim(p_memoria->>'barba'),''),NULLIF(btrim(p_memoria->>'observacoes'),''),NULLIF(btrim(p_memoria->>'preferencias_cliente'),''),v_foto_path,v_foto_mime,(p_memoria->>'foto_bytes')::integer,(p_memoria->>'foto_largura')::integer,(p_memoria->>'foto_altura')::integer,auth.uid()) RETURNING * INTO v_corte;
  UPDATE public.clientes SET notas_preferencias=NULLIF(btrim(p_memoria->>'preferencias_cliente'),'') WHERE id=v_agendamento.cliente_id AND barbearia_id=v_barbearia;

  INSERT INTO public.atendimento_pendencias(barbearia_id,agendamento_id,profissional_id,cliente_id,servico_id,memoria_corte_id,valor_servico,chave_idempotencia,criado_por)
  VALUES(v_barbearia,v_agendamento.id,v_profissional,v_agendamento.cliente_id,v_agendamento.servico_id,v_corte.id,round(p_valor_servico,2),p_chave_idempotencia,auth.uid()) RETURNING * INTO v_pendencia;

  FOR v_item IN SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia;
    INSERT INTO public.atendimento_itens_pendentes(barbearia_id,pendencia_id,produto_id,quantidade,preco_unitario_snapshot,adicionado_por_papel,adicionado_por)
    VALUES(v_barbearia,v_pendencia.id,v_produto.id,v_item.quantidade,v_produto.preco_venda,'barbeiro',auth.uid());
  END LOOP;

  UPDATE public.agendamentos SET status='aguardando_pagamento' WHERE id=v_agendamento.id;
  INSERT INTO public.atendimento_operacao_log(barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes)
  VALUES(v_barbearia,v_agendamento.id,v_pendencia.id,'enviado_recepcao',auth.uid(),'barbeiro',jsonb_build_object('valor_servico',round(p_valor_servico,2),'valor_produtos',v_total_produtos,'itens',jsonb_array_length(p_produtos)));

  RETURN jsonb_build_object('idempotente',false,'modo','recepcao','pendencia_id',v_pendencia.id,'status','aguardando_pagamento','corte',public.cliente_corte_json(v_corte));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_INVALIDOS';
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_fila_listar()
RETURNS TABLE (
  pendencia_id uuid, agendamento_id uuid, cliente_id uuid, cliente_nome text, cliente_telefone text,
  profissional_id uuid, profissional_nome text, servico_nome text, valor_servico numeric,
  produtos jsonb, valor_produtos numeric, valor_total numeric, criado_em timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_barbearia uuid:=public.recepcao_assert_operador();
BEGIN
  RETURN QUERY
  SELECT ap.id,ap.agendamento_id,ap.cliente_id,c.nome,c.telefone,ap.profissional_id,COALESCE(p.apelido,p.nome),COALESCE(s.nome,'Serviço'),ap.valor_servico,
    COALESCE(items.produtos,'[]'::jsonb),COALESCE(items.total,0),ap.valor_servico+COALESCE(items.total,0),ap.criado_em,ap.updated_at
  FROM public.atendimento_pendencias ap
  JOIN public.clientes c ON c.id=ap.cliente_id AND c.barbearia_id=ap.barbearia_id
  JOIN public.profissionais p ON p.id=ap.profissional_id AND p.barbearia_id=ap.barbearia_id
  LEFT JOIN public.servicos s ON s.id=ap.servico_id AND s.barbearia_id=ap.barbearia_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',ai.id,'produto_id',ai.produto_id,'nome',pr.nome,'quantidade',ai.quantidade,'preco_unitario',ai.preco_unitario_snapshot,'estoque_disponivel',pr.estoque_quantidade) ORDER BY ai.criado_em,ai.id) produtos,
      sum(ai.preco_unitario_snapshot*ai.quantidade)::numeric total
    FROM public.atendimento_itens_pendentes ai JOIN public.produtos pr ON pr.id=ai.produto_id AND pr.barbearia_id=ai.barbearia_id
    WHERE ai.pendencia_id=ap.id AND ai.barbearia_id=v_barbearia
  ) items ON true
  WHERE ap.barbearia_id=v_barbearia AND ap.status='aguardando_pagamento'
  ORDER BY ap.criado_em,ap.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_bloquear_barbeiro_com_recepcao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.get_my_role()='barbeiro' AND public.modulo_acesso_verificar('recepcao') THEN
    RAISE EXCEPTION 'CHECKOUT_USAR_RECEPCAO';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER atendimento_fechamentos_bloqueia_barbeiro_recepcao
BEFORE INSERT ON public.atendimento_fechamentos FOR EACH ROW EXECUTE FUNCTION public.checkout_bloquear_barbeiro_com_recepcao();

REVOKE ALL ON FUNCTION public.barbeiro_atendimento_enviar_recepcao(uuid,jsonb,jsonb,numeric,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_fila_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.checkout_bloquear_barbeiro_com_recepcao() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_atendimento_enviar_recepcao(uuid,jsonb,jsonb,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_fila_listar() TO authenticated;

COMMENT ON FUNCTION public.barbeiro_atendimento_enviar_recepcao(uuid,jsonb,jsonb,numeric,uuid) IS
  'Registra memória e carrinho pendente sem baixar estoque ou criar financeiro, e envia à fila da recepção.';
