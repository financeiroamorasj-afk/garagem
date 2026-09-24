-- Agenda individual do barbeiro: leitura isolada e transições de atendimento controladas.

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_status_check,
  ADD CONSTRAINT agendamentos_status_check
    CHECK (status = ANY (ARRAY[
      'pendente'::text,
      'confirmado'::text,
      'em_atendimento'::text,
      'concluido'::text,
      'cancelado'::text,
      'encaixe'::text
    ]));

CREATE OR REPLACE FUNCTION public.barbeiro_agenda_contexto()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profissional uuid := public.get_my_profissional_id();
  v_contexto jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  IF v_profissional IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'nome', p.nome,
    'apelido', p.apelido,
    'especialidade', p.especialidade,
    'foto_url', p.foto_url,
    'barbearia_nome', b.nome
  )
  INTO v_contexto
  FROM public.profissionais p
  JOIN public.barbearias b ON b.id = p.barbearia_id
  WHERE p.id = v_profissional
    AND p.user_id = auth.uid()
    AND p.ativo IS TRUE;

  IF v_contexto IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;

  RETURN v_contexto;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_agenda_listar(p_data date)
RETURNS TABLE (
  id uuid,
  profissional_id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
  cliente_preferencias text,
  servico_id uuid,
  servico_nome text,
  duracao_minutos integer,
  data_hora timestamptz,
  status text,
  valor_final numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profissional uuid := public.get_my_profissional_id();
  v_barbearia uuid := public.get_my_barbearia_id();
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  IF v_profissional IS NULL OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DATA_INVALIDA';
  END IF;

  v_inicio := p_data::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_data + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT
    a.id,
    a.profissional_id,
    a.cliente_id,
    COALESCE(c.nome, NULLIF(btrim(a.cliente_nome_manual), ''), 'Cliente') AS cliente_nome,
    c.telefone AS cliente_telefone,
    c.notas_preferencias AS cliente_preferencias,
    a.servico_id,
    COALESCE(s.nome, 'Serviço não informado') AS servico_nome,
    COALESCE(s.duracao_minutos, 30) AS duracao_minutos,
    a.data_hora,
    a.status,
    a.valor_final
  FROM public.agendamentos a
  LEFT JOIN public.clientes c
    ON c.id = a.cliente_id AND c.barbearia_id = a.barbearia_id
  LEFT JOIN public.servicos s
    ON s.id = a.servico_id AND s.barbearia_id = a.barbearia_id
  WHERE a.barbearia_id = v_barbearia
    AND a.profissional_id = v_profissional
    AND a.data_hora >= v_inicio
    AND a.data_hora < v_fim
  ORDER BY a.data_hora, a.criado_em, a.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_agendamento_mudar_status(
  p_agendamento_id uuid,
  p_status_esperado text,
  p_novo_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profissional uuid := public.get_my_profissional_id();
  v_barbearia uuid := public.get_my_barbearia_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_transicao_permitida boolean := false;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  IF v_profissional IS NULL OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;
  IF p_agendamento_id IS NULL OR p_status_esperado IS NULL OR p_novo_status IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DADOS_INVALIDOS';
  END IF;

  SELECT * INTO v_agendamento
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND barbearia_id = v_barbearia
    AND profissional_id = v_profissional
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_AGENDAMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_agendamento.status IS DISTINCT FROM p_status_esperado THEN
    RAISE EXCEPTION 'AGENDA_STATUS_ALTERADO';
  END IF;

  v_transicao_permitida := CASE
    WHEN v_agendamento.status IN ('pendente', 'confirmado', 'encaixe')
      AND p_novo_status IN ('em_atendimento', 'cancelado') THEN true
    WHEN v_agendamento.status = 'em_atendimento'
      AND p_novo_status = 'concluido' THEN true
    ELSE false
  END;

  IF NOT v_transicao_permitida THEN
    RAISE EXCEPTION 'AGENDA_TRANSICAO_INVALIDA';
  END IF;

  UPDATE public.agendamentos
  SET status = p_novo_status
  WHERE id = v_agendamento.id;

  RETURN jsonb_build_object(
    'id', v_agendamento.id,
    'status', p_novo_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.barbeiro_agenda_contexto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_agenda_contexto() TO authenticated;

REVOKE ALL ON FUNCTION public.barbeiro_agenda_listar(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_agenda_listar(date) TO authenticated;

REVOKE ALL ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) TO authenticated;

COMMENT ON FUNCTION public.barbeiro_agenda_listar(date) IS
  'Lista somente os agendamentos do profissional ativo vinculado ao usuário autenticado.';
COMMENT ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) IS
  'Executa apenas transições operacionais autorizadas na agenda do barbeiro, com controle otimista de status.';
