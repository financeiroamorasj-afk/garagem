-- A grade mensal pode conter 35 ou 42 dias; consulta a função operacional em blocos seguros.

CREATE OR REPLACE FUNCTION public.agenda_disponibilidade_calendario(p_data_inicial date,p_data_final date)
RETURNS TABLE (
  data date,profissional_id uuid,profissional_nome text,profissional_apelido text,
  jornada_ativa boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time,
  horarios_extras jsonb,bloqueios jsonb,conflitos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_cursor date;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>62 THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO';
  END IF;
  v_cursor:=p_data_inicial;
  WHILE v_cursor<=p_data_final LOOP
    RETURN QUERY SELECT * FROM public.agenda_disponibilidade_periodo(v_cursor,LEAST(v_cursor+31,p_data_final));
    v_cursor:=v_cursor+32;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_disponibilidade_calendario(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agenda_disponibilidade_calendario(date,date) TO authenticated;
