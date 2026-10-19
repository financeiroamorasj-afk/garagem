-- Faz da disponibilidade cadastrada a regra final para qualquer novo horario.
-- A listagem de slots ja respeitava jornada, intervalo, extras e bloqueios, mas
-- inserts diretos na agenda podiam contornar essa regra.

CREATE OR REPLACE FUNCTION public.agenda_horario_respeita_disponibilidade(
  p_barbearia_id uuid,
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_ocupacao_fim timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_fuso text;
  v_data date;
  v_permitido boolean;
BEGIN
  IF p_barbearia_id IS NULL OR p_profissional_id IS NULL OR p_inicio IS NULL
    OR p_ocupacao_fim IS NULL OR p_ocupacao_fim<=p_inicio THEN
    RETURN false;
  END IF;

  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo')
  INTO v_fuso
  FROM public.barbearias b
  WHERE b.id=p_barbearia_id;

  IF v_fuso IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profissionais p
    WHERE p.id=p_profissional_id
      AND p.barbearia_id=p_barbearia_id
      AND p.ativo
  ) THEN
    RETURN false;
  END IF;

  v_data:=(p_inicio AT TIME ZONE v_fuso)::date;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profissionais_jornadas j
      WHERE j.barbearia_id=p_barbearia_id
        AND j.profissional_id=p_profissional_id
        AND j.dia_semana=extract(dow FROM v_data)::smallint
        AND j.ativo
        AND (
          (
            p_inicio >= (v_data+j.hora_inicio) AT TIME ZONE v_fuso
            AND p_ocupacao_fim <= (v_data+COALESCE(j.intervalo_inicio,j.hora_fim)) AT TIME ZONE v_fuso
          )
          OR (
            j.intervalo_fim IS NOT NULL
            AND p_inicio >= (v_data+j.intervalo_fim) AT TIME ZONE v_fuso
            AND p_ocupacao_fim <= (v_data+j.hora_fim) AT TIME ZONE v_fuso
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.agenda_horarios_extras h
      WHERE h.barbearia_id=p_barbearia_id
        AND h.data=v_data
        AND (h.profissional_id IS NULL OR h.profissional_id=p_profissional_id)
        AND p_inicio >= (h.data+h.hora_inicio) AT TIME ZONE v_fuso
        AND p_ocupacao_fim <= (h.data+h.hora_fim) AT TIME ZONE v_fuso
    )
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.profissionais_bloqueios b
    WHERE b.barbearia_id=p_barbearia_id
      AND b.profissional_id=p_profissional_id
      AND b.inicio<p_ocupacao_fim
      AND b.fim>p_inicio
  ) INTO v_permitido;

  RETURN COALESCE(v_permitido,false);
END;
$$;

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
  NEW.margem_minutos_snapshot:=COALESCE(NEW.margem_minutos_snapshot,5);
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

    -- Importacoes, conflitos historicos e registros tecnicos de atendimento em
    -- andamento continuam possiveis. Toda reserva real com servico precisa caber
    -- integralmente na disponibilidade, inclusive a margem operacional.
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

REVOKE ALL ON FUNCTION public.agenda_horario_respeita_disponibilidade(uuid,uuid,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agendamentos_preparar_e_proteger_horario()
  FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.agenda_horario_respeita_disponibilidade(uuid,uuid,timestamptz,timestamptz)
IS 'Valida jornada, intervalo, horario extra e bloqueios para toda a ocupacao do atendimento.';
