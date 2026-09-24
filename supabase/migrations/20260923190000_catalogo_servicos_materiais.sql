-- Catálogo operacional real de serviços e materiais por barbearia.

CREATE TABLE public.materiais_servico (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('insumo', 'ferramenta')),
  unidade text NOT NULL DEFAULT 'unidade',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_servico_nome_check CHECK (length(btrim(nome)) BETWEEN 2 AND 100),
  CONSTRAINT materiais_servico_unidade_check CHECK (length(btrim(unidade)) BETWEEN 1 AND 30)
);

CREATE UNIQUE INDEX materiais_servico_nome_ativo_uidx
  ON public.materiais_servico (barbearia_id, lower(btrim(nome))) WHERE ativo;
CREATE UNIQUE INDEX materiais_servico_tenant_id_uidx
  ON public.materiais_servico (barbearia_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS servicos_tenant_id_uidx
  ON public.servicos (barbearia_id, id);

CREATE TABLE public.servicos_materiais (
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL,
  material_id uuid NOT NULL,
  quantidade numeric(10,3) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  observacao text,
  PRIMARY KEY (servico_id, material_id),
  CONSTRAINT servicos_materiais_servico_tenant_fkey
    FOREIGN KEY (barbearia_id, servico_id) REFERENCES public.servicos(barbearia_id, id) ON DELETE CASCADE,
  CONSTRAINT servicos_materiais_material_tenant_fkey
    FOREIGN KEY (barbearia_id, material_id) REFERENCES public.materiais_servico(barbearia_id, id),
  CONSTRAINT servicos_materiais_observacao_check
    CHECK (observacao IS NULL OR length(btrim(observacao)) <= 200)
);

CREATE INDEX servicos_materiais_tenant_idx ON public.servicos_materiais (barbearia_id, material_id);

ALTER TABLE public.materiais_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos_materiais ENABLE ROW LEVEL SECURITY;

CREATE POLICY materiais_servico_leitura_tenant ON public.materiais_servico
  FOR SELECT USING (barbearia_id = public.get_my_barbearia_id());
CREATE POLICY servicos_materiais_leitura_tenant ON public.servicos_materiais
  FOR SELECT USING (barbearia_id = public.get_my_barbearia_id());

REVOKE ALL ON public.materiais_servico, public.servicos_materiais FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.materiais_servico, public.servicos_materiais TO authenticated;

CREATE OR REPLACE FUNCTION public.catalogo_assert_admin()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'CATALOGO_NAO_AUTORIZADO';
  END IF;
  RETURN v_barbearia;
END;
$$;

CREATE OR REPLACE FUNCTION public.materiais_catalogo_listar(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (id uuid, nome text, tipo text, unidade text, ativo boolean, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.nome, m.tipo, m.unidade, m.ativo, m.updated_at
  FROM public.materiais_servico m
  WHERE m.barbearia_id = public.catalogo_assert_admin()
    AND (p_incluir_inativos OR m.ativo)
  ORDER BY m.ativo DESC, lower(m.nome), m.id;
$$;

CREATE OR REPLACE FUNCTION public.servicos_catalogo_listar(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (
  id uuid, nome text, preco numeric, duracao_minutos integer, descricao text,
  comissao_percentual numeric, ativo boolean, updated_at timestamptz, materiais jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.nome, s.preco, s.duracao_minutos, s.descricao,
    s.comissao_percentual, s.ativo, s.updated_at,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'unidade', m.unidade,
        'quantidade', sm.quantidade, 'observacao', sm.observacao, 'ativo', m.ativo
      ) ORDER BY lower(m.nome)) FILTER (WHERE m.id IS NOT NULL),
      '[]'::jsonb
    ) AS materiais
  FROM public.servicos s
  LEFT JOIN public.servicos_materiais sm
    ON sm.servico_id = s.id AND sm.barbearia_id = s.barbearia_id
  LEFT JOIN public.materiais_servico m
    ON m.id = sm.material_id AND m.barbearia_id = sm.barbearia_id
  WHERE s.barbearia_id = public.catalogo_assert_admin()
    AND (p_incluir_inativos OR s.ativo)
  GROUP BY s.id
  ORDER BY s.ativo DESC, lower(s.nome), s.id;
$$;

CREATE OR REPLACE FUNCTION public.material_catalogo_criar(p_nome text, p_tipo text, p_unidade text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_id uuid; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('insumo', 'ferramenta') THEN RAISE EXCEPTION 'CATALOGO_TIPO_INVALIDO'; END IF;
  IF p_unidade IS NULL OR length(btrim(p_unidade)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'CATALOGO_UNIDADE_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':material:' || lower(btrim(p_nome)), 0));
  IF EXISTS (SELECT 1 FROM public.materiais_servico WHERE barbearia_id=v_barbearia AND lower(btrim(nome))=lower(btrim(p_nome))) THEN
    RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO';
  END IF;
  INSERT INTO public.materiais_servico(barbearia_id,nome,tipo,unidade)
  VALUES(v_barbearia,btrim(p_nome),p_tipo,btrim(p_unidade)) RETURNING id,updated_at INTO v_id,v_updated;
  RETURN jsonb_build_object('id',v_id,'updated_at',v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.material_catalogo_atualizar(
  p_id uuid, p_nome text, p_tipo text, p_unidade text, p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_atual public.materiais_servico%ROWTYPE; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('insumo', 'ferramenta') THEN RAISE EXCEPTION 'CATALOGO_TIPO_INVALIDO'; END IF;
  IF p_unidade IS NULL OR length(btrim(p_unidade)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'CATALOGO_UNIDADE_INVALIDA'; END IF;
  SELECT * INTO v_atual FROM public.materiais_servico WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF v_atual.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'CATALOGO_CONFLITO_VERSAO'; END IF;
  IF EXISTS (SELECT 1 FROM public.materiais_servico WHERE barbearia_id=v_barbearia AND id<>p_id AND lower(btrim(nome))=lower(btrim(p_nome))) THEN
    RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO';
  END IF;
  UPDATE public.materiais_servico SET nome=btrim(p_nome),tipo=p_tipo,unidade=btrim(p_unidade),updated_at=clock_timestamp()
  WHERE id=p_id RETURNING updated_at INTO v_updated;
  RETURN jsonb_build_object('id',p_id,'updated_at',v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.material_catalogo_definir_ativo(p_id uuid, p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_material public.materiais_servico%ROWTYPE;
BEGIN
  SELECT * INTO v_material FROM public.materiais_servico WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF NOT p_ativo AND EXISTS (
    SELECT 1 FROM public.servicos_materiais sm JOIN public.servicos s ON s.id=sm.servico_id AND s.barbearia_id=sm.barbearia_id
    WHERE sm.barbearia_id=v_barbearia AND sm.material_id=p_id AND s.ativo
  ) THEN RAISE EXCEPTION 'CATALOGO_MATERIAL_EM_USO'; END IF;
  IF p_ativo AND EXISTS (SELECT 1 FROM public.materiais_servico WHERE barbearia_id=v_barbearia AND id<>p_id AND ativo AND lower(btrim(nome))=lower(btrim(v_material.nome))) THEN
    RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO';
  END IF;
  UPDATE public.materiais_servico SET ativo=p_ativo,updated_at=clock_timestamp() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'ativo',p_ativo);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalogo_validar_materiais(p_barbearia uuid, p_materiais jsonb)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_itens jsonb := COALESCE(p_materiais,'[]'::jsonb);
BEGIN
  IF jsonb_typeof(v_itens) <> 'array' THEN RAISE EXCEPTION 'CATALOGO_MATERIAIS_INVALIDOS'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) x(material_id uuid, quantidade numeric, observacao text)
    LEFT JOIN public.materiais_servico m ON m.id=x.material_id AND m.barbearia_id=p_barbearia AND m.ativo
    WHERE m.id IS NULL OR x.quantidade IS NULL OR x.quantidade <= 0
      OR (x.observacao IS NOT NULL AND length(btrim(x.observacao)) > 200)
  ) THEN RAISE EXCEPTION 'CATALOGO_MATERIAIS_INVALIDOS'; END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(v_itens) x(material_id uuid)) <>
     (SELECT count(DISTINCT material_id) FROM jsonb_to_recordset(v_itens) x(material_id uuid)) THEN
    RAISE EXCEPTION 'CATALOGO_MATERIAIS_INVALIDOS';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.servico_catalogo_criar(
  p_nome text, p_preco numeric, p_duracao_minutos integer, p_descricao text,
  p_comissao_percentual numeric, p_materiais jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_id uuid; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_preco IS NULL OR p_preco < 0 THEN RAISE EXCEPTION 'CATALOGO_PRECO_INVALIDO'; END IF;
  IF p_duracao_minutos IS NULL OR p_duracao_minutos NOT BETWEEN 5 AND 480 THEN RAISE EXCEPTION 'CATALOGO_DURACAO_INVALIDA'; END IF;
  IF p_descricao IS NOT NULL AND length(btrim(p_descricao)) > 1000 THEN RAISE EXCEPTION 'CATALOGO_DESCRICAO_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN RAISE EXCEPTION 'CATALOGO_COMISSAO_INVALIDA'; END IF;
  PERFORM public.catalogo_validar_materiais(v_barbearia,p_materiais);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':servico:' || lower(btrim(p_nome)), 0));
  IF EXISTS (SELECT 1 FROM public.servicos WHERE barbearia_id=v_barbearia AND lower(btrim(nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO'; END IF;
  INSERT INTO public.servicos(barbearia_id,nome,preco,duracao_minutos,descricao,comissao_percentual,ativo)
  VALUES(v_barbearia,btrim(p_nome),round(p_preco,2),p_duracao_minutos,NULLIF(btrim(p_descricao),''),p_comissao_percentual,true)
  RETURNING id,updated_at INTO v_id,v_updated;
  INSERT INTO public.servicos_materiais(barbearia_id,servico_id,material_id,quantidade,observacao)
  SELECT v_barbearia,v_id,x.material_id,x.quantidade,NULLIF(btrim(x.observacao),'')
  FROM jsonb_to_recordset(COALESCE(p_materiais,'[]'::jsonb)) x(material_id uuid, quantidade numeric, observacao text);
  RETURN jsonb_build_object('id',v_id,'updated_at',v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.servico_catalogo_atualizar(
  p_id uuid, p_nome text, p_preco numeric, p_duracao_minutos integer, p_descricao text,
  p_comissao_percentual numeric, p_materiais jsonb, p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_atual public.servicos%ROWTYPE; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_preco IS NULL OR p_preco < 0 THEN RAISE EXCEPTION 'CATALOGO_PRECO_INVALIDO'; END IF;
  IF p_duracao_minutos IS NULL OR p_duracao_minutos NOT BETWEEN 5 AND 480 THEN RAISE EXCEPTION 'CATALOGO_DURACAO_INVALIDA'; END IF;
  IF p_descricao IS NOT NULL AND length(btrim(p_descricao)) > 1000 THEN RAISE EXCEPTION 'CATALOGO_DESCRICAO_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN RAISE EXCEPTION 'CATALOGO_COMISSAO_INVALIDA'; END IF;
  PERFORM public.catalogo_validar_materiais(v_barbearia,p_materiais);
  SELECT * INTO v_atual FROM public.servicos WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF v_atual.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'CATALOGO_CONFLITO_VERSAO'; END IF;
  IF EXISTS (SELECT 1 FROM public.servicos WHERE barbearia_id=v_barbearia AND id<>p_id AND lower(btrim(nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO'; END IF;
  UPDATE public.servicos SET nome=btrim(p_nome),preco=round(p_preco,2),duracao_minutos=p_duracao_minutos,
    descricao=NULLIF(btrim(p_descricao),''),comissao_percentual=p_comissao_percentual,updated_at=clock_timestamp()
  WHERE id=p_id RETURNING updated_at INTO v_updated;
  DELETE FROM public.servicos_materiais WHERE servico_id=p_id AND barbearia_id=v_barbearia;
  INSERT INTO public.servicos_materiais(barbearia_id,servico_id,material_id,quantidade,observacao)
  SELECT v_barbearia,p_id,x.material_id,x.quantidade,NULLIF(btrim(x.observacao),'')
  FROM jsonb_to_recordset(COALESCE(p_materiais,'[]'::jsonb)) x(material_id uuid, quantidade numeric, observacao text);
  RETURN jsonb_build_object('id',p_id,'updated_at',v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.servico_catalogo_definir_ativo(p_id uuid, p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_servico public.servicos%ROWTYPE;
BEGIN
  SELECT * INTO v_servico FROM public.servicos WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF p_ativo AND EXISTS (SELECT 1 FROM public.servicos WHERE barbearia_id=v_barbearia AND id<>p_id AND ativo AND lower(btrim(nome))=lower(btrim(v_servico.nome))) THEN RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO'; END IF;
  UPDATE public.servicos SET ativo=p_ativo,updated_at=clock_timestamp() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'ativo',p_ativo);
END;
$$;

REVOKE ALL ON FUNCTION public.catalogo_assert_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.catalogo_validar_materiais(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materiais_catalogo_listar(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.servicos_catalogo_listar(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.material_catalogo_criar(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.material_catalogo_atualizar(uuid,text,text,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.material_catalogo_definir_ativo(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.servico_catalogo_criar(text,numeric,integer,text,numeric,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.servico_catalogo_atualizar(uuid,text,numeric,integer,text,numeric,jsonb,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.servico_catalogo_definir_ativo(uuid,boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.materiais_catalogo_listar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.servicos_catalogo_listar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.material_catalogo_criar(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.material_catalogo_atualizar(uuid,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.material_catalogo_definir_ativo(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.servico_catalogo_criar(text,numeric,integer,text,numeric,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.servico_catalogo_atualizar(uuid,text,numeric,integer,text,numeric,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.servico_catalogo_definir_ativo(uuid,boolean) TO authenticated;
