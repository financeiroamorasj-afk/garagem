-- Permite que o profissional logado crie um agendamento normal na própria agenda.
-- Diferente do encaixe, o novo corte pode ser marcado para datas futuras e já nasce confirmado.

CREATE OR REPLACE FUNCTION public.barbeiro_agendamento_criar(
  p_cliente_id uuid,
  p_servico_id uuid,
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
  v_profissional uuid := public.get_my_profissional_id();
  v_preco numeric;
  v_duracao integer;
  v_fuso text;
  v_data date;
  v_id uuid;
BEGIN
  IF v_profissional IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;

  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DATA_INVALIDA';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profissionais p
    WHERE p.id = v_profissional
      AND p.barbearia_id = v_barbearia
      AND p.ativo
  ) THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
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

  IF p_valor_final IS NOT NULL AND p_valor_final < 0 THEN
    RAISE EXCEPTION 'AGENDA_VALOR_INVALIDO';
  END IF;

  SELECT COALESCE(b.fuso_horario, 'America/Sao_Paulo')
  INTO v_fuso
  FROM public.barbearias b
  WHERE b.id = v_barbearia;

  v_data := (p_inicio AT TIME ZONE v_fuso)::date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agenda_horarios_livres(
      p_servico_id,
      v_data,
      v_profissional,
      1,
      50
    ) h
    WHERE h.profissional_id = v_profissional
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
    status,
    origem,
    pagamento_status
  ) VALUES (
    v_barbearia,
    v_profissional,
    p_cliente_id,
    p_servico_id,
    p_inicio,
    v_duracao,
    p_inicio + make_interval(mins => v_duracao),
    COALESCE(p_valor_final, v_preco),
    'confirmado',
    'interno',
    'nao_solicitado'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'confirmado',
    'profissional_id', v_profissional,
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

REVOKE ALL ON FUNCTION public.barbeiro_agendamento_criar(uuid, uuid, timestamptz, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_agendamento_criar(uuid, uuid, timestamptz, numeric) TO authenticated;

COMMENT ON FUNCTION public.barbeiro_agendamento_criar(uuid, uuid, timestamptz, numeric)
IS 'Cria um agendamento confirmado na agenda do profissional vinculado ao usuário autenticado.';
