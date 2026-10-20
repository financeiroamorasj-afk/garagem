-- Permite que cada barbearia defina a margem operacional entre atendimentos.
-- Agendamentos existentes preservam o snapshot usado quando foram criados.

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS intervalo_atendimentos_minutos integer NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='barbearias_intervalo_atendimentos_check'
      AND conrelid='public.barbearias'::regclass
  ) THEN
    ALTER TABLE public.barbearias
      ADD CONSTRAINT barbearias_intervalo_atendimentos_check
      CHECK (intervalo_atendimentos_minutos BETWEEN 0 AND 60);
  END IF;
END;
$$;

COMMENT ON COLUMN public.barbearias.intervalo_atendimentos_minutos IS
  'Minutos reservados entre o fim de um atendimento e o início do próximo. Zero desativa o intervalo.';

CREATE OR REPLACE FUNCTION public.admin_intervalo_atendimentos_obter()
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.disponibilidade_assert_admin();
  v_intervalo integer;
BEGIN
  SELECT b.intervalo_atendimentos_minutos INTO v_intervalo
  FROM public.barbearias b
  WHERE b.id=v_barbearia;
  RETURN COALESCE(v_intervalo,5);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_intervalo_atendimentos_salvar(p_intervalo_minutos integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  IF p_intervalo_minutos IS NULL OR p_intervalo_minutos NOT BETWEEN 0 AND 60 THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_INTERVALO_INVALIDO';
  END IF;
  UPDATE public.barbearias
  SET intervalo_atendimentos_minutos=p_intervalo_minutos
  WHERE id=v_barbearia;
  RETURN p_intervalo_minutos;
END;
$$;

-- O trigger passa a capturar a configuração da unidade no momento da criação.
-- O default da coluna é removido para que ele não masque a configuração atual.
ALTER TABLE public.agendamentos
  ALTER COLUMN margem_minutos_snapshot DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.agendamentos_preparar_e_proteger_horario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_duracao integer;
  v_validar_reserva boolean;
BEGIN
  IF NEW.barbearia_id IS NULL OR NEW.profissional_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DADOS_INVALIDOS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id=NEW.profissional_id AND p.barbearia_id=NEW.barbearia_id
  ) THEN RAISE EXCEPTION 'AGENDA_PROFISSIONAL_INVALIDO'; END IF;
  IF NEW.cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=NEW.cliente_id AND c.barbearia_id=NEW.barbearia_id
  ) THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;

  IF TG_OP='INSERT' OR NEW.servico_id IS DISTINCT FROM OLD.servico_id THEN
    IF NEW.servico_id IS NULL THEN
      v_duracao:=COALESCE(NEW.duracao_minutos_snapshot,30);
    ELSE
      SELECT s.duracao_minutos INTO v_duracao
      FROM public.servicos s
      WHERE s.id=NEW.servico_id AND s.barbearia_id=NEW.barbearia_id AND s.ativo;
      IF v_duracao IS NULL THEN RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO'; END IF;
    END IF;
    NEW.duracao_minutos_snapshot:=v_duracao;
  END IF;

  NEW.duracao_minutos_snapshot:=COALESCE(NEW.duracao_minutos_snapshot,30);
  IF TG_OP='INSERT' OR NEW.barbearia_id IS DISTINCT FROM OLD.barbearia_id THEN
    SELECT COALESCE(b.intervalo_atendimentos_minutos,5)
    INTO NEW.margem_minutos_snapshot
    FROM public.barbearias b
    WHERE b.id=NEW.barbearia_id;
  ELSE
    NEW.margem_minutos_snapshot:=COALESCE(NEW.margem_minutos_snapshot,OLD.margem_minutos_snapshot,5);
  END IF;
  NEW.data_fim:=NEW.data_hora+make_interval(mins=>NEW.duracao_minutos_snapshot);
  NEW.ocupacao_fim:=NEW.data_fim+make_interval(mins=>NEW.margem_minutos_snapshot);

  v_validar_reserva:=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN
    v_validar_reserva:=
      NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
      OR NEW.servico_id IS DISTINCT FROM OLD.servico_id
      OR NEW.data_hora IS DISTINCT FROM OLD.data_hora
      OR NEW.duracao_minutos_snapshot IS DISTINCT FROM OLD.duracao_minutos_snapshot
      OR NEW.margem_minutos_snapshot IS DISTINCT FROM OLD.margem_minutos_snapshot;
  END IF;

  IF v_validar_reserva AND NEW.status IN ('pendente','confirmado','encaixe','em_atendimento') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.profissional_id::text||':agenda',0));

    IF NEW.status IN ('pendente','confirmado','encaixe')
      AND NEW.servico_id IS NOT NULL
      AND NEW.ocupacao_fim>=clock_timestamp()
      AND EXISTS (
        SELECT 1 FROM public.profissionais_jornadas j
        WHERE j.barbearia_id=NEW.barbearia_id
          AND j.profissional_id=NEW.profissional_id
      )
      AND NOT public.agenda_horario_respeita_disponibilidade(
        NEW.barbearia_id,NEW.profissional_id,NEW.data_hora,NEW.ocupacao_fim
      ) THEN
      RAISE EXCEPTION 'AGENDA_FORA_DISPONIBILIDADE';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.profissional_id=NEW.profissional_id
        AND a.id IS DISTINCT FROM NEW.id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<NEW.ocupacao_fim AND a.ocupacao_fim>NEW.data_hora
    ) THEN RAISE EXCEPTION 'AGENDA_HORARIO_OCUPADO'; END IF;
  END IF;
  RETURN NEW;
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
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo'),COALESCE(b.intervalo_atendimentos_minutos,5)
  INTO v_fuso,v_margem
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
      interval '15 minutes'
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
  v_fuso text;
  v_hoje date;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo'),COALESCE(b.intervalo_atendimentos_minutos,5)
  INTO v_fuso,v_margem
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
      j.janela_inicio,j.janela_fim-make_interval(mins=>v_duracao+v_margem),interval '15 minutes'
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

REVOKE ALL ON FUNCTION public.admin_intervalo_atendimentos_obter() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_intervalo_atendimentos_salvar(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agendamentos_preparar_e_proteger_horario() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_intervalo_atendimentos_obter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_intervalo_atendimentos_salvar(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) TO anon;
