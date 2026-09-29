-- Distingue o atendimento de balcão do agendamento futuro.
-- Encaixes só podem ocupar um horário livre do dia corrente da barbearia.

CREATE OR REPLACE FUNCTION public.agenda_encaixe_criar(
  p_cliente_id uuid,
  p_servico_id uuid,
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_valor_final numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.agenda_assert_operador();
  v_preco numeric;
  v_duracao integer;
  v_id uuid;
  v_fuso text;
  v_data date;
  v_hoje date;
BEGIN
  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'AGENDA_ENCAIXE_FILTRO_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = p_cliente_id
      AND c.barbearia_id = v_barbearia
  ) THEN
    RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO';
  END IF;

  SELECT s.preco, s.duracao_minutos
  INTO v_preco, v_duracao
  FROM public.servicos s
  WHERE s.id = p_servico_id
    AND s.barbearia_id = v_barbearia
    AND s.ativo;

  IF v_duracao IS NULL THEN
    RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profissionais p
    WHERE p.id = p_profissional_id
      AND p.barbearia_id = v_barbearia
      AND p.ativo
  ) THEN
    RAISE EXCEPTION 'AGENDA_PROFISSIONAL_INVALIDO';
  END IF;

  IF p_valor_final IS NOT NULL AND p_valor_final < 0 THEN
    RAISE EXCEPTION 'AGENDA_VALOR_INVALIDO';
  END IF;

  SELECT b.fuso_horario
  INTO v_fuso
  FROM public.barbearias b
  WHERE b.id = v_barbearia;

  v_fuso := COALESCE(v_fuso, 'America/Sao_Paulo');
  v_data := (p_inicio AT TIME ZONE v_fuso)::date;
  v_hoje := (now() AT TIME ZONE v_fuso)::date;

  IF v_data <> v_hoje THEN
    RAISE EXCEPTION 'AGENDA_ENCAIXE_SOMENTE_HOJE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agenda_horarios_livres(p_servico_id, v_hoje, p_profissional_id, 1, 50) h
    WHERE h.profissional_id = p_profissional_id
      AND h.inicio = p_inicio
  ) THEN
    RAISE EXCEPTION 'AGENDA_HORARIO_INDISPONIVEL';
  END IF;

  INSERT INTO public.agendamentos (
    barbearia_id,
    profissional_id,
    cliente_id,
    servico_id,
    data_hora,
    duracao_minutos_snapshot,
    data_fim,
    valor_final,
    status
  ) VALUES (
    v_barbearia,
    p_profissional_id,
    p_cliente_id,
    p_servico_id,
    p_inicio,
    v_duracao,
    p_inicio + make_interval(mins => v_duracao),
    COALESCE(p_valor_final, v_preco),
    'encaixe'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'encaixe',
    'profissional_id', p_profissional_id,
    'inicio', p_inicio
  );
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN
      RAISE EXCEPTION 'AGENDA_HORARIO_INDISPONIVEL';
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_encaixe_criar(uuid, uuid, uuid, timestamptz, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_encaixe_criar(uuid, uuid, uuid, timestamptz, numeric) TO authenticated;

COMMENT ON FUNCTION public.agenda_encaixe_criar(uuid, uuid, uuid, timestamptz, numeric)
IS 'Cria encaixe somente para o dia corrente da barbearia; horários futuros pertencem ao fluxo normal de agendamento.';
