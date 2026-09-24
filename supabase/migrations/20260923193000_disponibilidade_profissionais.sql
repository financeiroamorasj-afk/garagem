-- Jornada semanal, intervalos, folgas e bloqueios pontuais da equipe.

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE public.profissionais_jornadas (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  profissional_id uuid NOT NULL,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  ativo boolean NOT NULL DEFAULT false,
  hora_inicio time,
  hora_fim time,
  intervalo_inicio time,
  intervalo_fim time,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profissional_id, dia_semana),
  CONSTRAINT profissionais_jornadas_profissional_tenant_fkey
    FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais(barbearia_id, id) ON DELETE CASCADE,
  CONSTRAINT profissionais_jornadas_expediente_check CHECK (
    (NOT ativo AND hora_inicio IS NULL AND hora_fim IS NULL AND intervalo_inicio IS NULL AND intervalo_fim IS NULL)
    OR (ativo AND hora_inicio IS NOT NULL AND hora_fim IS NOT NULL AND hora_fim > hora_inicio)
  ),
  CONSTRAINT profissionais_jornadas_intervalo_check CHECK (
    (intervalo_inicio IS NULL AND intervalo_fim IS NULL)
    OR (
      ativo AND intervalo_inicio IS NOT NULL AND intervalo_fim IS NOT NULL
      AND intervalo_fim > intervalo_inicio
      AND intervalo_inicio > hora_inicio AND intervalo_fim < hora_fim
    )
  )
);

CREATE INDEX profissionais_jornadas_tenant_idx
  ON public.profissionais_jornadas (barbearia_id, profissional_id, dia_semana);

CREATE TABLE public.profissionais_bloqueios (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  profissional_id uuid NOT NULL,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  motivo text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profissionais_bloqueios_profissional_tenant_fkey
    FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais(barbearia_id, id) ON DELETE CASCADE,
  CONSTRAINT profissionais_bloqueios_periodo_check CHECK (fim > inicio),
  CONSTRAINT profissionais_bloqueios_motivo_check CHECK (motivo IS NULL OR length(btrim(motivo)) <= 200)
);

CREATE INDEX profissionais_bloqueios_periodo_idx
  ON public.profissionais_bloqueios (barbearia_id, profissional_id, inicio, fim);

ALTER TABLE public.profissionais_jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_bloqueios ENABLE ROW LEVEL SECURITY;

CREATE POLICY profissionais_jornadas_admin_leitura ON public.profissionais_jornadas
  FOR SELECT USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY profissionais_jornadas_barbeiro_leitura ON public.profissionais_jornadas
  FOR SELECT USING (barbearia_id=public.get_my_barbearia_id() AND profissional_id=public.get_my_profissional_id());
CREATE POLICY profissionais_bloqueios_admin_leitura ON public.profissionais_bloqueios
  FOR SELECT USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY profissionais_bloqueios_barbeiro_leitura ON public.profissionais_bloqueios
  FOR SELECT USING (barbearia_id=public.get_my_barbearia_id() AND profissional_id=public.get_my_profissional_id());

REVOKE ALL ON public.profissionais_jornadas, public.profissionais_bloqueios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profissionais_jornadas, public.profissionais_bloqueios TO authenticated;

CREATE OR REPLACE FUNCTION public.disponibilidade_assert_admin()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_NAO_AUTORIZADO';
  END IF;
  RETURN v_barbearia;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_jornadas_listar(p_profissional_id uuid)
RETURNS TABLE (
  dia_semana smallint, ativo boolean, hora_inicio time, hora_fim time,
  intervalo_inicio time, intervalo_fim time, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id AND p.barbearia_id=v_barbearia) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  RETURN QUERY
  SELECT j.dia_semana,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,j.updated_at
  FROM public.profissionais_jornadas j
  WHERE j.barbearia_id=v_barbearia AND j.profissional_id=p_profissional_id
  ORDER BY j.dia_semana;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_jornadas_salvar(p_profissional_id uuid, p_dias jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin(); v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia AND ativo) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  IF p_dias IS NULL OR jsonb_typeof(p_dias)<>'array' OR jsonb_array_length(p_dias)<>7 THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA';
  END IF;
  SELECT count(DISTINCT x.dia_semana) INTO v_count
  FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
  WHERE x.dia_semana BETWEEN 0 AND 6;
  IF v_count<>7 THEN RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
    WHERE x.ativo IS NULL
      OR (x.ativo AND (x.hora_inicio IS NULL OR x.hora_fim IS NULL OR x.hora_fim<=x.hora_inicio))
      OR (x.ativo AND ((x.intervalo_inicio IS NULL)<>(x.intervalo_fim IS NULL)))
      OR (x.ativo AND x.intervalo_inicio IS NOT NULL AND (
        x.intervalo_fim<=x.intervalo_inicio OR x.intervalo_inicio<=x.hora_inicio OR x.intervalo_fim>=x.hora_fim
      ))
  ) THEN RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA'; END IF;

  INSERT INTO public.profissionais_jornadas(
    barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim,updated_at
  )
  SELECT v_barbearia,p_profissional_id,x.dia_semana,x.ativo,
    CASE WHEN x.ativo THEN x.hora_inicio ELSE NULL END,
    CASE WHEN x.ativo THEN x.hora_fim ELSE NULL END,
    CASE WHEN x.ativo THEN x.intervalo_inicio ELSE NULL END,
    CASE WHEN x.ativo THEN x.intervalo_fim ELSE NULL END,
    clock_timestamp()
  FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
  ON CONFLICT(profissional_id,dia_semana) DO UPDATE SET
    ativo=excluded.ativo,hora_inicio=excluded.hora_inicio,hora_fim=excluded.hora_fim,
    intervalo_inicio=excluded.intervalo_inicio,intervalo_fim=excluded.intervalo_fim,updated_at=excluded.updated_at;
  RETURN jsonb_build_object('profissional_id',p_profissional_id,'dias',7);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bloqueios_listar(
  p_profissional_id uuid, p_data_inicial date, p_data_final date
)
RETURNS TABLE (id uuid,inicio timestamptz,fim timestamptz,motivo text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR (p_data_final-p_data_inicial)>366 THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id AND p.barbearia_id=v_barbearia) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  RETURN QUERY SELECT b.id,b.inicio,b.fim,b.motivo,b.created_at
  FROM public.profissionais_bloqueios b
  WHERE b.barbearia_id=v_barbearia AND b.profissional_id=p_profissional_id
    AND b.inicio < (p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
    AND b.fim > p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo'
  ORDER BY b.inicio,b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bloqueio_criar(
  p_profissional_id uuid,p_inicio timestamptz,p_fim timestamptz,p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin(); v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia AND ativo) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<=p_inicio OR p_fim-p_inicio>interval '31 days' THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_INVALIDO';
  END IF;
  IF p_motivo IS NOT NULL AND length(btrim(p_motivo))>200 THEN RAISE EXCEPTION 'DISPONIBILIDADE_MOTIVO_INVALIDO'; END IF;
  INSERT INTO public.profissionais_bloqueios(barbearia_id,profissional_id,inicio,fim,motivo,criado_por)
  VALUES(v_barbearia,p_profissional_id,p_inicio,p_fim,NULLIF(btrim(p_motivo),''),auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bloqueio_excluir(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  DELETE FROM public.profissionais_bloqueios WHERE id=p_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_NAO_ENCONTRADO'; END IF;
  RETURN jsonb_build_object('id',p_id,'excluido',true);
END;
$$;

REVOKE ALL ON FUNCTION public.disponibilidade_assert_admin() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_jornadas_listar(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_jornadas_salvar(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_bloqueios_listar(uuid,date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_bloqueio_criar(uuid,timestamptz,timestamptz,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_bloqueio_excluir(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_jornadas_listar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_jornadas_salvar(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloqueios_listar(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloqueio_criar(uuid,timestamptz,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloqueio_excluir(uuid) TO authenticated;
