-- Consulta administrativa por período para as visões dia, semana e mês.

CREATE OR REPLACE FUNCTION public.admin_agenda_listar_periodo(
  p_data_inicial date,
  p_data_final date
)
RETURNS TABLE (
  id uuid,
  profissional_id uuid,
  profissional_nome text,
  profissional_apelido text,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
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
  v_barbearia uuid := public.get_my_barbearia_id();
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'AGENDA_ADMIN_NAO_AUTORIZADO';
  END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final < p_data_inicial THEN
    RAISE EXCEPTION 'AGENDA_PERIODO_INVALIDO';
  END IF;
  IF (p_data_final - p_data_inicial) > 41 THEN
    RAISE EXCEPTION 'AGENDA_PERIODO_MUITO_LONGO';
  END IF;

  v_inicio := p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_data_final + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT
    a.id,
    a.profissional_id,
    p.nome AS profissional_nome,
    p.apelido AS profissional_apelido,
    a.cliente_id,
    COALESCE(c.nome, NULLIF(btrim(a.cliente_nome_manual), ''), 'Cliente') AS cliente_nome,
    c.telefone AS cliente_telefone,
    a.servico_id,
    COALESCE(s.nome, 'Serviço não informado') AS servico_nome,
    COALESCE(s.duracao_minutos, 30) AS duracao_minutos,
    a.data_hora,
    a.status,
    a.valor_final
  FROM public.agendamentos a
  JOIN public.profissionais p
    ON p.id = a.profissional_id AND p.barbearia_id = a.barbearia_id
  LEFT JOIN public.clientes c
    ON c.id = a.cliente_id AND c.barbearia_id = a.barbearia_id
  LEFT JOIN public.servicos s
    ON s.id = a.servico_id AND s.barbearia_id = a.barbearia_id
  WHERE a.barbearia_id = v_barbearia
    AND a.data_hora >= v_inicio
    AND a.data_hora < v_fim
  ORDER BY a.data_hora, COALESCE(NULLIF(btrim(p.apelido), ''), p.nome), a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_agenda_listar_periodo(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agenda_listar_periodo(date,date) TO authenticated;

COMMENT ON FUNCTION public.admin_agenda_listar_periodo(date,date) IS
  'Lista até 42 dias da agenda da equipe para as visões administrativas de calendário.';
