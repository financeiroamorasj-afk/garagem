-- Qualifica colunas que também são nomes de saída da função TABLE.
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
  IF NOT EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id=p_profissional_id AND p.barbearia_id=v_barbearia
  ) THEN
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

REVOKE ALL ON FUNCTION public.admin_bloqueios_listar(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_bloqueios_listar(uuid,date,date) TO authenticated;
