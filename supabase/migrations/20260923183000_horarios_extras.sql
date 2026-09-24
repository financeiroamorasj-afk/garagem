-- Janelas extraordinárias de atendimento, persistidas e isoladas por barbearia.

CREATE TABLE IF NOT EXISTS public.agenda_horarios_extras (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  profissional_id uuid REFERENCES public.profissionais(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  motivo text,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_horario_extra_intervalo_check CHECK (hora_fim > hora_inicio),
  CONSTRAINT agenda_horario_extra_motivo_check CHECK (motivo IS NULL OR length(btrim(motivo)) <= 200)
);

CREATE INDEX IF NOT EXISTS agenda_horarios_extras_periodo_idx
  ON public.agenda_horarios_extras (barbearia_id, data, hora_inicio);

ALTER TABLE public.agenda_horarios_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY agenda_horarios_extras_admin ON public.agenda_horarios_extras
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'))
  WITH CHECK (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));

CREATE POLICY agenda_horarios_extras_barbeiro_leitura ON public.agenda_horarios_extras
  FOR SELECT USING (
    barbearia_id = public.get_my_barbearia_id()
    AND public.get_my_role() = 'barbeiro'
    AND (profissional_id IS NULL OR profissional_id = public.get_my_profissional_id())
  );

REVOKE ALL ON TABLE public.agenda_horarios_extras FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.agenda_horarios_extras TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_horario_extra_criar(
  p_data date,
  p_hora_inicio time,
  p_hora_fim time,
  p_profissional_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_NAO_AUTORIZADO';
  END IF;
  IF p_data IS NULL OR p_hora_inicio IS NULL OR p_hora_fim IS NULL OR p_hora_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_INTERVALO_INVALIDO';
  END IF;
  IF p_motivo IS NOT NULL AND length(btrim(p_motivo)) > 200 THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_MOTIVO_INVALIDO';
  END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais
    WHERE id = p_profissional_id AND barbearia_id = v_barbearia AND ativo IS TRUE
  ) THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_PROFISSIONAL_INVALIDO';
  END IF;

  INSERT INTO public.agenda_horarios_extras (
    barbearia_id, profissional_id, data, hora_inicio, hora_fim, motivo, criado_por
  ) VALUES (
    v_barbearia, p_profissional_id, p_data, p_hora_inicio, p_hora_fim,
    NULLIF(btrim(p_motivo), ''), auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_horarios_extras_listar(
  p_data_inicial date,
  p_data_final date
)
RETURNS TABLE (
  id uuid,
  profissional_id uuid,
  profissional_nome text,
  profissional_apelido text,
  data date,
  hora_inicio time,
  hora_fim time,
  motivo text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_NAO_AUTORIZADO';
  END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final < p_data_inicial OR (p_data_final - p_data_inicial) > 41 THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_PERIODO_INVALIDO';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.profissional_id,
    p.nome,
    p.apelido,
    h.data,
    h.hora_inicio,
    h.hora_fim,
    h.motivo,
    h.created_at
  FROM public.agenda_horarios_extras h
  LEFT JOIN public.profissionais p
    ON p.id = h.profissional_id AND p.barbearia_id = h.barbearia_id
  WHERE h.barbearia_id = v_barbearia
    AND h.data BETWEEN p_data_inicial AND p_data_final
  ORDER BY h.data, h.hora_inicio, COALESCE(p.apelido, p.nome);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_horario_extra_criar(date,time,time,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_horario_extra_criar(date,time,time,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_horarios_extras_listar(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_horarios_extras_listar(date,date) TO authenticated;
