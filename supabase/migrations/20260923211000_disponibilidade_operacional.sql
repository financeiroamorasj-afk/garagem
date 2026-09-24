-- Leitura operacional da disponibilidade para gestor e barbeiro, com conflitos reais.

CREATE OR REPLACE FUNCTION public.agenda_disponibilidade_periodo(p_data_inicial date,p_data_final date)
RETURNS TABLE (
  data date,profissional_id uuid,profissional_nome text,profissional_apelido text,
  jornada_ativa boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time,
  horarios_extras jsonb,bloqueios jsonb,conflitos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_role text:=public.get_my_role();
  v_profissional uuid:=public.get_my_profissional_id();
  v_fuso text;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_VISUALIZACAO_NAO_AUTORIZADA';
  END IF;
  IF v_role='barbeiro' AND v_profissional IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>31 THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO';
  END IF;
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo') INTO v_fuso FROM public.barbearias b WHERE b.id=v_barbearia;

  RETURN QUERY
  WITH datas AS (
    SELECT d::date dia FROM generate_series(p_data_inicial,p_data_final,interval '1 day') d
  ), equipe AS (
    SELECT p.id,p.nome,p.apelido FROM public.profissionais p
    WHERE p.barbearia_id=v_barbearia AND p.ativo
      AND (v_role IN ('admin','master') OR p.id=v_profissional)
  ), base AS (
    SELECT d.dia,p.id,p.nome,p.apelido,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,
      d.dia::timestamp AT TIME ZONE v_fuso AS dia_inicio,
      (d.dia+1)::timestamp AT TIME ZONE v_fuso AS dia_fim
    FROM datas d CROSS JOIN equipe p
    LEFT JOIN public.profissionais_jornadas j
      ON j.barbearia_id=v_barbearia AND j.profissional_id=p.id
      AND j.dia_semana=extract(dow FROM d.dia)::smallint
  )
  SELECT b.dia,b.id,b.nome,b.apelido,COALESCE(b.ativo,false),b.hora_inicio,b.hora_fim,b.intervalo_inicio,b.intervalo_fim,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',h.id,'inicio',h.hora_inicio,'fim',h.hora_fim,'motivo',h.motivo) ORDER BY h.hora_inicio,h.id)
      FROM public.agenda_horarios_extras h
      WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id)
    ),'[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',pb.id,'inicio',pb.inicio,'fim',pb.fim,'motivo',pb.motivo) ORDER BY pb.inicio,pb.id)
      FROM public.profissionais_bloqueios pb
      WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<b.dia_fim AND pb.fim>b.dia_inicio
    ),'[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'agendamento_id',a.id,'inicio',a.data_hora,'fim',a.data_fim,
        'cliente',COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),
        'motivos',to_jsonb(array_remove(ARRAY[
          CASE WHEN EXISTS (
            SELECT 1 FROM public.profissionais_bloqueios pb
            WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora
          ) THEN 'Sobrepõe bloqueio' END,
          CASE WHEN NOT (
            (COALESCE(b.ativo,false)
              AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso
              AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso
              AND (b.intervalo_inicio IS NULL
                OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso
                OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso))
            OR EXISTS (
              SELECT 1 FROM public.agenda_horarios_extras h
              WHERE h.barbearia_id=v_barbearia AND h.data=b.dia
                AND (h.profissional_id IS NULL OR h.profissional_id=b.id)
                AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso
                AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso
            )
          ) THEN 'Fora da disponibilidade' END,
          CASE WHEN EXISTS (
            SELECT 1 FROM public.agendamentos other_a
            WHERE other_a.id<>a.id AND other_a.barbearia_id=v_barbearia AND other_a.profissional_id=b.id
              AND other_a.status IN ('pendente','confirmado','encaixe','em_atendimento')
              AND other_a.data_hora<a.data_fim AND other_a.data_fim>a.data_hora
          ) THEN 'Choque entre atendimentos' END
        ]::text[],NULL))
      ) ORDER BY a.data_hora,a.id)
      FROM public.agendamentos a
      LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_barbearia AND a.profissional_id=b.id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<b.dia_fim AND a.data_fim>b.dia_inicio
        AND (
          EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora)
          OR NOT (
            (COALESCE(b.ativo,false)
              AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso
              AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso
              AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso))
            OR EXISTS (
              SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia
                AND (h.profissional_id IS NULL OR h.profissional_id=b.id)
                AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.agendamentos other_a
            WHERE other_a.id<>a.id AND other_a.barbearia_id=v_barbearia AND other_a.profissional_id=b.id
              AND other_a.status IN ('pendente','confirmado','encaixe','em_atendimento')
              AND other_a.data_hora<a.data_fim AND other_a.data_fim>a.data_hora
          )
        )
    ),'[]'::jsonb)
  FROM base b
  ORDER BY b.dia,lower(COALESCE(b.apelido,b.nome)),b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_disponibilidade_periodo(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agenda_disponibilidade_periodo(date,date) TO authenticated;
