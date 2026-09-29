-- Reserva uma margem operacional entre atendimentos sem alterar a duração real
-- do serviço. A ocupação ativa passa a ser: duração do serviço + 5 minutos.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS margem_minutos_snapshot integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ocupacao_fim timestamptz;

UPDATE public.agendamentos
SET margem_minutos_snapshot=COALESCE(margem_minutos_snapshot,5),
    ocupacao_fim=COALESCE(
      ocupacao_fim,
      data_fim+make_interval(mins=>COALESCE(margem_minutos_snapshot,5))
    )
WHERE margem_minutos_snapshot IS NULL OR ocupacao_fim IS NULL;

ALTER TABLE public.agendamentos
  ALTER COLUMN margem_minutos_snapshot SET DEFAULT 5,
  ALTER COLUMN margem_minutos_snapshot SET NOT NULL,
  ALTER COLUMN ocupacao_fim SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='agendamentos_margem_snapshot_check'
      AND conrelid='public.agendamentos'::regclass
  ) THEN
    ALTER TABLE public.agendamentos
      ADD CONSTRAINT agendamentos_margem_snapshot_check
      CHECK (margem_minutos_snapshot BETWEEN 0 AND 60);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='agendamentos_ocupacao_fim_check'
      AND conrelid='public.agendamentos'::regclass
  ) THEN
    ALTER TABLE public.agendamentos
      ADD CONSTRAINT agendamentos_ocupacao_fim_check CHECK (ocupacao_fim>=data_fim);
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.agendamentos_ocupacao_idx;
CREATE INDEX agendamentos_ocupacao_idx
  ON public.agendamentos (profissional_id,data_hora,ocupacao_fim)
  WHERE status IN ('pendente','confirmado','encaixe','em_atendimento');

CREATE OR REPLACE FUNCTION public.agendamentos_preparar_e_proteger_horario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_duracao integer;
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
  NEW.margem_minutos_snapshot:=COALESCE(NEW.margem_minutos_snapshot,5);
  NEW.data_fim:=NEW.data_hora+make_interval(mins=>NEW.duracao_minutos_snapshot);
  NEW.ocupacao_fim:=NEW.data_fim+make_interval(mins=>NEW.margem_minutos_snapshot);

  IF NEW.status IN ('pendente','confirmado','encaixe','em_atendimento') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.profissional_id::text||':agenda',0));
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

DROP TRIGGER IF EXISTS agendamentos_preparar_e_proteger_horario_trg ON public.agendamentos;
CREATE TRIGGER agendamentos_preparar_e_proteger_horario_trg
BEFORE INSERT OR UPDATE OF profissional_id,servico_id,data_hora,status,duracao_minutos_snapshot,margem_minutos_snapshot
ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.agendamentos_preparar_e_proteger_horario();

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
  v_margem integer:=5;
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
  SELECT b.fuso_horario INTO v_fuso FROM public.barbearias b WHERE b.id=v_barbearia;
  v_fuso:=COALESCE(v_fuso,'America/Sao_Paulo');

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
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_duracao integer; v_margem integer:=5; v_fuso text; v_hoje date;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  SELECT b.fuso_horario INTO v_fuso FROM public.barbearias b WHERE b.id=v_sessao.barbearia_id;
  v_fuso:=COALESCE(v_fuso,'America/Sao_Paulo');
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

COMMENT ON COLUMN public.agendamentos.margem_minutos_snapshot IS
  'Margem operacional reservada depois do serviço no momento do agendamento.';
COMMENT ON COLUMN public.agendamentos.ocupacao_fim IS
  'Fim da ocupação da agenda: término previsto do serviço mais a margem operacional.';

REVOKE ALL ON FUNCTION public.agendamentos_preparar_e_proteger_horario() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) TO anon;
