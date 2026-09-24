-- Agenda geral administrativa: visão diária da equipe com isolamento por barbearia.

CREATE OR REPLACE FUNCTION public.admin_agenda_listar(p_data date)
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
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DATA_INVALIDA';
  END IF;

  v_inicio := p_data::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_data + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

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

REVOKE ALL ON FUNCTION public.admin_agenda_listar(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agenda_listar(date) TO authenticated;

COMMENT ON FUNCTION public.admin_agenda_listar(date) IS
  'Lista a agenda diária de toda a equipe somente para administradores da barbearia autenticada.';
