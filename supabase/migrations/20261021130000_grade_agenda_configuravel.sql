-- Define a grade de início dos horários por barbearia.
-- A duração do serviço e a margem operacional continuam independentes da grade.

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS grade_agenda_minutos integer;

UPDATE public.barbearias
SET grade_agenda_minutos=30
WHERE grade_agenda_minutos IS NULL;

ALTER TABLE public.barbearias
  ALTER COLUMN grade_agenda_minutos SET DEFAULT 30,
  ALTER COLUMN grade_agenda_minutos SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='barbearias_grade_agenda_check'
      AND conrelid='public.barbearias'::regclass
  ) THEN
    ALTER TABLE public.barbearias
      ADD CONSTRAINT barbearias_grade_agenda_check
      CHECK (grade_agenda_minutos IN (15,30));
  END IF;
END;
$$;

COMMENT ON COLUMN public.barbearias.grade_agenda_minutos IS
  'Intervalo, em minutos, entre os possíveis horários de início exibidos na agenda. Valores permitidos: 15 ou 30.';

CREATE OR REPLACE FUNCTION public.admin_grade_agenda_obter()
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.disponibilidade_assert_admin();
  v_grade integer;
BEGIN
  SELECT b.grade_agenda_minutos INTO v_grade
  FROM public.barbearias b
  WHERE b.id=v_barbearia;
  RETURN COALESCE(v_grade,30);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grade_agenda_salvar(p_grade_minutos integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  IF p_grade_minutos IS NULL OR p_grade_minutos NOT IN (15,30) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_GRADE_INVALIDA';
  END IF;
  UPDATE public.barbearias
  SET grade_agenda_minutos=p_grade_minutos
  WHERE id=v_barbearia;
  RETURN p_grade_minutos;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_horarios_livres(
  p_servico_id uuid,
  p_data_inicial date,
  p_profissional_id uuid DEFAULT NULL,
  p_dias integer DEFAULT 14,
  p_limite integer DEFAULT 12
)
RETURNS TABLE (
  profissional_id uuid,profissional_nome text,profissional_apelido text,
  inicio timestamptz,fim timestamptz,duracao_minutos integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.agenda_assert_operador();
  v_duracao integer;
  v_margem integer;
  v_grade integer;
  v_fuso text;
BEGIN
  IF p_data_inicial IS NULL OR p_dias NOT BETWEEN 1 AND 31 OR p_limite NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'AGENDA_ENCAIXE_FILTRO_INVALIDO';
  END IF;
  SELECT s.duracao_minutos INTO v_duracao FROM public.servicos s
  WHERE s.id=p_servico_id AND s.barbearia_id=v_barbearia AND s.ativo;
  IF v_duracao IS NULL THEN RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO'; END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id AND p.barbearia_id=v_barbearia AND p.ativo
  ) THEN RAISE EXCEPTION 'AGENDA_PROFISSIONAL_INVALIDO'; END IF;
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo'),
         COALESCE(b.intervalo_atendimentos_minutos,5),
         COALESCE(b.grade_agenda_minutos,30)
  INTO v_fuso,v_margem,v_grade
  FROM public.barbearias b WHERE b.id=v_barbearia;

  RETURN QUERY
  WITH datas AS (
    SELECT d::date AS data FROM generate_series(p_data_inicial,p_data_inicial+(p_dias-1),interval '1 day') d
  ), equipe AS (
    SELECT p.id,p.nome,p.apelido FROM public.profissionais p
    WHERE p.barbearia_id=v_barbearia AND p.ativo
      AND (p_profissional_id IS NULL OR p.id=p_profissional_id)
  ), regulares AS (
    SELECT e.id AS profissional_id,e.nome,e.apelido,
      (d.data+j.hora_inicio) AT TIME ZONE v_fuso AS janela_inicio,
      (d.data+COALESCE(j.intervalo_inicio,j.hora_fim)) AT TIME ZONE v_fuso AS janela_fim
    FROM datas d CROSS JOIN equipe e
    JOIN public.profissionais_jornadas j ON j.barbearia_id=v_barbearia AND j.profissional_id=e.id
      AND j.dia_semana=extract(dow FROM d.data)::smallint AND j.ativo
    UNION ALL
    SELECT e.id,e.nome,e.apelido,
      (d.data+j.intervalo_fim) AT TIME ZONE v_fuso,
      (d.data+j.hora_fim) AT TIME ZONE v_fuso
    FROM datas d CROSS JOIN equipe e
    JOIN public.profissionais_jornadas j ON j.barbearia_id=v_barbearia AND j.profissional_id=e.id
      AND j.dia_semana=extract(dow FROM d.data)::smallint AND j.ativo AND j.intervalo_fim IS NOT NULL
  ), extras AS (
    SELECT e.id,e.nome,e.apelido,
      (h.data+h.hora_inicio) AT TIME ZONE v_fuso,
      (h.data+h.hora_fim) AT TIME ZONE v_fuso
    FROM public.agenda_horarios_extras h
    JOIN equipe e ON h.profissional_id IS NULL OR h.profissional_id=e.id
    WHERE h.barbearia_id=v_barbearia AND h.data BETWEEN p_data_inicial AND p_data_inicial+(p_dias-1)
  ), janelas AS (
    SELECT * FROM regulares UNION SELECT * FROM extras
  ), candidatos AS (
    SELECT j.profissional_id,j.nome,j.apelido,slot AS inicio,
      slot+make_interval(mins=>v_duracao) AS fim,
      slot+make_interval(mins=>v_duracao+v_margem) AS ocupacao_fim
    FROM janelas j
    CROSS JOIN LATERAL generate_series(
      j.janela_inicio,
      j.janela_fim-make_interval(mins=>v_duracao+v_margem),
      make_interval(mins=>v_grade)
    ) slot
    WHERE j.janela_fim-j.janela_inicio>=make_interval(mins=>v_duracao+v_margem)
  )
  SELECT c.profissional_id,c.nome,c.apelido,c.inicio,c.fim,v_duracao
  FROM candidatos c
  WHERE c.inicio>=now()
    AND NOT EXISTS (
      SELECT 1 FROM public.profissionais_bloqueios b
      WHERE b.barbearia_id=v_barbearia AND b.profissional_id=c.profissional_id
        AND b.inicio<c.ocupacao_fim AND b.fim>c.inicio
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=v_barbearia AND a.profissional_id=c.profissional_id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<c.ocupacao_fim AND a.ocupacao_fim>c.inicio
    )
  ORDER BY c.inicio,lower(COALESCE(c.apelido,c.nome)),c.profissional_id
  LIMIT p_limite;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_horarios_livres(
  p_token text,p_servico_id uuid,p_data_inicial date,
  p_profissional_id uuid DEFAULT NULL,p_dias integer DEFAULT 14,p_limite integer DEFAULT 60
)
RETURNS TABLE (
  profissional_id uuid,profissional_nome text,profissional_apelido text,
  inicio timestamptz,fim timestamptz,duracao_minutos integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  v_sessao public.portal_sessoes%ROWTYPE;
  v_duracao integer;
  v_margem integer;
  v_grade integer;
  v_fuso text;
  v_hoje date;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo'),
         COALESCE(b.intervalo_atendimentos_minutos,5),
         COALESCE(b.grade_agenda_minutos,30)
  INTO v_fuso,v_margem,v_grade
  FROM public.barbearias b WHERE b.id=v_sessao.barbearia_id;
  v_hoje:=(now() AT TIME ZONE v_fuso)::date;
  IF p_data_inicial IS NULL OR p_data_inicial<v_hoje OR p_data_inicial>v_hoje+60
    OR p_dias NOT BETWEEN 1 AND 31 OR p_limite NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'PORTAL_PERIODO_INVALIDO';
  END IF;
  SELECT s.duracao_minutos INTO v_duracao FROM public.servicos s
  WHERE s.id=p_servico_id AND s.barbearia_id=v_sessao.barbearia_id AND s.ativo;
  IF v_duracao IS NULL THEN RAISE EXCEPTION 'PORTAL_SERVICO_INVALIDO'; END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id
      AND p.barbearia_id=v_sessao.barbearia_id AND p.ativo
  ) THEN RAISE EXCEPTION 'PORTAL_PROFISSIONAL_INVALIDO'; END IF;
  RETURN QUERY
  WITH datas AS (
    SELECT d::date AS data FROM generate_series(p_data_inicial,p_data_inicial+(p_dias-1),interval '1 day') d
  ), equipe AS (
    SELECT p.id,p.nome,p.apelido FROM public.profissionais p
    WHERE p.barbearia_id=v_sessao.barbearia_id AND p.ativo
      AND (p_profissional_id IS NULL OR p.id=p_profissional_id)
  ), regulares AS (
    SELECT e.id profissional_id,e.nome,e.apelido,
      (d.data+j.hora_inicio) AT TIME ZONE v_fuso janela_inicio,
      (d.data+COALESCE(j.intervalo_inicio,j.hora_fim)) AT TIME ZONE v_fuso janela_fim
    FROM datas d CROSS JOIN equipe e
    JOIN public.profissionais_jornadas j ON j.barbearia_id=v_sessao.barbearia_id
      AND j.profissional_id=e.id AND j.dia_semana=extract(dow FROM d.data)::smallint AND j.ativo
    UNION ALL
    SELECT e.id,e.nome,e.apelido,(d.data+j.intervalo_fim) AT TIME ZONE v_fuso,(d.data+j.hora_fim) AT TIME ZONE v_fuso
    FROM datas d CROSS JOIN equipe e
    JOIN public.profissionais_jornadas j ON j.barbearia_id=v_sessao.barbearia_id
      AND j.profissional_id=e.id AND j.dia_semana=extract(dow FROM d.data)::smallint
      AND j.ativo AND j.intervalo_fim IS NOT NULL
  ), extras AS (
    SELECT e.id,e.nome,e.apelido,(h.data+h.hora_inicio) AT TIME ZONE v_fuso,(h.data+h.hora_fim) AT TIME ZONE v_fuso
    FROM public.agenda_horarios_extras h JOIN equipe e ON h.profissional_id IS NULL OR h.profissional_id=e.id
    WHERE h.barbearia_id=v_sessao.barbearia_id AND h.data BETWEEN p_data_inicial AND p_data_inicial+(p_dias-1)
  ), janelas AS (
    SELECT * FROM regulares UNION SELECT * FROM extras
  ), candidatos AS (
    SELECT j.profissional_id,j.nome,j.apelido,slot inicio,
      slot+make_interval(mins=>v_duracao) fim,
      slot+make_interval(mins=>v_duracao+v_margem) ocupacao_fim
    FROM janelas j CROSS JOIN LATERAL generate_series(
      j.janela_inicio,j.janela_fim-make_interval(mins=>v_duracao+v_margem),make_interval(mins=>v_grade)
    ) slot WHERE j.janela_fim-j.janela_inicio>=make_interval(mins=>v_duracao+v_margem)
  )
  SELECT c.profissional_id,c.nome,c.apelido,c.inicio,c.fim,v_duracao FROM candidatos c
  WHERE c.inicio>=now()
    AND NOT EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb
      WHERE pb.barbearia_id=v_sessao.barbearia_id AND pb.profissional_id=c.profissional_id
        AND pb.inicio<c.ocupacao_fim AND pb.fim>c.inicio)
    AND NOT EXISTS (SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=v_sessao.barbearia_id AND a.profissional_id=c.profissional_id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<c.ocupacao_fim AND a.ocupacao_fim>c.inicio)
  ORDER BY c.inicio,lower(COALESCE(c.apelido,c.nome)),c.profissional_id LIMIT p_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grade_agenda_obter() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_grade_agenda_salvar(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grade_agenda_obter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grade_agenda_salvar(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) TO anon;
