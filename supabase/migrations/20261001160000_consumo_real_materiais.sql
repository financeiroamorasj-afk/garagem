-- O padrão pertence ao serviço; o barbeiro confirma ou ajusta somente o uso do atendimento.

CREATE TABLE public.atendimento_materiais_uso (
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL,
  material_id uuid NOT NULL,
  material_nome_snapshot text NOT NULL,
  material_tipo_snapshot text NOT NULL CHECK (material_tipo_snapshot IN ('insumo','ferramenta')),
  unidade_snapshot text NOT NULL,
  quantidade_prevista numeric(12,3) NOT NULL CHECK (quantidade_prevista > 0),
  quantidade_utilizada numeric(12,3) NOT NULL CHECK (quantidade_utilizada >= 0),
  ajustado boolean NOT NULL,
  registrado_por uuid NOT NULL REFERENCES auth.users(id),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agendamento_id, material_id),
  FOREIGN KEY (barbearia_id, servico_id) REFERENCES public.servicos(barbearia_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (barbearia_id, material_id) REFERENCES public.materiais_servico(barbearia_id, id) ON DELETE RESTRICT
);

CREATE INDEX atendimento_materiais_uso_tenant_idx
ON public.atendimento_materiais_uso(barbearia_id, registrado_em DESC);

ALTER TABLE public.atendimento_materiais_uso ENABLE ROW LEVEL SECURITY;

CREATE POLICY atendimento_materiais_uso_admin_leitura ON public.atendimento_materiais_uso
FOR SELECT TO authenticated USING (
  barbearia_id = public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master')
);

CREATE POLICY atendimento_materiais_uso_barbeiro_leitura ON public.atendimento_materiais_uso
FOR SELECT TO authenticated USING (
  barbearia_id = public.get_my_barbearia_id()
  AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = atendimento_materiais_uso.agendamento_id
      AND a.barbearia_id = atendimento_materiais_uso.barbearia_id
      AND a.profissional_id = public.get_my_profissional_id()
  )
);

REVOKE ALL ON TABLE public.atendimento_materiais_uso FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.atendimento_materiais_uso TO authenticated;
GRANT ALL ON TABLE public.atendimento_materiais_uso TO service_role;

CREATE OR REPLACE FUNCTION public.barbeiro_atendimento_materiais_listar(p_agendamento_id uuid)
RETURNS TABLE (
  material_id uuid,
  nome text,
  tipo text,
  unidade text,
  quantidade_prevista numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_profissional uuid := public.get_my_profissional_id();
  v_servico_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN
    RAISE EXCEPTION 'MATERIAIS_USO_NAO_AUTORIZADO';
  END IF;

  SELECT a.servico_id INTO v_servico_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.barbearia_id = v_barbearia
    AND a.profissional_id = v_profissional;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATERIAIS_USO_ATENDIMENTO_NAO_ENCONTRADO'; END IF;

  RETURN QUERY
  SELECT m.id, m.nome, m.tipo, m.unidade, sm.quantidade
  FROM public.servicos_materiais sm
  JOIN public.materiais_servico m
    ON m.id = sm.material_id AND m.barbearia_id = sm.barbearia_id
  WHERE sm.barbearia_id = v_barbearia
    AND sm.servico_id = v_servico_id
  ORDER BY CASE m.tipo WHEN 'insumo' THEN 0 ELSE 1 END, lower(m.nome), m.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_atendimento_materiais_registrar(
  p_agendamento_id uuid,
  p_ajustes jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_profissional uuid := public.get_my_profissional_id();
  v_servico_id uuid;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN
    RAISE EXCEPTION 'MATERIAIS_USO_NAO_AUTORIZADO';
  END IF;
  IF p_ajustes IS NULL OR jsonb_typeof(p_ajustes) <> 'array' OR jsonb_array_length(p_ajustes) > 50 THEN
    RAISE EXCEPTION 'MATERIAIS_USO_AJUSTES_INVALIDOS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_ajustes) item
    WHERE jsonb_typeof(item) <> 'object'
      OR COALESCE(item->>'material_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(item->'quantidade') <> 'number'
      OR (item->>'quantidade')::numeric < 0
      OR (item->>'quantidade')::numeric > 999999
  ) THEN
    RAISE EXCEPTION 'MATERIAIS_USO_AJUSTES_INVALIDOS';
  END IF;
  IF EXISTS (
    SELECT item->>'material_id' FROM jsonb_array_elements(p_ajustes) item
    GROUP BY item->>'material_id' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'MATERIAIS_USO_AJUSTES_DUPLICADOS'; END IF;

  SELECT a.servico_id INTO v_servico_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.barbearia_id = v_barbearia
    AND a.profissional_id = v_profissional;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATERIAIS_USO_ATENDIMENTO_NAO_ENCONTRADO'; END IF;

  IF EXISTS (SELECT 1 FROM public.atendimento_materiais_uso u WHERE u.agendamento_id = p_agendamento_id) THEN
    SELECT count(*)::integer INTO v_total FROM public.atendimento_materiais_uso u WHERE u.agendamento_id = p_agendamento_id;
    RETURN v_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_ajustes) item
    WHERE NOT EXISTS (
      SELECT 1 FROM public.servicos_materiais sm
      WHERE sm.barbearia_id = v_barbearia
        AND sm.servico_id = v_servico_id
        AND sm.material_id = (item->>'material_id')::uuid
    )
  ) THEN RAISE EXCEPTION 'MATERIAIS_USO_MATERIAL_INVALIDO'; END IF;

  WITH ajustes AS (
    SELECT (item->>'material_id')::uuid material_id, (item->>'quantidade')::numeric quantidade
    FROM jsonb_array_elements(p_ajustes) item
  ), inseridos AS (
    INSERT INTO public.atendimento_materiais_uso(
      barbearia_id, agendamento_id, servico_id, material_id,
      material_nome_snapshot, material_tipo_snapshot, unidade_snapshot,
      quantidade_prevista, quantidade_utilizada, ajustado, registrado_por
    )
    SELECT
      v_barbearia, p_agendamento_id, v_servico_id, m.id,
      m.nome, m.tipo, m.unidade, sm.quantidade,
      COALESCE(a.quantidade, sm.quantidade),
      COALESCE(a.quantidade, sm.quantidade) <> sm.quantidade,
      auth.uid()
    FROM public.servicos_materiais sm
    JOIN public.materiais_servico m ON m.id = sm.material_id AND m.barbearia_id = sm.barbearia_id
    LEFT JOIN ajustes a ON a.material_id = sm.material_id
    WHERE sm.barbearia_id = v_barbearia AND sm.servico_id = v_servico_id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_total FROM inseridos;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_checkout_concluir_com_materiais(
  p_agendamento_id uuid,
  p_memoria jsonb,
  p_produtos jsonb,
  p_valor_servico numeric,
  p_desconto numeric,
  p_forma_pagamento text,
  p_taxa numeric,
  p_data_recebimento date,
  p_chave_idempotencia uuid,
  p_materiais_ajustes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb; v_total integer;
BEGIN
  v_result := public.barbeiro_checkout_concluir(
    p_agendamento_id, p_memoria, p_produtos, p_valor_servico, p_desconto,
    p_forma_pagamento, p_taxa, p_data_recebimento, p_chave_idempotencia
  );
  v_total := public.barbeiro_atendimento_materiais_registrar(p_agendamento_id, p_materiais_ajustes);
  RETURN v_result || jsonb_build_object('materiais_registrados', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_atendimento_enviar_recepcao_com_materiais(
  p_agendamento_id uuid,
  p_memoria jsonb,
  p_produtos jsonb,
  p_valor_servico numeric,
  p_chave_idempotencia uuid,
  p_materiais_ajustes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb; v_total integer;
BEGIN
  v_result := public.barbeiro_atendimento_enviar_recepcao(
    p_agendamento_id, p_memoria, p_produtos, p_valor_servico, p_chave_idempotencia
  );
  v_total := public.barbeiro_atendimento_materiais_registrar(p_agendamento_id, p_materiais_ajustes);
  RETURN v_result || jsonb_build_object('materiais_registrados', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.barbeiro_atendimento_materiais_listar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.barbeiro_atendimento_materiais_registrar(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.barbeiro_checkout_concluir_com_materiais(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.barbeiro_atendimento_enviar_recepcao_com_materiais(uuid,jsonb,jsonb,numeric,uuid,jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.barbeiro_atendimento_materiais_listar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_checkout_concluir_com_materiais(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_atendimento_enviar_recepcao_com_materiais(uuid,jsonb,jsonb,numeric,uuid,jsonb) TO authenticated;
