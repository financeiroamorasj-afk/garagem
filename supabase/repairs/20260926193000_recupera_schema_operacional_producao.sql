SET check_function_bodies = false;
BEGIN;
ALTER TABLE public.agendamentos DROP CONSTRAINT agendamentos_status_check;
DROP POLICY "Users can select from same barbearia" ON public.clientes;
DROP POLICY "Users can select produtos from same barbearia" ON public.produtos;
DROP POLICY "Users can select profiles from same barbearia" ON public.profiles;
DROP POLICY "Users can select from same barbearia" ON public.profissionais;
DROP POLICY "Users can select from same barbearia" ON public.servicos;
CREATE FUNCTION public.admin_agenda_listar_periodo(p_data_inicial date, p_data_final date)
 RETURNS TABLE(id uuid, profissional_id uuid, profissional_nome text, profissional_apelido text, cliente_id uuid, cliente_nome text, cliente_telefone text, servico_id uuid, servico_nome text, duracao_minutos integer, data_hora timestamp with time zone, status text, valor_final numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
COMMENT ON FUNCTION public.admin_agenda_listar_periodo(date,date) IS 'Lista até 42 dias da agenda da equipe para as visões administrativas de calendário.';
GRANT ALL ON FUNCTION public.admin_agenda_listar_periodo(date, date) TO authenticated;
GRANT ALL ON FUNCTION public.admin_agenda_listar_periodo(date, date) TO service_role;
CREATE FUNCTION public.admin_agenda_listar(p_data date)
 RETURNS TABLE(id uuid, profissional_id uuid, profissional_nome text, profissional_apelido text, cliente_id uuid, cliente_nome text, cliente_telefone text, servico_id uuid, servico_nome text, duracao_minutos integer, data_hora timestamp with time zone, status text, valor_final numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
COMMENT ON FUNCTION public.admin_agenda_listar(date) IS 'Lista a agenda diária de toda a equipe somente para administradores da barbearia autenticada.';
GRANT ALL ON FUNCTION public.admin_agenda_listar(date) TO authenticated;
GRANT ALL ON FUNCTION public.admin_agenda_listar(date) TO service_role;
CREATE FUNCTION public.admin_bloqueio_criar(p_profissional_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin(); v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia AND ativo) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<=p_inicio OR p_fim-p_inicio>interval '31 days' THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_INVALIDO';
  END IF;
  IF p_motivo IS NOT NULL AND length(btrim(p_motivo))>200 THEN RAISE EXCEPTION 'DISPONIBILIDADE_MOTIVO_INVALIDO'; END IF;
  INSERT INTO public.profissionais_bloqueios(barbearia_id,profissional_id,inicio,fim,motivo,criado_por)
  VALUES(v_barbearia,p_profissional_id,p_inicio,p_fim,NULLIF(btrim(p_motivo),''),auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id);
END;
$function$;
GRANT ALL ON FUNCTION public.admin_bloqueio_criar(uuid, timestamp with time zone, timestamp with time zone, text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_bloqueio_criar(uuid, timestamp with time zone, timestamp with time zone, text) TO service_role;
CREATE FUNCTION public.admin_bloqueio_excluir(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  DELETE FROM public.profissionais_bloqueios WHERE id=p_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_NAO_ENCONTRADO'; END IF;
  RETURN jsonb_build_object('id',p_id,'excluido',true);
END;
$function$;
GRANT ALL ON FUNCTION public.admin_bloqueio_excluir(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_bloqueio_excluir(uuid) TO service_role;
CREATE FUNCTION public.admin_bloqueios_listar(p_profissional_id uuid, p_data_inicial date, p_data_final date)
 RETURNS TABLE(id uuid, inicio timestamp with time zone, fim timestamp with time zone, motivo text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.admin_bloqueios_listar(uuid, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.admin_bloqueios_listar(uuid, date, date) TO service_role;
CREATE FUNCTION public.admin_checkout_estornar(p_fechamento_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_f public.atendimento_fechamentos%ROWTYPE; v_venda public.vendas_produtos%ROWTYPE; v_saldo integer;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'CHECKOUT_ESTORNO_NAO_AUTORIZADO'; END IF;
  IF length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'CHECKOUT_ESTORNO_MOTIVO_INVALIDO'; END IF;
  SELECT * INTO v_f FROM public.atendimento_fechamentos WHERE id=p_fechamento_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_NAO_ENCONTRADO'; END IF;
  IF v_f.status<>'concluido' THEN RAISE EXCEPTION 'CHECKOUT_JA_ESTORNADO'; END IF;
  FOR v_venda IN SELECT * FROM public.vendas_produtos WHERE barbearia_id=v_barbearia AND fechamento_id=v_f.id AND status='concluida' ORDER BY produto_id FOR UPDATE
  LOOP
    SELECT estoque_quantidade INTO v_saldo FROM public.produtos WHERE id=v_venda.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    UPDATE public.produtos SET estoque_quantidade=estoque_quantidade+v_venda.quantidade,updated_at=clock_timestamp() WHERE id=v_venda.produto_id;
    UPDATE public.vendas_produtos SET status='cancelada' WHERE id=v_venda.id;
    INSERT INTO public.estoque_movimentacoes(barbearia_id,produto_id,fechamento_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por)
    VALUES(v_barbearia,v_venda.produto_id,v_f.id,v_venda.id,'estorno',v_venda.quantidade,v_saldo,v_saldo+v_venda.quantidade,'Estorno: '||btrim(p_motivo),auth.uid());
  END LOOP;
  UPDATE public.financeiro_contas_receber SET status='estornado',updated_at=now() WHERE barbearia_id=v_barbearia AND fechamento_id=v_f.id AND status IN ('previsto','liquidado');
  UPDATE public.financeiro_movimentacoes SET status='estornado' WHERE barbearia_id=v_barbearia AND fechamento_id=v_f.id AND status='efetivado';
  UPDATE public.atendimento_fechamentos SET status='estornado',estornado_por=auth.uid(),estornado_em=now(),motivo_estorno=btrim(p_motivo) WHERE id=v_f.id RETURNING * INTO v_f;
  UPDATE public.agendamentos SET pagamento_status='estornado' WHERE id=v_f.agendamento_id AND barbearia_id=v_barbearia;
  RETURN to_jsonb(v_f);
END;
$function$;
COMMENT ON FUNCTION public.admin_checkout_estornar(uuid,text) IS 'Estorna checkout, financeiro e estoque preservando a memoria do atendimento para auditoria.';
GRANT ALL ON FUNCTION public.admin_checkout_estornar(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_checkout_estornar(uuid, text) TO service_role;
CREATE FUNCTION public.admin_horario_extra_criar(p_data date, p_hora_inicio time without time zone, p_hora_fim time without time zone, p_profissional_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_NAO_AUTORIZADO';
  END IF;
  IF p_data IS NULL OR p_hora_inicio IS NULL OR p_hora_fim IS NULL OR p_hora_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_INTERVALO_INVALIDO';
  END IF;
  IF p_motivo IS NOT NULL AND length(btrim(p_motivo)) > 200 THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_MOTIVO_INVALIDO';
  END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais
    WHERE id = p_profissional_id AND barbearia_id = v_barbearia AND ativo IS TRUE
  ) THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_PROFISSIONAL_INVALIDO';
  END IF;

  INSERT INTO public.agenda_horarios_extras (
    barbearia_id, profissional_id, data, hora_inicio, hora_fim, motivo, criado_por
  ) VALUES (
    v_barbearia, p_profissional_id, p_data, p_hora_inicio, p_hora_fim,
    NULLIF(btrim(p_motivo), ''), auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$function$;
GRANT ALL ON FUNCTION public.admin_horario_extra_criar(date, time without time zone, time without time zone, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_horario_extra_criar(date, time without time zone, time without time zone, uuid, text) TO service_role;
CREATE FUNCTION public.admin_horarios_extras_listar(p_data_inicial date, p_data_final date)
 RETURNS TABLE(id uuid, profissional_id uuid, profissional_nome text, profissional_apelido text, data date, hora_inicio time without time zone, hora_fim time without time zone, motivo text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_NAO_AUTORIZADO';
  END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final < p_data_inicial OR (p_data_final - p_data_inicial) > 41 THEN
    RAISE EXCEPTION 'HORARIO_EXTRA_PERIODO_INVALIDO';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.profissional_id,
    p.nome,
    p.apelido,
    h.data,
    h.hora_inicio,
    h.hora_fim,
    h.motivo,
    h.created_at
  FROM public.agenda_horarios_extras h
  LEFT JOIN public.profissionais p
    ON p.id = h.profissional_id AND p.barbearia_id = h.barbearia_id
  WHERE h.barbearia_id = v_barbearia
    AND h.data BETWEEN p_data_inicial AND p_data_final
  ORDER BY h.data, h.hora_inicio, COALESCE(p.apelido, p.nome);
END;
$function$;
GRANT ALL ON FUNCTION public.admin_horarios_extras_listar(date, date) TO authenticated;
GRANT ALL ON FUNCTION public.admin_horarios_extras_listar(date, date) TO service_role;
CREATE FUNCTION public.admin_jornadas_listar(p_profissional_id uuid)
 RETURNS TABLE(dia_semana smallint, ativo boolean, hora_inicio time without time zone, hora_fim time without time zone, intervalo_inicio time without time zone, intervalo_fim time without time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  RETURN QUERY
  SELECT j.dia_semana,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,j.updated_at
  FROM public.profissionais_jornadas j
  WHERE j.barbearia_id=v_barbearia AND j.profissional_id=p_profissional_id
  ORDER BY j.dia_semana;
END;
$function$;
GRANT ALL ON FUNCTION public.admin_jornadas_listar(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_jornadas_listar(uuid) TO service_role;
CREATE FUNCTION public.admin_jornadas_salvar(p_profissional_id uuid, p_dias jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.disponibilidade_assert_admin(); v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia AND ativo) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_PROFISSIONAL_INVALIDO';
  END IF;
  IF p_dias IS NULL OR jsonb_typeof(p_dias)<>'array' OR jsonb_array_length(p_dias)<>7 THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA';
  END IF;
  SELECT count(DISTINCT x.dia_semana) INTO v_count
  FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
  WHERE x.dia_semana BETWEEN 0 AND 6;
  IF v_count<>7 THEN RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
    WHERE x.ativo IS NULL
      OR (x.ativo AND (x.hora_inicio IS NULL OR x.hora_fim IS NULL OR x.hora_fim<=x.hora_inicio))
      OR (x.ativo AND ((x.intervalo_inicio IS NULL)<>(x.intervalo_fim IS NULL)))
      OR (x.ativo AND x.intervalo_inicio IS NOT NULL AND (
        x.intervalo_fim<=x.intervalo_inicio OR x.intervalo_inicio<=x.hora_inicio OR x.intervalo_fim>=x.hora_fim
      ))
  ) THEN RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA'; END IF;

  INSERT INTO public.profissionais_jornadas(
    barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim,updated_at
  )
  SELECT v_barbearia,p_profissional_id,x.dia_semana,x.ativo,
    CASE WHEN x.ativo THEN x.hora_inicio ELSE NULL END,
    CASE WHEN x.ativo THEN x.hora_fim ELSE NULL END,
    CASE WHEN x.ativo THEN x.intervalo_inicio ELSE NULL END,
    CASE WHEN x.ativo THEN x.intervalo_fim ELSE NULL END,
    clock_timestamp()
  FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
  ON CONFLICT(profissional_id,dia_semana) DO UPDATE SET
    ativo=excluded.ativo,hora_inicio=excluded.hora_inicio,hora_fim=excluded.hora_fim,
    intervalo_inicio=excluded.intervalo_inicio,intervalo_fim=excluded.intervalo_fim,updated_at=excluded.updated_at;
  RETURN jsonb_build_object('profissional_id',p_profissional_id,'dias',7);
END;
$function$;
GRANT ALL ON FUNCTION public.admin_jornadas_salvar(uuid, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_jornadas_salvar(uuid, jsonb) TO service_role;
CREATE FUNCTION public.admin_recepcao_resumo(p_data_inicial date, p_data_final date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_admin();
  v_inicio timestamptz;
  v_fim timestamptz;
  v_resumo jsonb;
  v_operadores jsonb;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>92 THEN
    RAISE EXCEPTION 'RECEPCAO_RELATORIO_PERIODO_INVALIDO';
  END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object(
    'cobrancas_atendimentos',count(*) FILTER (WHERE f.status='concluido'),
    'valor_atendimentos',COALESCE(sum(f.valor_final) FILTER (WHERE f.status='concluido'),0),
    'vendas_avulsas',(SELECT count(*) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'valor_vendas_avulsas',(SELECT COALESCE(sum(vb.valor_final),0) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'produtos_vendidos',(SELECT COALESCE(sum(vp.quantidade),0) FROM public.vendas_produtos vp JOIN public.vendas_balcao vb ON vb.id=vp.venda_balcao_id AND vb.barbearia_id=vp.barbearia_id WHERE vp.barbearia_id=v_barbearia AND vp.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'estornos_avulsos',(SELECT count(*) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim),
    'valor_estornado',(SELECT COALESCE(sum(vb.valor_final),0) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim),
    'devolucoes_ao_barbeiro',(SELECT count(*) FROM public.atendimento_operacao_log l WHERE l.barbearia_id=v_barbearia AND l.evento='cancelado' AND l.ator_papel='recepcao' AND l.criado_em>=v_inicio AND l.criado_em<v_fim)
  ) INTO v_resumo
  FROM public.atendimento_fechamentos f
  JOIN public.profiles fp ON fp.id=f.criado_por AND fp.barbearia_id=f.barbearia_id AND fp.role='recepcao'
  WHERE f.barbearia_id=v_barbearia AND f.criado_em>=v_inicio AND f.criado_em<v_fim;

  WITH operadores AS (
    SELECT p.id,p.nome,p.email,p.ativo
    FROM public.profiles p
    WHERE p.barbearia_id=v_barbearia AND p.role='recepcao'
  ), fechamentos AS (
    SELECT f.criado_por operador_id,count(*) FILTER (WHERE f.status='concluido')::integer cobrancas,
      COALESCE(sum(f.valor_final) FILTER (WHERE f.status='concluido'),0) valor
    FROM public.atendimento_fechamentos f
    WHERE f.barbearia_id=v_barbearia AND f.criado_em>=v_inicio AND f.criado_em<v_fim
    GROUP BY f.criado_por
  ), vendas AS (
    SELECT vb.criado_por operador_id,count(*) FILTER (WHERE vb.status='concluida')::integer vendas,
      COALESCE(sum(vb.valor_final) FILTER (WHERE vb.status='concluida'),0) valor,
      COALESCE(sum((SELECT sum(vp.quantidade) FROM public.vendas_produtos vp WHERE vp.barbearia_id=vb.barbearia_id AND vp.venda_balcao_id=vb.id AND vp.status='concluida')) FILTER (WHERE vb.status='concluida'),0)::integer produtos
    FROM public.vendas_balcao vb
    WHERE vb.barbearia_id=v_barbearia AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim
    GROUP BY vb.criado_por
  ), estornos AS (
    SELECT vb.estornado_por operador_id,count(*)::integer estornos
    FROM public.vendas_balcao vb
    WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim
    GROUP BY vb.estornado_por
  ), devolucoes AS (
    SELECT l.ator_id operador_id,count(*)::integer devolucoes
    FROM public.atendimento_operacao_log l
    WHERE l.barbearia_id=v_barbearia AND l.evento='cancelado' AND l.ator_papel='recepcao' AND l.criado_em>=v_inicio AND l.criado_em<v_fim
    GROUP BY l.ator_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',o.id,'nome',o.nome,'email',o.email,'ativo',o.ativo,
    'cobrancas_atendimentos',COALESCE(f.cobrancas,0),'valor_atendimentos',COALESCE(f.valor,0),
    'vendas_avulsas',COALESCE(v.vendas,0),'valor_vendas_avulsas',COALESCE(v.valor,0),
    'produtos_vendidos',COALESCE(v.produtos,0),'estornos',COALESCE(e.estornos,0),
    'devolucoes_ao_barbeiro',COALESCE(d.devolucoes,0)
  ) ORDER BY o.ativo DESC,lower(o.nome),o.id),'[]'::jsonb)
  INTO v_operadores
  FROM operadores o
  LEFT JOIN fechamentos f ON f.operador_id=o.id
  LEFT JOIN vendas v ON v.operador_id=o.id
  LEFT JOIN estornos e ON e.operador_id=o.id
  LEFT JOIN devolucoes d ON d.operador_id=o.id;

  RETURN jsonb_build_object('data_inicial',p_data_inicial,'data_final',p_data_final,'resumo',v_resumo,'operadores',v_operadores);
END;
$function$;
COMMENT ON FUNCTION public.admin_recepcao_resumo(date,date) IS 'Resumo operacional da recepcao para o gestor, sem expor o ledger financeiro ao operador de balcao.';
GRANT ALL ON FUNCTION public.admin_recepcao_resumo(date, date) TO authenticated;
GRANT ALL ON FUNCTION public.admin_recepcao_resumo(date, date) TO service_role;
CREATE FUNCTION public.agenda_assert_operador()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_role text:=public.get_my_role();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'AGENDA_ENCAIXE_NAO_AUTORIZADO';
  END IF;
  IF v_role='barbeiro' AND public.get_my_profissional_id() IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;
  RETURN v_barbearia;
END;
$function$;
GRANT ALL ON FUNCTION public.agenda_assert_operador() TO service_role;
CREATE FUNCTION public.agenda_cliente_criar_rapido(p_nome text, p_telefone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.agenda_assert_operador(); v_id uuid;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;
  IF p_telefone IS NOT NULL AND length(btrim(p_telefone)) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'AGENDA_TELEFONE_INVALIDO'; END IF;
  INSERT INTO public.clientes(barbearia_id,nome,telefone)
  VALUES(v_barbearia,btrim(p_nome),NULLIF(btrim(p_telefone),'')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'nome',btrim(p_nome),'telefone',NULLIF(btrim(p_telefone),''));
END;
$function$;
GRANT ALL ON FUNCTION public.agenda_cliente_criar_rapido(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.agenda_cliente_criar_rapido(text, text) TO service_role;
CREATE FUNCTION public.agenda_disponibilidade_calendario(p_data_inicial date, p_data_final date)
 RETURNS TABLE(data date, profissional_id uuid, profissional_nome text, profissional_apelido text, jornada_ativa boolean, hora_inicio time without time zone, hora_fim time without time zone, intervalo_inicio time without time zone, intervalo_fim time without time zone, horarios_extras jsonb, bloqueios jsonb, conflitos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.agenda_disponibilidade_calendario(date, date) TO authenticated;
GRANT ALL ON FUNCTION public.agenda_disponibilidade_calendario(date, date) TO service_role;
CREATE OR REPLACE FUNCTION public.agenda_disponibilidade_periodo(p_data_inicial date, p_data_final date)
 RETURNS TABLE(data date, profissional_id uuid, profissional_nome text, profissional_apelido text, jornada_ativa boolean, hora_inicio time without time zone, hora_fim time without time zone, intervalo_inicio time without time zone, intervalo_fim time without time zone, horarios_extras jsonb, bloqueios jsonb, conflitos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_role text:=public.get_my_role();
  v_profissional uuid:=public.get_my_profissional_id(); v_fuso text;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro','recepcao') THEN RAISE EXCEPTION 'DISPONIBILIDADE_VISUALIZACAO_NAO_AUTORIZADA'; END IF;
  IF v_role='recepcao' AND NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  IF v_role='barbeiro' AND v_profissional IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>31 THEN RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO'; END IF;
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo') INTO v_fuso FROM public.barbearias b WHERE b.id=v_barbearia;

  RETURN QUERY WITH datas AS (
    SELECT d::date dia FROM generate_series(p_data_inicial,p_data_final,interval '1 day') d
  ), equipe AS (
    SELECT p.id,p.nome,p.apelido FROM public.profissionais p WHERE p.barbearia_id=v_barbearia AND p.ativo
      AND (v_role IN ('admin','master','recepcao') OR p.id=v_profissional)
  ), base AS (
    SELECT d.dia,p.id,p.nome,p.apelido,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,
      d.dia::timestamp AT TIME ZONE v_fuso dia_inicio,(d.dia+1)::timestamp AT TIME ZONE v_fuso dia_fim
    FROM datas d CROSS JOIN equipe p LEFT JOIN public.profissionais_jornadas j ON j.barbearia_id=v_barbearia AND j.profissional_id=p.id AND j.dia_semana=extract(dow FROM d.dia)::smallint
  )
  SELECT b.dia,b.id,b.nome,b.apelido,COALESCE(b.ativo,false),b.hora_inicio,b.hora_fim,b.intervalo_inicio,b.intervalo_fim,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'inicio',h.hora_inicio,'fim',h.hora_fim,'motivo',h.motivo) ORDER BY h.hora_inicio,h.id) FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id)),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pb.id,'inicio',pb.inicio,'fim',pb.fim,'motivo',pb.motivo) ORDER BY pb.inicio,pb.id) FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<b.dia_fim AND pb.fim>b.dia_inicio),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('agendamento_id',a.id,'inicio',a.data_hora,'fim',a.data_fim,'cliente',COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),'motivos',to_jsonb(array_remove(ARRAY[
      CASE WHEN EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora) THEN 'Sobrepõe bloqueio' END,
      CASE WHEN NOT ((COALESCE(b.ativo,false) AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso)) OR EXISTS (SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id) AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso)) THEN 'Fora da disponibilidade' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.agendamentos oa WHERE oa.id<>a.id AND oa.barbearia_id=v_barbearia AND oa.profissional_id=b.id AND oa.status IN ('pendente','confirmado','encaixe','em_atendimento') AND oa.data_hora<a.data_fim AND oa.data_fim>a.data_hora) THEN 'Choque entre atendimentos' END
    ]::text[],NULL))) ORDER BY a.data_hora,a.id) FROM public.agendamentos a LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_barbearia AND a.profissional_id=b.id AND a.status IN ('pendente','confirmado','encaixe','em_atendimento') AND a.data_hora<b.dia_fim AND a.data_fim>b.dia_inicio AND (
        EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora)
        OR NOT ((COALESCE(b.ativo,false) AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso)) OR EXISTS (SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id) AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso))
        OR EXISTS (SELECT 1 FROM public.agendamentos oa WHERE oa.id<>a.id AND oa.barbearia_id=v_barbearia AND oa.profissional_id=b.id AND oa.status IN ('pendente','confirmado','encaixe','em_atendimento') AND oa.data_hora<a.data_fim AND oa.data_fim>a.data_hora)
      )),'[]'::jsonb)
  FROM base b ORDER BY b.dia,lower(COALESCE(b.apelido,b.nome)),b.id;
END;
$function$;
CREATE FUNCTION public.agenda_encaixe_catalogo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.agenda_assert_operador(); v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'servicos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'nome',s.nome,'preco',s.preco,'duracao_minutos',s.duracao_minutos
    ) ORDER BY lower(s.nome)) FROM public.servicos s WHERE s.barbearia_id=v_barbearia AND s.ativo),'[]'::jsonb),
    'clientes',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'nome',c.nome,'telefone',c.telefone
    ) ORDER BY lower(c.nome),c.id) FROM public.clientes c WHERE c.barbearia_id=v_barbearia),'[]'::jsonb),
    'profissionais',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',p.id,'nome',p.nome,'apelido',p.apelido
    ) ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id) FROM public.profissionais p WHERE p.barbearia_id=v_barbearia AND p.ativo),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
GRANT ALL ON FUNCTION public.agenda_encaixe_catalogo() TO authenticated;
GRANT ALL ON FUNCTION public.agenda_encaixe_catalogo() TO service_role;
CREATE FUNCTION public.agenda_encaixe_criar(p_cliente_id uuid, p_servico_id uuid, p_profissional_id uuid, p_inicio timestamp with time zone, p_valor_final numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.agenda_assert_operador();
  v_preco numeric; v_duracao integer; v_id uuid; v_fuso text; v_data date;
BEGIN
  IF p_inicio IS NULL THEN RAISE EXCEPTION 'AGENDA_ENCAIXE_FILTRO_INVALIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=p_cliente_id AND c.barbearia_id=v_barbearia) THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;
  SELECT s.preco,s.duracao_minutos INTO v_preco,v_duracao FROM public.servicos s
  WHERE s.id=p_servico_id AND s.barbearia_id=v_barbearia AND s.ativo;
  IF v_duracao IS NULL THEN RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id AND p.barbearia_id=v_barbearia AND p.ativo) THEN RAISE EXCEPTION 'AGENDA_PROFISSIONAL_INVALIDO'; END IF;
  IF p_valor_final IS NOT NULL AND p_valor_final<0 THEN RAISE EXCEPTION 'AGENDA_VALOR_INVALIDO'; END IF;
  SELECT b.fuso_horario INTO v_fuso FROM public.barbearias b WHERE b.id=v_barbearia;
  v_data:=(p_inicio AT TIME ZONE COALESCE(v_fuso,'America/Sao_Paulo'))::date;
  IF NOT EXISTS (
    SELECT 1 FROM public.agenda_horarios_livres(p_servico_id,v_data,p_profissional_id,1,50) h
    WHERE h.profissional_id=p_profissional_id AND h.inicio=p_inicio
  ) THEN RAISE EXCEPTION 'AGENDA_HORARIO_INDISPONIVEL'; END IF;

  INSERT INTO public.agendamentos(
    barbearia_id,profissional_id,cliente_id,servico_id,data_hora,duracao_minutos_snapshot,data_fim,valor_final,status
  ) VALUES (
    v_barbearia,p_profissional_id,p_cliente_id,p_servico_id,p_inicio,v_duracao,
    p_inicio+make_interval(mins=>v_duracao),COALESCE(p_valor_final,v_preco),'encaixe'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','encaixe','profissional_id',p_profissional_id,'inicio',p_inicio);
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN RAISE EXCEPTION 'AGENDA_HORARIO_INDISPONIVEL'; END IF;
  RAISE;
END;
$function$;
GRANT ALL ON FUNCTION public.agenda_encaixe_criar(uuid, uuid, uuid, timestamp with time zone, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.agenda_encaixe_criar(uuid, uuid, uuid, timestamp with time zone, numeric) TO service_role;
CREATE FUNCTION public.agenda_horarios_livres(p_servico_id uuid, p_data_inicial date, p_profissional_id uuid DEFAULT NULL::uuid, p_dias integer DEFAULT 14, p_limite integer DEFAULT 12)
 RETURNS TABLE(profissional_id uuid, profissional_nome text, profissional_apelido text, inicio timestamp with time zone, fim timestamp with time zone, duracao_minutos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.agenda_assert_operador();
  v_duracao integer;
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
      slot+make_interval(mins=>v_duracao) AS fim
    FROM janelas j
    CROSS JOIN LATERAL generate_series(
      j.janela_inicio,
      j.janela_fim-make_interval(mins=>v_duracao),
      interval '15 minutes'
    ) slot
    WHERE j.janela_fim-j.janela_inicio>=make_interval(mins=>v_duracao)
  )
  SELECT c.profissional_id,c.nome,c.apelido,c.inicio,c.fim,v_duracao
  FROM candidatos c
  WHERE c.inicio>=now()
    AND NOT EXISTS (
      SELECT 1 FROM public.profissionais_bloqueios b
      WHERE b.barbearia_id=v_barbearia AND b.profissional_id=c.profissional_id
        AND b.inicio<c.fim AND b.fim>c.inicio
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=v_barbearia AND a.profissional_id=c.profissional_id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<c.fim AND a.data_fim>c.inicio
    )
  ORDER BY c.inicio,lower(COALESCE(c.apelido,c.nome)),c.profissional_id
  LIMIT p_limite;
END;
$function$;
GRANT ALL ON FUNCTION public.agenda_horarios_livres(uuid, date, uuid, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.agenda_horarios_livres(uuid, date, uuid, integer, integer) TO service_role;
CREATE FUNCTION public.agendamentos_preparar_e_proteger_horario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  NEW.data_fim:=NEW.data_hora+make_interval(mins=>NEW.duracao_minutos_snapshot);

  IF NEW.status IN ('pendente','confirmado','encaixe','em_atendimento') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.profissional_id::text||':agenda',0));
    IF EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.profissional_id=NEW.profissional_id
        AND a.id IS DISTINCT FROM NEW.id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<NEW.data_fim AND a.data_fim>NEW.data_hora
    ) THEN RAISE EXCEPTION 'AGENDA_HORARIO_OCUPADO'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.agendamentos_preparar_e_proteger_horario() TO service_role;
CREATE FUNCTION public.barbeiro_agenda_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.barbeiro_agenda_contexto() TO authenticated;
GRANT ALL ON FUNCTION public.barbeiro_agenda_contexto() TO service_role;
CREATE FUNCTION public.barbeiro_agenda_listar_memoria(p_data date)
 RETURNS TABLE(id uuid, profissional_id uuid, cliente_id uuid, cliente_nome text, cliente_telefone text, cliente_preferencias text, servico_id uuid, servico_nome text, duracao_minutos integer, data_hora timestamp with time zone, status text, valor_final numeric, ultimo_corte jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profissional uuid:=public.get_my_profissional_id();
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_inicio timestamptz; v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO'; END IF;
  IF v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_data IS NULL THEN RAISE EXCEPTION 'AGENDA_DATA_INVALIDA'; END IF;
  v_inicio:=p_data::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  RETURN QUERY
  SELECT a.id,a.profissional_id,a.cliente_id,
    COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),c.telefone,c.notas_preferencias,
    a.servico_id,COALESCE(s.nome,'Serviço não informado'),
    COALESCE(a.duracao_minutos_snapshot,s.duracao_minutos,30),a.data_hora,a.status,a.valor_final,
    CASE WHEN cc.id IS NULL THEN NULL ELSE public.cliente_corte_json(cc) END
  FROM public.agendamentos a
  LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
  LEFT JOIN LATERAL (
    SELECT cut.* FROM public.cliente_cortes cut
    WHERE cut.barbearia_id=a.barbearia_id AND cut.cliente_id=a.cliente_id AND cut.ativo
    ORDER BY cut.criado_em DESC LIMIT 1
  ) cc ON true
  WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional
    AND a.data_hora>=v_inicio AND a.data_hora<v_fim
  ORDER BY a.data_hora,a.criado_em,a.id;
END;
$function$;
GRANT ALL ON FUNCTION public.barbeiro_agenda_listar_memoria(date) TO authenticated;
GRANT ALL ON FUNCTION public.barbeiro_agenda_listar_memoria(date) TO service_role;
CREATE OR REPLACE FUNCTION public.barbeiro_agenda_listar_periodo(p_data_inicial date, p_data_final date)
 RETURNS TABLE(id uuid, profissional_id uuid, cliente_id uuid, cliente_nome text, cliente_telefone text, cliente_preferencias text, servico_id uuid, servico_nome text, duracao_minutos integer, data_hora timestamp with time zone, status text, valor_final numeric, ultimo_corte jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_profissional uuid:=public.get_my_profissional_id(); v_barbearia uuid:=public.get_my_barbearia_id(); v_inicio timestamptz; v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial THEN RAISE EXCEPTION 'AGENDA_PERIODO_INVALIDO'; END IF;
  IF p_data_final-p_data_inicial>31 THEN RAISE EXCEPTION 'AGENDA_PERIODO_MUITO_LONGO'; END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  RETURN QUERY SELECT a.id,a.profissional_id,a.cliente_id,COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),c.telefone,c.notas_preferencias,
    a.servico_id,COALESCE(s.nome,'Serviço não informado'),COALESCE(a.duracao_minutos_snapshot,s.duracao_minutos,30),a.data_hora,a.status,a.valor_final,
    CASE WHEN cc.id IS NULL THEN NULL ELSE public.cliente_corte_json(cc) END
  FROM public.agendamentos a
  LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
  LEFT JOIN LATERAL (SELECT cut.* FROM public.cliente_cortes cut WHERE cut.barbearia_id=a.barbearia_id AND cut.cliente_id=a.cliente_id AND cut.ativo ORDER BY cut.criado_em DESC LIMIT 1) cc ON true
  WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional AND a.data_hora>=v_inicio AND a.data_hora<v_fim
  ORDER BY a.data_hora,a.criado_em,a.id;
END;
$function$;
CREATE FUNCTION public.barbeiro_agenda_listar(p_data date)
 RETURNS TABLE(id uuid, profissional_id uuid, cliente_id uuid, cliente_nome text, cliente_telefone text, cliente_preferencias text, servico_id uuid, servico_nome text, duracao_minutos integer, data_hora timestamp with time zone, status text, valor_final numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
COMMENT ON FUNCTION public.barbeiro_agenda_listar(date) IS 'Lista somente os agendamentos do profissional ativo vinculado ao usuário autenticado.';
GRANT ALL ON FUNCTION public.barbeiro_agenda_listar(date) TO authenticated;
GRANT ALL ON FUNCTION public.barbeiro_agenda_listar(date) TO service_role;
CREATE FUNCTION public.barbeiro_agendamento_mudar_status(p_agendamento_id uuid, p_status_esperado text, p_novo_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
COMMENT ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) IS 'Executa apenas transições operacionais autorizadas na agenda do barbeiro, com controle otimista de status.';
GRANT ALL ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid, text, text) TO service_role;
CREATE FUNCTION public.barbeiro_atendimento_concluir(p_agendamento_id uuid, p_estilo text, p_pentes text DEFAULT NULL::text, p_acabamento text DEFAULT NULL::text, p_barba text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_preferencias_cliente text DEFAULT NULL::text, p_foto_path text DEFAULT NULL::text, p_foto_mime text DEFAULT NULL::text, p_foto_bytes integer DEFAULT NULL::integer, p_foto_largura integer DEFAULT NULL::integer, p_foto_altura integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_profissional uuid:=public.get_my_profissional_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_corte public.cliente_cortes%ROWTYPE;
  v_prefixo text;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN
    RAISE EXCEPTION 'CORTE_NAO_AUTORIZADO';
  END IF;
  IF p_estilo IS NULL OR length(btrim(p_estilo)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'CORTE_ESTILO_INVALIDO'; END IF;
  IF length(COALESCE(p_pentes,''))>120 OR length(COALESCE(p_acabamento,''))>80
    OR length(COALESCE(p_barba,''))>80 OR length(COALESCE(p_observacoes,''))>1000
    OR length(COALESCE(p_preferencias_cliente,''))>1000 THEN RAISE EXCEPTION 'CORTE_TEXTO_INVALIDO'; END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
  WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CORTE_AGENDAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_agendamento.status<>'em_atendimento' THEN RAISE EXCEPTION 'CORTE_STATUS_INVALIDO'; END IF;
  IF v_agendamento.cliente_id IS NULL THEN RAISE EXCEPTION 'CORTE_CLIENTE_OBRIGATORIO'; END IF;

  v_prefixo:=v_barbearia::text||'/'||v_agendamento.cliente_id::text||'/';
  IF p_foto_path IS NOT NULL AND (
    p_foto_path NOT LIKE v_prefixo||'%' OR p_foto_mime NOT IN ('image/webp','image/jpeg')
    OR p_foto_bytes NOT BETWEEN 1 AND 1048576 OR p_foto_largura NOT BETWEEN 1 AND 1600 OR p_foto_altura NOT BETWEEN 1 AND 1600
  ) THEN RAISE EXCEPTION 'CORTE_FOTO_INVALIDA'; END IF;
  IF p_foto_path IS NULL AND (p_foto_mime IS NOT NULL OR p_foto_bytes IS NOT NULL OR p_foto_largura IS NOT NULL OR p_foto_altura IS NOT NULL) THEN
    RAISE EXCEPTION 'CORTE_FOTO_INVALIDA';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agendamento.cliente_id::text||':corte',0));
  UPDATE public.cliente_cortes SET ativo=false,arquivado_em=now()
  WHERE barbearia_id=v_barbearia AND cliente_id=v_agendamento.cliente_id AND ativo;

  INSERT INTO public.cliente_cortes(
    barbearia_id,cliente_id,agendamento_id,profissional_id,estilo,pentes,acabamento,barba,
    observacoes,preferencias_cliente,foto_path,foto_mime,foto_bytes,foto_largura,foto_altura,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.cliente_id,v_agendamento.id,v_profissional,btrim(p_estilo),
    NULLIF(btrim(p_pentes),''),NULLIF(btrim(p_acabamento),''),NULLIF(btrim(p_barba),''),
    NULLIF(btrim(p_observacoes),''),NULLIF(btrim(p_preferencias_cliente),''),
    p_foto_path,p_foto_mime,p_foto_bytes,p_foto_largura,p_foto_altura,auth.uid()
  ) RETURNING * INTO v_corte;

  UPDATE public.clientes SET notas_preferencias=NULLIF(btrim(p_preferencias_cliente),'')
  WHERE id=v_agendamento.cliente_id AND barbearia_id=v_barbearia;
  UPDATE public.agendamentos SET status='concluido' WHERE id=v_agendamento.id;

  RETURN jsonb_build_object('agendamento_id',v_agendamento.id,'status','concluido','corte',public.cliente_corte_json(v_corte));
END;
$function$;
GRANT ALL ON FUNCTION public.barbeiro_atendimento_concluir(uuid, text, text, text, text, text, text, text, text, integer, integer, integer) TO service_role;
CREATE FUNCTION public.barbeiro_atendimento_enviar_recepcao(p_agendamento_id uuid, p_memoria jsonb, p_produtos jsonb, p_valor_servico numeric, p_chave_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_profissional uuid := public.get_my_profissional_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_corte public.cliente_cortes%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_item record;
  v_estilo text;
  v_foto_path text;
  v_foto_mime text;
  v_prefixo text;
  v_count integer;
  v_total_produtos numeric(15,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN RAISE EXCEPTION 'FILA_RECEPCAO_NAO_AUTORIZADO'; END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'FILA_RECEPCAO_MODULO_INATIVO'; END IF;
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'FILA_RECEPCAO_CHAVE_INVALIDA'; END IF;

  SELECT * INTO v_pendencia FROM public.atendimento_pendencias WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN
    IF v_pendencia.agendamento_id<>p_agendamento_id THEN RAISE EXCEPTION 'FILA_RECEPCAO_CHAVE_EM_USO'; END IF;
    RETURN jsonb_build_object('idempotente',true,'modo','recepcao','pendencia_id',v_pendencia.id,'status',v_pendencia.status);
  END IF;

  IF p_valor_servico IS NULL OR p_valor_servico<0 OR p_valor_servico>99999999 THEN RAISE EXCEPTION 'FILA_RECEPCAO_VALOR_INVALIDO'; END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos)>20 THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_INVALIDOS'; END IF;
  IF p_memoria IS NULL OR jsonb_typeof(p_memoria)<>'object' THEN RAISE EXCEPTION 'FILA_RECEPCAO_MEMORIA_INVALIDA'; END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
  WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FILA_RECEPCAO_AGENDAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_agendamento.status<>'em_atendimento' THEN RAISE EXCEPTION 'FILA_RECEPCAO_STATUS_INVALIDO'; END IF;
  IF v_agendamento.cliente_id IS NULL THEN RAISE EXCEPTION 'FILA_RECEPCAO_CLIENTE_OBRIGATORIO'; END IF;

  v_estilo:=btrim(COALESCE(p_memoria->>'estilo',''));
  IF length(v_estilo) NOT BETWEEN 2 AND 80 OR length(COALESCE(p_memoria->>'pentes',''))>120
    OR length(COALESCE(p_memoria->>'acabamento',''))>80 OR length(COALESCE(p_memoria->>'barba',''))>80
    OR length(COALESCE(p_memoria->>'observacoes',''))>1000 OR length(COALESCE(p_memoria->>'preferencias_cliente',''))>1000
  THEN RAISE EXCEPTION 'FILA_RECEPCAO_MEMORIA_INVALIDA'; END IF;

  v_foto_path:=NULLIF(p_memoria->>'foto_path',''); v_foto_mime:=NULLIF(p_memoria->>'foto_mime','');
  v_prefixo:=v_barbearia::text||'/'||v_agendamento.cliente_id::text||'/';
  IF v_foto_path IS NOT NULL AND (v_foto_path NOT LIKE v_prefixo||'%' OR v_foto_mime NOT IN ('image/webp','image/jpeg')
    OR COALESCE((p_memoria->>'foto_bytes')::integer,0) NOT BETWEEN 1 AND 1048576
    OR COALESCE((p_memoria->>'foto_largura')::integer,0) NOT BETWEEN 1 AND 1600
    OR COALESCE((p_memoria->>'foto_altura')::integer,0) NOT BETWEEN 1 AND 1600) THEN RAISE EXCEPTION 'FILA_RECEPCAO_FOTO_INVALIDA'; END IF;
  IF v_foto_path IS NULL AND (v_foto_mime IS NOT NULL OR p_memoria ? 'foto_bytes' OR p_memoria ? 'foto_largura' OR p_memoria ? 'foto_altura') THEN RAISE EXCEPTION 'FILA_RECEPCAO_FOTO_INVALIDA'; END IF;

  SELECT count(*) INTO v_count FROM (SELECT item->>'produto_id' FROM jsonb_array_elements(p_produtos) item GROUP BY item->>'produto_id' HAVING count(*)>1) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_DUPLICADOS'; END IF;
  FOR v_item IN SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'FILA_RECEPCAO_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_total_produtos:=v_total_produtos+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;
  IF round(p_valor_servico,2)+v_total_produtos<=0 THEN RAISE EXCEPTION 'FILA_RECEPCAO_VALOR_INVALIDO'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agendamento.cliente_id::text||':corte',0));
  UPDATE public.cliente_cortes SET ativo=false,arquivado_em=now() WHERE barbearia_id=v_barbearia AND cliente_id=v_agendamento.cliente_id AND ativo;
  INSERT INTO public.cliente_cortes(barbearia_id,cliente_id,agendamento_id,profissional_id,estilo,pentes,acabamento,barba,observacoes,preferencias_cliente,foto_path,foto_mime,foto_bytes,foto_largura,foto_altura,criado_por)
  VALUES(v_barbearia,v_agendamento.cliente_id,v_agendamento.id,v_profissional,v_estilo,NULLIF(btrim(p_memoria->>'pentes'),''),NULLIF(btrim(p_memoria->>'acabamento'),''),NULLIF(btrim(p_memoria->>'barba'),''),NULLIF(btrim(p_memoria->>'observacoes'),''),NULLIF(btrim(p_memoria->>'preferencias_cliente'),''),v_foto_path,v_foto_mime,(p_memoria->>'foto_bytes')::integer,(p_memoria->>'foto_largura')::integer,(p_memoria->>'foto_altura')::integer,auth.uid()) RETURNING * INTO v_corte;
  UPDATE public.clientes SET notas_preferencias=NULLIF(btrim(p_memoria->>'preferencias_cliente'),'') WHERE id=v_agendamento.cliente_id AND barbearia_id=v_barbearia;

  INSERT INTO public.atendimento_pendencias(barbearia_id,agendamento_id,profissional_id,cliente_id,servico_id,memoria_corte_id,valor_servico,chave_idempotencia,criado_por)
  VALUES(v_barbearia,v_agendamento.id,v_profissional,v_agendamento.cliente_id,v_agendamento.servico_id,v_corte.id,round(p_valor_servico,2),p_chave_idempotencia,auth.uid()) RETURNING * INTO v_pendencia;

  FOR v_item IN SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia;
    INSERT INTO public.atendimento_itens_pendentes(barbearia_id,pendencia_id,produto_id,quantidade,preco_unitario_snapshot,adicionado_por_papel,adicionado_por)
    VALUES(v_barbearia,v_pendencia.id,v_produto.id,v_item.quantidade,v_produto.preco_venda,'barbeiro',auth.uid());
  END LOOP;

  UPDATE public.agendamentos SET status='aguardando_pagamento' WHERE id=v_agendamento.id;
  INSERT INTO public.atendimento_operacao_log(barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes)
  VALUES(v_barbearia,v_agendamento.id,v_pendencia.id,'enviado_recepcao',auth.uid(),'barbeiro',jsonb_build_object('valor_servico',round(p_valor_servico,2),'valor_produtos',v_total_produtos,'itens',jsonb_array_length(p_produtos)));

  RETURN jsonb_build_object('idempotente',false,'modo','recepcao','pendencia_id',v_pendencia.id,'status','aguardando_pagamento','corte',public.cliente_corte_json(v_corte));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FILA_RECEPCAO_PRODUTOS_INVALIDOS';
END;
$function$;
COMMENT ON FUNCTION public.barbeiro_atendimento_enviar_recepcao(uuid,jsonb,jsonb,numeric,uuid) IS 'Registra memória e carrinho pendente sem baixar estoque ou criar financeiro, e envia à fila da recepção.';
GRANT ALL ON FUNCTION public.barbeiro_atendimento_enviar_recepcao(uuid, jsonb, jsonb, numeric, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.barbeiro_atendimento_enviar_recepcao(uuid, jsonb, jsonb, numeric, uuid) TO service_role;
CREATE FUNCTION public.barbeiro_checkout_concluir(p_agendamento_id uuid, p_memoria jsonb, p_produtos jsonb, p_valor_servico numeric, p_desconto numeric, p_forma_pagamento text, p_taxa numeric, p_data_recebimento date, p_chave_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_profissional uuid:=public.get_my_profissional_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_servico public.servicos%ROWTYPE;
  v_fechamento public.atendimento_fechamentos%ROWTYPE;
  v_corte public.cliente_cortes%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_item record;
  v_conta uuid; v_categoria_servico uuid; v_categoria_produto uuid;
  v_recebivel uuid;
  v_produtos_bruto numeric(15,2):=0; v_bruto numeric(15,2); v_final numeric(15,2);
  v_servico_liquido numeric(15,2); v_produtos_liquido numeric(15,2);
  v_taxa_servico numeric(15,2); v_taxa_produtos numeric(15,2);
  v_comissao_pct numeric(5,2); v_comissao_produtos numeric(15,2):=0;
  v_linha_bruta numeric(15,2); v_linha_desconto numeric(15,2); v_linha_liquida numeric(15,2);
  v_desconto_produtos_restante numeric(15,2); v_bruto_produtos_restante numeric(15,2);
  v_saldo_antes integer; v_prefixo text; v_liquidado boolean; v_competencia date;
  v_estilo text; v_foto_path text; v_foto_mime text; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_barbearia IS NULL OR v_profissional IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_NAO_AUTORIZADO';
  END IF;
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CHAVE_INVALIDA'; END IF;
  SELECT * INTO v_fechamento FROM public.atendimento_fechamentos
  WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN
    IF v_fechamento.agendamento_id<>p_agendamento_id THEN RAISE EXCEPTION 'CHECKOUT_CHAVE_EM_USO'; END IF;
    RETURN jsonb_build_object('idempotente',true,'fechamento',to_jsonb(v_fechamento));
  END IF;

  IF p_valor_servico IS NULL OR p_valor_servico<0 OR p_valor_servico>99999999 THEN RAISE EXCEPTION 'CHECKOUT_VALOR_INVALIDO'; END IF;
  IF p_desconto IS NULL OR p_desconto<0 THEN RAISE EXCEPTION 'CHECKOUT_DESCONTO_INVALIDO'; END IF;
  IF p_taxa IS NULL OR p_taxa<0 THEN RAISE EXCEPTION 'CHECKOUT_TAXA_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'CHECKOUT_PAGAMENTO_INVALIDO'; END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento<current_date THEN RAISE EXCEPTION 'CHECKOUT_DATA_RECEBIMENTO_INVALIDA'; END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos)>20 THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_INVALIDOS'; END IF;
  IF p_memoria IS NULL OR jsonb_typeof(p_memoria)<>'object' THEN RAISE EXCEPTION 'CHECKOUT_MEMORIA_INVALIDA'; END IF;

  SELECT * INTO v_agendamento FROM public.agendamentos
  WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_AGENDAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_agendamento.status<>'em_atendimento' THEN RAISE EXCEPTION 'CHECKOUT_STATUS_INVALIDO'; END IF;
  IF v_agendamento.cliente_id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CLIENTE_OBRIGATORIO'; END IF;
  SELECT * INTO v_servico FROM public.servicos WHERE id=v_agendamento.servico_id AND barbearia_id=v_barbearia;

  v_estilo:=btrim(COALESCE(p_memoria->>'estilo',''));
  IF length(v_estilo) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'CHECKOUT_MEMORIA_INVALIDA'; END IF;
  IF length(COALESCE(p_memoria->>'pentes',''))>120 OR length(COALESCE(p_memoria->>'acabamento',''))>80
    OR length(COALESCE(p_memoria->>'barba',''))>80 OR length(COALESCE(p_memoria->>'observacoes',''))>1000
    OR length(COALESCE(p_memoria->>'preferencias_cliente',''))>1000 THEN RAISE EXCEPTION 'CHECKOUT_MEMORIA_INVALIDA'; END IF;
  v_foto_path:=NULLIF(p_memoria->>'foto_path',''); v_foto_mime:=NULLIF(p_memoria->>'foto_mime','');
  v_prefixo:=v_barbearia::text||'/'||v_agendamento.cliente_id::text||'/';
  IF v_foto_path IS NOT NULL AND (v_foto_path NOT LIKE v_prefixo||'%' OR v_foto_mime NOT IN ('image/webp','image/jpeg')
    OR COALESCE((p_memoria->>'foto_bytes')::integer,0) NOT BETWEEN 1 AND 1048576
    OR COALESCE((p_memoria->>'foto_largura')::integer,0) NOT BETWEEN 1 AND 1600
    OR COALESCE((p_memoria->>'foto_altura')::integer,0) NOT BETWEEN 1 AND 1600) THEN RAISE EXCEPTION 'CHECKOUT_FOTO_INVALIDA'; END IF;
  IF v_foto_path IS NULL AND (v_foto_mime IS NOT NULL OR p_memoria ? 'foto_bytes' OR p_memoria ? 'foto_largura' OR p_memoria ? 'foto_altura') THEN
    RAISE EXCEPTION 'CHECKOUT_FOTO_INVALIDA';
  END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT item->>'produto_id' id FROM jsonb_array_elements(p_produtos) item GROUP BY item->>'produto_id' HAVING count(*)>1
  ) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_DUPLICADOS'; END IF;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade<1 OR v_item.quantidade>100 THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'CHECKOUT_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_produtos_bruto:=v_produtos_bruto+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;

  v_bruto:=round(p_valor_servico,2)+v_produtos_bruto;
  IF v_bruto<=0 OR p_desconto>v_bruto THEN RAISE EXCEPTION 'CHECKOUT_DESCONTO_INVALIDO'; END IF;
  v_final:=round(v_bruto-p_desconto,2);
  IF p_taxa>v_final THEN RAISE EXCEPTION 'CHECKOUT_TAXA_INVALIDA'; END IF;
  v_servico_liquido:=round(v_final*round(p_valor_servico,2)/v_bruto,2);
  v_produtos_liquido:=v_final-v_servico_liquido;
  v_taxa_servico:=CASE WHEN v_final=0 THEN 0 ELSE round(p_taxa*v_servico_liquido/v_final,2) END;
  v_taxa_produtos:=round(p_taxa-v_taxa_servico,2);
  v_comissao_pct:=COALESCE(v_servico.comissao_percentual,(SELECT comissao_percentual FROM public.profissionais WHERE id=v_profissional),0);
  v_competencia:=(v_agendamento.data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
  v_liquidado:=p_data_recebimento=current_date;

  SELECT id INTO v_conta FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia AND ativa ORDER BY conta_principal DESC,created_at,id LIMIT 1;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CONTA_NAO_CONFIGURADA'; END IF;
  SELECT id INTO v_categoria_servico FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_servicos' ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_categoria_produto FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_produtos' ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.atendimento_fechamentos(
    barbearia_id,agendamento_id,profissional_id,cliente_id,servico_nome_snapshot,valor_servico_bruto,
    valor_produtos_bruto,desconto,valor_servico_liquido,valor_produtos_liquido,valor_final,taxa,forma_pagamento,
    data_recebimento,comissao_servico_percentual,comissao_servico_valor,chave_idempotencia,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.id,v_profissional,v_agendamento.cliente_id,COALESCE(v_servico.nome,'Servico'),round(p_valor_servico,2),
    v_produtos_bruto,round(p_desconto,2),v_servico_liquido,v_produtos_liquido,v_final,round(p_taxa,2),p_forma_pagamento,
    p_data_recebimento,v_comissao_pct,round(v_servico_liquido*v_comissao_pct/100,2),p_chave_idempotencia,auth.uid()
  ) RETURNING * INTO v_fechamento;

  v_desconto_produtos_restante:=v_produtos_bruto-v_produtos_liquido;
  v_bruto_produtos_restante:=v_produtos_bruto;
  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    v_linha_bruta:=round(v_produto.preco_venda*v_item.quantidade,2);
    v_linha_desconto:=CASE WHEN v_bruto_produtos_restante=v_linha_bruta THEN v_desconto_produtos_restante
      ELSE round((v_produtos_bruto-v_produtos_liquido)*v_linha_bruta/v_produtos_bruto,2) END;
    v_linha_liquida:=v_linha_bruta-v_linha_desconto;
    v_saldo_antes:=v_produto.estoque_quantidade;
    UPDATE public.produtos SET estoque_quantidade=estoque_quantidade-v_item.quantidade,updated_at=clock_timestamp() WHERE id=v_produto.id;
    INSERT INTO public.vendas_produtos(
      barbearia_id,agendamento_id,profissional_id,nome_produto,valor_venda,produto_id,cliente_id,quantidade,
      preco_unitario_snapshot,preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,
      forma_pagamento,chave_idempotencia,criado_por,fechamento_id,desconto_valor
    ) VALUES (
      v_barbearia,v_agendamento.id,v_profissional,v_produto.nome,v_linha_bruta,v_produto.id,v_agendamento.cliente_id,v_item.quantidade,
      v_produto.preco_venda,v_produto.preco_custo,'concluida',COALESCE(v_produto.comissao_percentual,0),
      round(v_linha_liquida*COALESCE(v_produto.comissao_percentual,0)/100,2),p_forma_pagamento,
      extensions.uuid_generate_v4(),auth.uid(),v_fechamento.id,v_linha_desconto
    ) RETURNING * INTO v_venda;
    INSERT INTO public.estoque_movimentacoes(barbearia_id,produto_id,fechamento_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por)
    VALUES(v_barbearia,v_produto.id,v_fechamento.id,v_venda.id,'venda',-v_item.quantidade,v_saldo_antes,v_saldo_antes-v_item.quantidade,'Venda no atendimento',auth.uid());
    v_comissao_produtos:=v_comissao_produtos+v_venda.comissao_valor;
    v_desconto_produtos_restante:=v_desconto_produtos_restante-v_linha_desconto;
    v_bruto_produtos_restante:=v_bruto_produtos_restante-v_linha_bruta;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agendamento.cliente_id::text||':corte',0));
  UPDATE public.cliente_cortes SET ativo=false,arquivado_em=now()
  WHERE barbearia_id=v_barbearia AND cliente_id=v_agendamento.cliente_id AND ativo;
  INSERT INTO public.cliente_cortes(
    barbearia_id,cliente_id,agendamento_id,profissional_id,estilo,pentes,acabamento,barba,observacoes,
    preferencias_cliente,foto_path,foto_mime,foto_bytes,foto_largura,foto_altura,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.cliente_id,v_agendamento.id,v_profissional,v_estilo,NULLIF(btrim(p_memoria->>'pentes'),''),
    NULLIF(btrim(p_memoria->>'acabamento'),''),NULLIF(btrim(p_memoria->>'barba'),''),NULLIF(btrim(p_memoria->>'observacoes'),''),
    NULLIF(btrim(p_memoria->>'preferencias_cliente'),''),v_foto_path,v_foto_mime,(p_memoria->>'foto_bytes')::integer,
    (p_memoria->>'foto_largura')::integer,(p_memoria->>'foto_altura')::integer,auth.uid()
  ) RETURNING * INTO v_corte;
  UPDATE public.clientes SET notas_preferencias=NULLIF(btrim(p_memoria->>'preferencias_cliente'),'')
  WHERE id=v_agendamento.cliente_id AND barbearia_id=v_barbearia;

  IF v_servico_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Atendimento - '||COALESCE(v_servico.nome,'Servico'),v_servico_liquido,v_taxa_servico,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_agendamento.cliente_id,v_categoria_servico,'servico',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
      VALUES(v_barbearia,v_conta,'entrada',v_servico_liquido,v_competencia,p_data_recebimento,v_categoria_servico,'checkout',p_chave_idempotencia::text||':servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento do atendimento');
      IF v_taxa_servico>0 THEN
        INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
        VALUES(v_barbearia,v_conta,'saida',v_taxa_servico,v_competencia,p_data_recebimento,'taxa_checkout',p_chave_idempotencia::text||':taxa-servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa do atendimento');
      END IF;
    END IF;
  END IF;

  IF v_produtos_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Produtos do atendimento',v_produtos_liquido,v_taxa_produtos,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_agendamento.cliente_id,v_categoria_produto,'produto',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
      VALUES(v_barbearia,v_conta,'entrada',v_produtos_liquido,v_competencia,p_data_recebimento,v_categoria_produto,'checkout',p_chave_idempotencia::text||':produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento dos produtos');
      IF v_taxa_produtos>0 THEN
        INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,conta_receber_id,agendamento_id,fechamento_id,descricao)
        VALUES(v_barbearia,v_conta,'saida',v_taxa_produtos,v_competencia,p_data_recebimento,'taxa_checkout',p_chave_idempotencia::text||':taxa-produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa dos produtos');
      END IF;
    END IF;
  END IF;

  UPDATE public.atendimento_fechamentos SET comissao_produtos_valor=v_comissao_produtos,
    comissao_total=comissao_servico_valor+v_comissao_produtos WHERE id=v_fechamento.id RETURNING * INTO v_fechamento;
  UPDATE public.agendamentos SET status='concluido',valor_final=v_servico_liquido,
    pagamento_status=CASE WHEN v_liquidado THEN 'pago' ELSE 'pendente' END,
    pagamento_provedor=p_forma_pagamento,pagamento_referencia=v_fechamento.id::text WHERE id=v_agendamento.id;

  RETURN jsonb_build_object('idempotente',false,'fechamento',to_jsonb(v_fechamento),'corte',public.cliente_corte_json(v_corte));
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CHECKOUT_PRODUTOS_INVALIDOS';
END;
$function$;
COMMENT ON FUNCTION public.barbeiro_checkout_concluir(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid) IS 'Fecha atendimento de forma atomica: memoria, produtos, estoque, comissoes e financeiro.';
GRANT ALL ON FUNCTION public.barbeiro_checkout_concluir(uuid, jsonb, jsonb, numeric, numeric, text, numeric, date, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.barbeiro_checkout_concluir(uuid, jsonb, jsonb, numeric, numeric, text, numeric, date, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.barbeiro_painel_resumo(p_data_inicial date, p_data_final date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_profissional uuid:=public.get_my_profissional_id(); v_barbearia uuid:=public.get_my_barbearia_id(); v_inicio timestamptz; v_fim timestamptz; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'PAINEL_BARBEIRO_NAO_AUTORIZADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>92 THEN RAISE EXCEPTION 'PAINEL_PERIODO_INVALIDO'; END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo'; v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  WITH atendimento AS (
    SELECT count(*) FILTER(WHERE a.status='concluido')::int atendimentos,
      count(*) FILTER(WHERE a.status IN ('pendente','confirmado','encaixe','em_atendimento'))::int proximos,
      COALESCE(sum(COALESCE(a.valor_final,s.preco,0)) FILTER(WHERE a.status='concluido'),0) valor_servicos,
      COALESCE(sum(round(COALESCE(a.valor_final,s.preco,0)*COALESCE(s.comissao_percentual,p.comissao_percentual,0)/100,2)) FILTER(WHERE a.status='concluido'),0) comissao_servicos
    FROM public.profissionais p
    LEFT JOIN public.agendamentos a ON a.profissional_id=p.id AND a.barbearia_id=p.barbearia_id AND a.data_hora>=v_inicio AND a.data_hora<v_fim
    LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
    WHERE p.id=v_profissional AND p.barbearia_id=v_barbearia
  ), produto AS (
    SELECT count(*) FILTER(WHERE vp.status='concluida')::int vendas_produtos,
      COALESCE(sum(vp.valor_liquido) FILTER(WHERE vp.status='concluida'),0) valor_produtos,
      COALESCE(sum(vp.comissao_valor) FILTER(WHERE vp.status='concluida'),0) comissao_produtos
    FROM public.vendas_produtos vp WHERE vp.barbearia_id=v_barbearia AND vp.profissional_id=v_profissional AND vp.criado_em>=v_inicio AND vp.criado_em<v_fim
  ) SELECT jsonb_build_object('data_inicial',p_data_inicial,'data_final',p_data_final,
    'atendimentos',a.atendimentos,'proximos',a.proximos,'valor_servicos',a.valor_servicos,
    'comissao_servicos',a.comissao_servicos,'vendas_produtos',pr.vendas_produtos,
    'valor_produtos',pr.valor_produtos,'comissao_produtos',pr.comissao_produtos,
    'valor_total',a.valor_servicos+pr.valor_produtos,'comissao_total',a.comissao_servicos+pr.comissao_produtos)
  INTO v_result FROM atendimento a CROSS JOIN produto pr;
  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.barbeiro_produto_vender(p_produto_id uuid, p_quantidade integer, p_agendamento_id uuid, p_forma_pagamento text, p_chave_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.get_my_profissional_id(); v_produto public.produtos%ROWTYPE; v_agendamento public.agendamentos%ROWTYPE; v_venda public.vendas_produtos%ROWTYPE; v_total numeric; v_comissao numeric;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_AUTORIZADA'; END IF;
  IF p_quantidade IS NULL OR p_quantidade<1 OR p_quantidade>100 THEN RAISE EXCEPTION 'VENDA_PRODUTO_QUANTIDADE_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'VENDA_PRODUTO_PAGAMENTO_INVALIDO'; END IF;
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_CHAVE_INVALIDA'; END IF;
  SELECT * INTO v_venda FROM public.vendas_produtos WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN RETURN to_jsonb(v_venda); END IF;
  SELECT * INTO v_produto FROM public.produtos WHERE id=p_produto_id AND barbearia_id=v_barbearia AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_ENCONTRADO'; END IF;
  IF v_produto.estoque_quantidade<p_quantidade THEN RAISE EXCEPTION 'VENDA_PRODUTO_ESTOQUE_INSUFICIENTE'; END IF;
  IF p_agendamento_id IS NOT NULL THEN
    SELECT * INTO v_agendamento FROM public.agendamentos WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional;
    IF NOT FOUND THEN RAISE EXCEPTION 'VENDA_PRODUTO_ATENDIMENTO_INVALIDO'; END IF;
  END IF;
  v_total:=round(v_produto.preco_venda*p_quantidade,2); v_comissao:=round(v_total*COALESCE(v_produto.comissao_percentual,0)/100,2);
  UPDATE public.produtos SET estoque_quantidade=estoque_quantidade-p_quantidade,updated_at=clock_timestamp() WHERE id=v_produto.id;
  INSERT INTO public.vendas_produtos(barbearia_id,agendamento_id,profissional_id,nome_produto,valor_venda,produto_id,cliente_id,quantidade,preco_unitario_snapshot,preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,forma_pagamento,chave_idempotencia,criado_por)
  VALUES(v_barbearia,p_agendamento_id,v_profissional,v_produto.nome,v_total,v_produto.id,CASE WHEN p_agendamento_id IS NULL THEN NULL ELSE v_agendamento.cliente_id END,p_quantidade,v_produto.preco_venda,v_produto.preco_custo,'concluida',COALESCE(v_produto.comissao_percentual,0),v_comissao,p_forma_pagamento,p_chave_idempotencia,auth.uid())
  RETURNING * INTO v_venda;
  RETURN to_jsonb(v_venda);
END;
$function$;
CREATE OR REPLACE FUNCTION public.barbeiro_produtos_listar()
 RETURNS TABLE(id uuid, nome text, sku text, categoria text, descricao text, preco_venda numeric, estoque_quantidade integer, comissao_percentual numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.get_my_profissional_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_AUTORIZADA'; END IF;
  RETURN QUERY SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.estoque_quantidade,
    COALESCE(p.comissao_percentual,prof.comissao_produtos_percentual,0)::numeric
  FROM public.produtos p
  JOIN public.profissionais prof ON prof.id=v_profissional AND prof.barbearia_id=v_barbearia
  WHERE p.barbearia_id=v_barbearia AND p.ativo ORDER BY (p.estoque_quantidade>0) DESC,p.nome,p.id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.barbeiros_atualizar(p_profissional_id uuid, p_nome text, p_apelido text, p_telefone text, p_especialidade text, p_comissao_percentual numeric, p_comissao_produtos_percentual numeric, p_ativo boolean, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_antes public.profissionais%ROWTYPE; v_depois public.profissionais%ROWTYPE;
  v_nome text:=btrim(p_nome); v_apelido text:=NULLIF(btrim(p_apelido),''); v_telefone text:=NULLIF(btrim(p_telefone),''); v_especialidade text:=NULLIF(btrim(p_especialidade),'');
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'admin' OR v_barbearia IS NULL THEN RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO'; END IF;
  IF p_profissional_id IS NULL OR p_expected_updated_at IS NULL OR p_ativo IS NULL THEN RAISE EXCEPTION 'BARBEIROS_DADOS_INVALIDOS'; END IF;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'BARBEIROS_NOME_INVALIDO'; END IF;
  IF v_apelido IS NOT NULL AND length(v_apelido) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'BARBEIROS_APELIDO_INVALIDO'; END IF;
  IF v_telefone IS NOT NULL AND length(v_telefone) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'BARBEIROS_TELEFONE_INVALIDO'; END IF;
  IF v_especialidade IS NOT NULL AND length(v_especialidade)>100 THEN RAISE EXCEPTION 'BARBEIROS_ESPECIALIDADE_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'BARBEIROS_COMISSAO_INVALIDA'; END IF;
  IF p_comissao_produtos_percentual IS NOT NULL AND p_comissao_produtos_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'BARBEIROS_COMISSAO_PRODUTOS_INVALIDA'; END IF;
  SELECT * INTO v_antes FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARBEIROS_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'BARBEIROS_CONFLITO_VERSAO'; END IF;
  UPDATE public.profissionais SET nome=v_nome,apelido=v_apelido,telefone=v_telefone,especialidade=v_especialidade,
    comissao_percentual=p_comissao_percentual,comissao_produtos_percentual=p_comissao_produtos_percentual,
    ativo=p_ativo,updated_at=clock_timestamp()
  WHERE id=v_antes.id RETURNING * INTO v_depois;
  RETURN jsonb_build_object('id',v_depois.id,'ativo',v_depois.ativo,'updated_at',v_depois.updated_at);
END;
$function$;
CREATE OR REPLACE FUNCTION public.barbeiros_listar(p_incluir_inativos boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, apelido text, telefone text, especialidade text, foto_url text, comissao_percentual numeric, comissao_produtos_percentual numeric, ativo boolean, user_id uuid, email text, criado_em timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'admin' OR v_barbearia IS NULL THEN RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO'; END IF;
  RETURN QUERY SELECT p.id,p.nome,p.apelido,p.telefone,p.especialidade,p.foto_url,
    p.comissao_percentual,p.comissao_produtos_percentual,p.ativo,p.user_id,pr.email,p.criado_em,p.updated_at
  FROM public.profissionais p
  LEFT JOIN public.profiles pr ON pr.id=p.user_id AND pr.barbearia_id=p.barbearia_id
  WHERE p.barbearia_id=v_barbearia AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC,COALESCE(NULLIF(btrim(p.apelido),''),p.nome),p.nome;
END;
$function$;
CREATE FUNCTION public.catalogo_assert_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'CATALOGO_NAO_AUTORIZADO';
  END IF;
  RETURN v_barbearia;
END;
$function$;
GRANT ALL ON FUNCTION public.catalogo_assert_admin() TO authenticated;
GRANT ALL ON FUNCTION public.catalogo_assert_admin() TO service_role;
CREATE FUNCTION public.catalogo_validar_materiais(p_barbearia uuid, p_materiais jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_itens jsonb := COALESCE(p_materiais,'[]'::jsonb);
BEGIN
  IF jsonb_typeof(v_itens) <> 'array' THEN RAISE EXCEPTION 'CATALOGO_MATERIAIS_INVALIDOS'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) x(material_id uuid, quantidade numeric, observacao text)
    LEFT JOIN public.materiais_servico m ON m.id=x.material_id AND m.barbearia_id=p_barbearia AND m.ativo
    WHERE m.id IS NULL OR x.quantidade IS NULL OR x.quantidade <= 0
      OR (x.observacao IS NOT NULL AND length(btrim(x.observacao)) > 200)
  ) THEN RAISE EXCEPTION 'CATALOGO_MATERIAIS_INVALIDOS'; END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(v_itens) x(material_id uuid)) <>
     (SELECT count(DISTINCT material_id) FROM jsonb_to_recordset(v_itens) x(material_id uuid)) THEN
    RAISE EXCEPTION 'CATALOGO_MATERIAIS_INVALIDOS';
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION public.catalogo_validar_materiais(uuid, jsonb) TO service_role;
CREATE FUNCTION public.checkout_bloquear_barbeiro_com_recepcao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND public.get_my_role()='barbeiro' AND public.modulo_acesso_verificar('recepcao') THEN
    RAISE EXCEPTION 'CHECKOUT_USAR_RECEPCAO';
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.checkout_bloquear_barbeiro_com_recepcao() TO service_role;
CREATE FUNCTION public.cliente_corte_ultimo(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_role text:=public.get_my_role();
  v_corte public.cliente_cortes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'CORTE_NAO_AUTORIZADO';
  END IF;
  IF v_role='barbeiro' AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.barbearia_id=v_barbearia AND a.cliente_id=p_cliente_id
      AND a.profissional_id=public.get_my_profissional_id()
  ) THEN RAISE EXCEPTION 'CORTE_CLIENTE_NAO_AUTORIZADO'; END IF;
  SELECT * INTO v_corte FROM public.cliente_cortes
  WHERE barbearia_id=v_barbearia AND cliente_id=p_cliente_id AND ativo
  ORDER BY criado_em DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.cliente_corte_json(v_corte);
END;
$function$;
GRANT ALL ON FUNCTION public.cliente_corte_ultimo(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cliente_corte_ultimo(uuid) TO service_role;
CREATE FUNCTION public.cliente_cpf_hash(p_barbearia uuid, p_cpf text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_cpf text:=public.cliente_cpf_normalizar(p_cpf); v_secret uuid;
BEGIN
  SELECT portal_segredo INTO v_secret FROM public.barbearias WHERE id=p_barbearia;
  IF v_secret IS NULL THEN RAISE EXCEPTION 'CLIENTE_BARBEARIA_INVALIDA'; END IF;
  RETURN encode(extensions.hmac(v_cpf,v_secret::text,'sha256'),'hex');
END;
$function$;
GRANT ALL ON FUNCTION public.cliente_cpf_hash(uuid, text) TO service_role;
CREATE FUNCTION public.cliente_cpf_normalizar(p_cpf text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text:=regexp_replace(COALESCE(p_cpf,''),'\D','','g'); s integer; d1 integer; d2 integer; i integer;
BEGIN
  IF length(v)<>11 OR v~'^([0-9])\1{10}$' THEN RAISE EXCEPTION 'CLIENTE_CPF_INVALIDO'; END IF;
  s:=0; FOR i IN 1..9 LOOP s:=s+(substr(v,i,1)::integer*(11-i)); END LOOP;
  d1:=CASE WHEN (s*10)%11=10 THEN 0 ELSE (s*10)%11 END;
  s:=0; FOR i IN 1..10 LOOP s:=s+(substr(v,i,1)::integer*(12-i)); END LOOP;
  d2:=CASE WHEN (s*10)%11=10 THEN 0 ELSE (s*10)%11 END;
  IF d1<>substr(v,10,1)::integer OR d2<>substr(v,11,1)::integer THEN RAISE EXCEPTION 'CLIENTE_CPF_INVALIDO'; END IF;
  RETURN v;
END;
$function$;
GRANT ALL ON FUNCTION public.cliente_cpf_normalizar(text) TO service_role;
CREATE FUNCTION public.cliente_ficha_detalhe(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.clientes_assert_admin(); v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'cliente',jsonb_build_object(
      'id',c.id,'nome',c.nome,'telefone',c.telefone,'cpf_cadastrado',c.cpf_hash IS NOT NULL,'cpf_final',rtrim(c.cpf_final),
      'barbeiro_favorito_id',c.barbeiro_favorito_id,'barbeiro_favorito_nome',COALESCE(p.apelido,p.nome),
      'notas_preferencias',c.notas_preferencias,'criado_em',c.criado_em,'updated_at',c.updated_at
    ),
    'cortes',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',cc.id,'estilo',cc.estilo,'pentes',cc.pentes,'acabamento',cc.acabamento,'barba',cc.barba,
      'observacoes',cc.observacoes,'preferencias_cliente',cc.preferencias_cliente,'foto_path',CASE WHEN cc.foto_excluida_em IS NULL THEN cc.foto_path END,
      'ativo',cc.ativo,'criado_em',cc.criado_em,'profissional_nome',COALESCE(cp.apelido,cp.nome),'servico_nome',COALESCE(s.nome,'Serviço')
    ) ORDER BY cc.ativo DESC,cc.criado_em DESC) FROM public.cliente_cortes cc
      JOIN public.profissionais cp ON cp.id=cc.profissional_id AND cp.barbearia_id=cc.barbearia_id
      LEFT JOIN public.agendamentos ca ON ca.id=cc.agendamento_id AND ca.barbearia_id=cc.barbearia_id
      LEFT JOIN public.servicos s ON s.id=ca.servico_id AND s.barbearia_id=ca.barbearia_id
      WHERE cc.barbearia_id=v_barbearia AND cc.cliente_id=c.id),'[]'::jsonb),
    'atendimentos',COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'data_hora')::timestamptz DESC) FROM (
      SELECT jsonb_build_object('id',a.id,'data_hora',a.data_hora,'status',a.status,'valor_final',a.valor_final,
        'profissional_nome',COALESCE(ap.apelido,ap.nome),'servico_nome',COALESCE(sa.nome,'Serviço')) item
      FROM public.agendamentos a
      LEFT JOIN public.profissionais ap ON ap.id=a.profissional_id AND ap.barbearia_id=a.barbearia_id
      LEFT JOIN public.servicos sa ON sa.id=a.servico_id AND sa.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id ORDER BY a.data_hora DESC LIMIT 50
    ) history),'[]'::jsonb)
  ) INTO v_result
  FROM public.clientes c
  LEFT JOIN public.profissionais p ON p.id=c.barbeiro_favorito_id AND p.barbearia_id=c.barbearia_id
  WHERE c.id=p_cliente_id AND c.barbearia_id=v_barbearia;
  IF v_result IS NULL THEN RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO'; END IF;
  RETURN v_result;
END;
$function$;
GRANT ALL ON FUNCTION public.cliente_ficha_detalhe(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cliente_ficha_detalhe(uuid) TO service_role;
CREATE FUNCTION public.cliente_salvar(p_cliente_id uuid, p_nome text, p_telefone text, p_cpf text, p_remover_cpf boolean, p_barbeiro_favorito_id uuid, p_notas_preferencias text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.clientes_assert_admin(); v_id uuid; v_updated timestamptz:=clock_timestamp();
  v_cpf text; v_hash text; v_final text; v_criando boolean:=p_cliente_id IS NULL;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'CLIENTE_NOME_INVALIDO'; END IF;
  IF p_telefone IS NOT NULL AND btrim(p_telefone)<>'' AND length(btrim(p_telefone)) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'CLIENTE_TELEFONE_INVALIDO'; END IF;
  IF length(COALESCE(p_notas_preferencias,''))>1000 THEN RAISE EXCEPTION 'CLIENTE_PREFERENCIAS_INVALIDAS'; END IF;
  IF p_barbeiro_favorito_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais p WHERE p.id=p_barbeiro_favorito_id AND p.barbearia_id=v_barbearia AND p.ativo
  ) THEN RAISE EXCEPTION 'CLIENTE_BARBEIRO_INVALIDO'; END IF;
  IF p_cpf IS NOT NULL AND btrim(p_cpf)<>'' THEN
    v_cpf:=public.cliente_cpf_normalizar(p_cpf); v_hash:=public.cliente_cpf_hash(v_barbearia,v_cpf); v_final:=right(v_cpf,4);
  END IF;

  IF v_criando THEN
    INSERT INTO public.clientes(barbearia_id,nome,telefone,cpf_hash,cpf_final,barbeiro_favorito_id,notas_preferencias,updated_at)
    VALUES(v_barbearia,btrim(p_nome),NULLIF(btrim(p_telefone),''),v_hash,v_final,p_barbeiro_favorito_id,NULLIF(btrim(p_notas_preferencias),''),v_updated)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.clientes SET
      nome=btrim(p_nome),telefone=NULLIF(btrim(p_telefone),''),barbeiro_favorito_id=p_barbeiro_favorito_id,
      notas_preferencias=NULLIF(btrim(p_notas_preferencias),''),
      cpf_hash=CASE WHEN p_remover_cpf THEN NULL WHEN v_hash IS NOT NULL THEN v_hash ELSE cpf_hash END,
      cpf_final=CASE WHEN p_remover_cpf THEN NULL WHEN v_hash IS NOT NULL THEN v_final ELSE cpf_final END,
      updated_at=v_updated
    WHERE id=p_cliente_id AND barbearia_id=v_barbearia AND updated_at=p_expected_updated_at;
    IF NOT FOUND THEN
      IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=p_cliente_id AND barbearia_id=v_barbearia) THEN RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO'; END IF;
      RAISE EXCEPTION 'CLIENTE_CONFLITO_VERSAO';
    END IF;
    v_id:=p_cliente_id;
  END IF;
  RETURN jsonb_build_object('id',v_id,'updated_at',v_updated,'cpf_cadastrado',CASE WHEN p_remover_cpf THEN false WHEN v_hash IS NOT NULL THEN true ELSE (SELECT cpf_hash IS NOT NULL FROM public.clientes WHERE id=v_id) END);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CLIENTE_CPF_DUPLICADO';
END;
$function$;
GRANT ALL ON FUNCTION public.cliente_salvar(uuid, text, text, text, boolean, uuid, text, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.cliente_salvar(uuid, text, text, text, boolean, uuid, text, timestamp with time zone) TO service_role;
CREATE FUNCTION public.clientes_assert_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'CLIENTES_NAO_AUTORIZADO'; END IF;
  RETURN v;
END;
$function$;
GRANT ALL ON FUNCTION public.clientes_assert_admin() TO service_role;
CREATE FUNCTION public.clientes_listar(p_busca text DEFAULT NULL::text, p_limite integer DEFAULT 100)
 RETURNS TABLE(id uuid, nome text, telefone text, cpf_cadastrado boolean, cpf_final text, barbeiro_favorito_id uuid, barbeiro_favorito_nome text, notas_preferencias text, updated_at timestamp with time zone, total_atendimentos bigint, ultima_visita timestamp with time zone, proximo_horario timestamp with time zone, ultimo_corte jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.clientes_assert_admin(); v_busca text:=btrim(COALESCE(p_busca,'')); v_digits text; v_hash text;
BEGIN
  IF p_limite NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'CLIENTES_LIMITE_INVALIDO'; END IF;
  v_digits:=regexp_replace(v_busca,'\D','','g');
  IF length(v_digits)=11 THEN
    BEGIN v_hash:=public.cliente_cpf_hash(v_barbearia,v_digits); EXCEPTION WHEN OTHERS THEN v_hash:=NULL; END;
  END IF;
  RETURN QUERY
  SELECT c.id,c.nome,c.telefone,c.cpf_hash IS NOT NULL,rtrim(c.cpf_final),c.barbeiro_favorito_id,
    COALESCE(p.apelido,p.nome),c.notas_preferencias,c.updated_at,
    (SELECT count(*) FROM public.agendamentos a WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status='concluido'),
    (SELECT max(a.data_hora) FROM public.agendamentos a WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status='concluido'),
    (SELECT min(a.data_hora) FROM public.agendamentos a WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status IN ('pendente','confirmado','encaixe') AND a.data_hora>=now()),
    CASE WHEN cut.id IS NULL THEN NULL ELSE public.cliente_corte_json(cut) END
  FROM public.clientes c
  LEFT JOIN public.profissionais p ON p.id=c.barbeiro_favorito_id AND p.barbearia_id=c.barbearia_id
  LEFT JOIN LATERAL (
    SELECT cc.* FROM public.cliente_cortes cc WHERE cc.barbearia_id=v_barbearia AND cc.cliente_id=c.id AND cc.ativo
    ORDER BY cc.criado_em DESC LIMIT 1
  ) cut ON true
  WHERE c.barbearia_id=v_barbearia AND (
    v_busca='' OR lower(unaccent(c.nome)) LIKE '%'||lower(unaccent(v_busca))||'%'
    OR regexp_replace(COALESCE(c.telefone,''),'\D','','g') LIKE '%'||v_digits||'%'
    OR (length(v_digits)=4 AND c.cpf_final=v_digits) OR (v_hash IS NOT NULL AND c.cpf_hash=v_hash)
  )
  ORDER BY lower(c.nome),c.id LIMIT p_limite;
END;
$function$;
GRANT ALL ON FUNCTION public.clientes_listar(text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.clientes_listar(text, integer) TO service_role;
CREATE FUNCTION public.configuracoes_modulo_definir_ativo(p_modulo text, p_ativo boolean, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_role text := public.get_my_role();
  v_modulo public.barbearia_modulos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'MODULO_SEM_PERMISSAO';
  END IF;
  IF p_modulo IS NULL OR p_modulo <> 'recepcao' OR p_ativo IS NULL THEN
    RAISE EXCEPTION 'MODULO_INVALIDO';
  END IF;

  SELECT * INTO v_modulo
  FROM public.barbearia_modulos
  WHERE barbearia_id = v_barbearia AND modulo = p_modulo
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODULO_NAO_CONTRATADO';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_modulo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'MODULO_CONFLITO_VERSAO';
  END IF;
  IF p_ativo AND NOT public.modulo_contratado_e_vigente(
    v_modulo.status_contrato,
    v_modulo.trial_ate,
    v_modulo.vigente_ate
  ) THEN
    RAISE EXCEPTION 'MODULO_NAO_CONTRATADO';
  END IF;

  UPDATE public.barbearia_modulos
  SET ativo_na_unidade = p_ativo,
      updated_at = clock_timestamp()
  WHERE id = v_modulo.id
  RETURNING * INTO v_modulo;

  RETURN jsonb_build_object(
    'chave', v_modulo.modulo,
    'ativo', v_modulo.ativo_na_unidade,
    'status_contrato', v_modulo.status_contrato,
    'updated_at', v_modulo.updated_at
  );
END;
$function$;
GRANT ALL ON FUNCTION public.configuracoes_modulo_definir_ativo(text, boolean, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.configuracoes_modulo_definir_ativo(text, boolean, timestamp with time zone) TO service_role;
CREATE FUNCTION public.configuracoes_modulos_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_role text := public.get_my_role();
  v_modulo public.barbearia_modulos%ROWTYPE;
  v_vigente boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'MODULO_SEM_PERMISSAO';
  END IF;

  SELECT * INTO v_modulo
  FROM public.barbearia_modulos
  WHERE barbearia_id = v_barbearia AND modulo = 'recepcao';

  IF FOUND THEN
    v_vigente := public.modulo_contratado_e_vigente(
      v_modulo.status_contrato,
      v_modulo.trial_ate,
      v_modulo.vigente_ate
    );
  END IF;

  RETURN jsonb_build_array(jsonb_build_object(
    'chave', 'recepcao',
    'nome', 'Recepção',
    'descricao', 'Atendimento e cobrança no balcão, com produtos encaminhados pela equipe.',
    'status_contrato', CASE WHEN FOUND THEN v_modulo.status_contrato ELSE 'nao_contratado' END,
    'contratado', v_vigente,
    'ativo', CASE WHEN FOUND THEN v_modulo.ativo_na_unidade AND v_vigente ELSE false END,
    'trial_ate', CASE WHEN FOUND THEN v_modulo.trial_ate ELSE NULL END,
    'vigente_ate', CASE WHEN FOUND THEN v_modulo.vigente_ate ELSE NULL END,
    'updated_at', CASE WHEN FOUND THEN v_modulo.updated_at ELSE NULL END
  ));
END;
$function$;
GRANT ALL ON FUNCTION public.configuracoes_modulos_listar() TO authenticated;
GRANT ALL ON FUNCTION public.configuracoes_modulos_listar() TO service_role;
CREATE FUNCTION public.configuracoes_pix_obter()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_config public.barbearias%ROWTYPE;
BEGIN
  IF v_barbearia IS NULL THEN RAISE EXCEPTION 'PIX_ACESSO_NEGADO'; END IF;
  SELECT * INTO v_config FROM public.barbearias WHERE id = v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'PIX_ACESSO_NEGADO'; END IF;
  RETURN jsonb_build_object(
    'configurado', v_config.pix_chave IS NOT NULL,
    'chave', v_config.pix_chave,
    'beneficiario', v_config.pix_beneficiario,
    'cidade', v_config.pix_cidade
  );
END; $function$;
COMMENT ON FUNCTION public.configuracoes_pix_obter() IS 'Retorna somente a configuracao Pix da barbearia autenticada para gerar BR Code estatico no checkout.';
GRANT ALL ON FUNCTION public.configuracoes_pix_obter() TO authenticated;
GRANT ALL ON FUNCTION public.configuracoes_pix_obter() TO service_role;
CREATE FUNCTION public.configuracoes_pix_salvar(p_chave text, p_beneficiario text, p_cidade text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_barbearia uuid := public.financeiro_assert_admin();
  v_chave text := NULLIF(btrim(p_chave), '');
  v_beneficiario text := NULLIF(btrim(p_beneficiario), '');
  v_cidade text := NULLIF(btrim(p_cidade), '');
  v_antes boolean;
BEGIN
  SELECT pix_chave IS NOT NULL INTO v_antes FROM public.barbearias WHERE id = v_barbearia FOR UPDATE;

  IF v_chave IS NULL AND v_beneficiario IS NULL AND v_cidade IS NULL THEN
    UPDATE public.barbearias
    SET pix_chave = NULL, pix_beneficiario = NULL, pix_cidade = NULL
    WHERE id = v_barbearia;
  ELSE
    IF v_chave IS NULL OR char_length(v_chave) > 77 THEN RAISE EXCEPTION 'PIX_CHAVE_INVALIDA'; END IF;
    IF v_beneficiario IS NULL OR char_length(v_beneficiario) NOT BETWEEN 2 AND 25 THEN RAISE EXCEPTION 'PIX_BENEFICIARIO_INVALIDO'; END IF;
    IF v_cidade IS NULL OR char_length(v_cidade) NOT BETWEEN 2 AND 15 THEN RAISE EXCEPTION 'PIX_CIDADE_INVALIDA'; END IF;
    UPDATE public.barbearias
    SET pix_chave = v_chave, pix_beneficiario = v_beneficiario, pix_cidade = v_cidade
    WHERE id = v_barbearia;
  END IF;

  PERFORM public.financeiro_auditar(
    v_barbearia,
    'rpc',
    'barbearias_pix',
    v_barbearia,
    jsonb_build_object('configurado', v_antes),
    jsonb_build_object('configurado', v_chave IS NOT NULL),
    NULL
  );

  RETURN public.configuracoes_pix_obter();
END; $function$;
COMMENT ON FUNCTION public.configuracoes_pix_salvar(text,text,text) IS 'Salva ou remove a configuracao Pix da unidade; somente administradores e sem registrar a chave na auditoria.';
GRANT ALL ON FUNCTION public.configuracoes_pix_salvar(text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.configuracoes_pix_salvar(text, text, text) TO service_role;
CREATE FUNCTION public.disponibilidade_assert_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_NAO_AUTORIZADO';
  END IF;
  RETURN v_barbearia;
END;
$function$;
GRANT ALL ON FUNCTION public.disponibilidade_assert_admin() TO service_role;
CREATE OR REPLACE FUNCTION public.financeiro_assert_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_barbearia uuid;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'FINANCEIRO_SEM_PERMISSAO';
  END IF;
  v_barbearia := public.get_my_barbearia_id();
  IF v_barbearia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_SEM_BARBEARIA'; END IF;
  RETURN v_barbearia;
END; $function$;
CREATE OR REPLACE FUNCTION public.financeiro_auditar(p_barbearia uuid, p_origem text, p_entidade text, p_entidade_id uuid, p_antes jsonb, p_depois jsonb, p_correlation_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  INSERT INTO public.financeiro_audit_log (barbearia_id, autor_id, correlation_id, origem, entidade, entidade_id, antes, depois)
  VALUES (p_barbearia, auth.uid(), p_correlation_id, p_origem, p_entidade, p_entidade_id, p_antes, p_depois);
$function$;
CREATE FUNCTION public.financeiro_cancelar_titulo_manual(p_tipo text, p_titulo_id uuid, p_expected_updated_at timestamp with time zone, p_motivo text, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_barbearia uuid;
  v_motivo text;
  v_correlation text;
  v_pagar_antes public.financeiro_contas_pagar%ROWTYPE;
  v_pagar_depois public.financeiro_contas_pagar%ROWTYPE;
  v_receber_antes public.financeiro_contas_receber%ROWTYPE;
  v_receber_depois public.financeiro_contas_receber%ROWTYPE;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_motivo := btrim(p_motivo);
  v_correlation := nullif(btrim(p_correlation_id), '');

  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_titulo_id IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_VERSAO_INVALIDA'; END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_MOTIVO_INVALIDO'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;

  IF p_tipo = 'pagar' THEN
    SELECT * INTO v_pagar_antes
    FROM public.financeiro_contas_pagar
    WHERE id = p_titulo_id AND barbearia_id = v_barbearia
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
    IF v_pagar_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
    IF v_pagar_antes.status <> 'pendente' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_CANCELAVEL'; END IF;
    IF v_pagar_antes.envelope_resgate_transacao_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_COM_RESERVA'; END IF;
    IF v_pagar_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

    UPDATE public.financeiro_contas_pagar
    SET status = 'cancelado', updated_at = clock_timestamp()
    WHERE id = v_pagar_antes.id
    RETURNING * INTO v_pagar_depois;

    PERFORM public.financeiro_auditar(
      v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar_depois.id,
      to_jsonb(v_pagar_antes), to_jsonb(v_pagar_depois) || jsonb_build_object('motivo_cancelamento', v_motivo), v_correlation
    );
    RETURN jsonb_build_object('id', v_pagar_depois.id, 'tipo', 'pagar', 'status', v_pagar_depois.status, 'updated_at', v_pagar_depois.updated_at);
  END IF;

  SELECT * INTO v_receber_antes
  FROM public.financeiro_contas_receber
  WHERE id = p_titulo_id AND barbearia_id = v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_receber_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
  IF v_receber_antes.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_CANCELAVEL'; END IF;
  IF v_receber_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

  UPDATE public.financeiro_contas_receber
  SET status = 'cancelado', updated_at = clock_timestamp()
  WHERE id = v_receber_antes.id
  RETURNING * INTO v_receber_depois;

  PERFORM public.financeiro_auditar(
    v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber_depois.id,
    to_jsonb(v_receber_antes), to_jsonb(v_receber_depois) || jsonb_build_object('motivo_cancelamento', v_motivo), v_correlation
  );
  RETURN jsonb_build_object('id', v_receber_depois.id, 'tipo', 'receber', 'status', v_receber_depois.status, 'updated_at', v_receber_depois.updated_at);
END; $function$;
GRANT ALL ON FUNCTION public.financeiro_cancelar_titulo_manual(text, uuid, timestamp with time zone, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.financeiro_cancelar_titulo_manual(text, uuid, timestamp with time zone, text, text) TO service_role;
CREATE FUNCTION public.financeiro_criar_titulo_manual(p_tipo text, p_descricao text, p_valor numeric, p_taxa numeric, p_data_evento date, p_data_competencia date, p_metodo_pagamento text, p_categoria_id uuid, p_idempotency_key text, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_barbearia uuid;
  v_descricao text;
  v_metodo text;
  v_chave text;
  v_correlation text;
  v_valor numeric(15,2);
  v_taxa numeric(15,2);
  v_payload jsonb;
  v_hash text;
  v_intencao public.financeiro_idempotencia%ROWTYPE;
  v_pagar public.financeiro_contas_pagar%ROWTYPE;
  v_receber public.financeiro_contas_receber%ROWTYPE;
  v_resposta jsonb;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_descricao := btrim(p_descricao);
  v_metodo := nullif(btrim(p_metodo_pagamento), '');
  v_chave := btrim(p_idempotency_key);
  v_correlation := nullif(btrim(p_correlation_id), '');

  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF v_descricao IS NULL OR length(v_descricao) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_DESCRICAO_INVALIDA'; END IF;
  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') OR p_valor <= 0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_data_evento IS NULL OR p_data_competencia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  IF v_chave IS NULL OR length(v_chave) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;

  v_valor := round(p_valor, 2);
  v_taxa := round(COALESCE(p_taxa, 0), 2);
  IF v_valor <= 0 OR v_taxa < 0 OR v_taxa > v_valor THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_tipo = 'pagar' AND (v_taxa <> 0 OR v_metodo IS NOT NULL) THEN RAISE EXCEPTION 'FINANCEIRO_CAMPOS_TITULO_INVALIDOS'; END IF;
  IF p_tipo = 'receber' AND (v_metodo IS NULL OR length(v_metodo) NOT BETWEEN 2 AND 50) THEN RAISE EXCEPTION 'FINANCEIRO_METODO_PAGAMENTO_INVALIDO'; END IF;

  IF p_categoria_id IS NOT NULL THEN
    PERFORM 1
    FROM public.financeiro_categorias
    WHERE id = p_categoria_id
      AND barbearia_id = v_barbearia
      AND ativa
      AND (tipo = 'ambos' OR tipo = CASE WHEN p_tipo = 'pagar' THEN 'saida' ELSE 'entrada' END);
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_INVALIDA'; END IF;
  END IF;

  v_payload := jsonb_build_object(
    'tipo', p_tipo,
    'descricao', v_descricao,
    'valor', v_valor,
    'taxa', v_taxa,
    'data_evento', p_data_evento,
    'data_competencia', p_data_competencia,
    'metodo_pagamento', v_metodo,
    'categoria_id', p_categoria_id
  );
  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':criar_titulo_manual:' || v_chave, 0));
  SELECT * INTO v_intencao
  FROM public.financeiro_idempotencia
  WHERE barbearia_id = v_barbearia
    AND operacao = 'criar_titulo_manual:' || p_tipo
    AND idempotency_key = v_chave
  FOR UPDATE;

  IF FOUND THEN
    IF v_intencao.payload_hash <> v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF;
    RETURN v_intencao.resposta || jsonb_build_object('idempotente', true);
  END IF;

  IF p_tipo = 'pagar' THEN
    INSERT INTO public.financeiro_contas_pagar(
      barbearia_id, descricao, valor, data_vencimento, data_competencia, categoria_id, origem
    ) VALUES (
      v_barbearia, v_descricao, v_valor, p_data_evento, p_data_competencia, p_categoria_id, 'manual'
    ) RETURNING * INTO v_pagar;

    v_resposta := jsonb_build_object(
      'id', v_pagar.id, 'tipo', 'pagar', 'descricao', v_pagar.descricao,
      'valor', v_pagar.valor, 'taxa', 0, 'data_evento', v_pagar.data_vencimento,
      'data_competencia', v_pagar.data_competencia, 'metodo_pagamento', NULL,
      'categoria_id', v_pagar.categoria_id, 'status', v_pagar.status,
      'origem', v_pagar.origem, 'updated_at', v_pagar.updated_at
    );
    PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar.id, NULL, to_jsonb(v_pagar), v_correlation);
  ELSE
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id, descricao, valor_bruto, taxa, data_previsao, data_competencia,
      metodo_pagamento, categoria_id, origem
    ) VALUES (
      v_barbearia, v_descricao, v_valor, v_taxa, p_data_evento, p_data_competencia,
      v_metodo, p_categoria_id, 'manual'
    ) RETURNING * INTO v_receber;

    v_resposta := jsonb_build_object(
      'id', v_receber.id, 'tipo', 'receber', 'descricao', v_receber.descricao,
      'valor', v_receber.valor_liquido, 'valor_bruto', v_receber.valor_bruto,
      'taxa', v_receber.taxa, 'data_evento', v_receber.data_previsao,
      'data_competencia', v_receber.data_competencia, 'metodo_pagamento', v_receber.metodo_pagamento,
      'categoria_id', v_receber.categoria_id, 'status', v_receber.status,
      'origem', v_receber.origem, 'updated_at', v_receber.updated_at
    );
    PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber.id, NULL, to_jsonb(v_receber), v_correlation);
  END IF;

  INSERT INTO public.financeiro_idempotencia(barbearia_id, operacao, idempotency_key, payload_hash, resposta)
  VALUES(v_barbearia, 'criar_titulo_manual:' || p_tipo, v_chave, v_hash, v_resposta);

  RETURN v_resposta || jsonb_build_object('idempotente', false);
END; $function$;
GRANT ALL ON FUNCTION public.financeiro_criar_titulo_manual(text, text, numeric, numeric, date, date, text, uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.financeiro_criar_titulo_manual(text, text, numeric, numeric, date, date, text, uuid, text, text) TO service_role;
CREATE FUNCTION public.financeiro_criar_titulos_em_lote(p_tipo text, p_modalidade text, p_descricao text, p_valor numeric, p_taxa numeric, p_data_evento date, p_data_competencia date, p_metodo_pagamento text, p_categoria_id uuid, p_quantidade integer, p_idempotency_key text, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_barbearia uuid := public.financeiro_assert_admin();
  v_grupo uuid := extensions.uuid_generate_v4();
  v_descricao text := btrim(p_descricao);
  v_metodo text := nullif(btrim(p_metodo_pagamento), '');
  v_chave text := btrim(p_idempotency_key);
  v_correlation text := nullif(btrim(p_correlation_id), '');
  v_valor numeric(15,2) := round(p_valor, 2);
  v_taxa numeric(15,2) := round(COALESCE(p_taxa, 0), 2);
  v_valor_centavos bigint;
  v_taxa_centavos bigint;
  v_valor_item numeric(15,2);
  v_taxa_item numeric(15,2);
  v_data_evento date;
  v_data_competencia date;
  v_payload jsonb;
  v_hash text;
  v_intencao public.financeiro_idempotencia%ROWTYPE;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_pagar public.financeiro_contas_pagar%ROWTYPE;
  v_receber public.financeiro_contas_receber%ROWTYPE;
  v_resposta jsonb;
  i integer;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_modalidade IS NULL OR p_modalidade NOT IN ('parcelado', 'recorrente') THEN RAISE EXCEPTION 'FINANCEIRO_MODALIDADE_INVALIDA'; END IF;
  IF p_quantidade IS NULL OR p_quantidade NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'FINANCEIRO_QUANTIDADE_INVALIDA'; END IF;
  IF v_descricao IS NULL OR length(v_descricao) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_DESCRICAO_INVALIDA'; END IF;
  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') OR v_valor <= 0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_data_evento IS NULL OR p_data_competencia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  IF v_chave IS NULL OR length(v_chave) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  IF v_taxa < 0 OR v_taxa > v_valor THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_tipo = 'pagar' AND (v_taxa <> 0 OR v_metodo IS NOT NULL) THEN RAISE EXCEPTION 'FINANCEIRO_CAMPOS_TITULO_INVALIDOS'; END IF;
  IF p_tipo = 'receber' AND (v_metodo IS NULL OR length(v_metodo) NOT BETWEEN 2 AND 50) THEN RAISE EXCEPTION 'FINANCEIRO_METODO_PAGAMENTO_INVALIDO'; END IF;

  IF p_categoria_id IS NOT NULL THEN
    PERFORM 1 FROM public.financeiro_categorias
    WHERE id = p_categoria_id AND barbearia_id = v_barbearia AND ativa
      AND (tipo = 'ambos' OR tipo = CASE WHEN p_tipo = 'pagar' THEN 'saida' ELSE 'entrada' END);
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_INVALIDA'; END IF;
  END IF;

  v_valor_centavos := round(v_valor * 100)::bigint;
  v_taxa_centavos := round(v_taxa * 100)::bigint;
  IF p_modalidade = 'parcelado' AND v_valor_centavos < p_quantidade THEN RAISE EXCEPTION 'FINANCEIRO_PARCELA_INVALIDA'; END IF;

  v_payload := jsonb_build_object(
    'tipo', p_tipo, 'modalidade', p_modalidade, 'descricao', v_descricao,
    'valor', v_valor, 'taxa', v_taxa, 'data_evento', p_data_evento,
    'data_competencia', p_data_competencia, 'metodo_pagamento', v_metodo,
    'categoria_id', p_categoria_id, 'quantidade', p_quantidade
  );
  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':criar_titulos_em_lote:' || v_chave, 0));
  SELECT * INTO v_intencao FROM public.financeiro_idempotencia
  WHERE barbearia_id = v_barbearia AND operacao = 'criar_titulos_em_lote:' || p_tipo
    AND idempotency_key = v_chave FOR UPDATE;
  IF FOUND THEN
    IF v_intencao.payload_hash <> v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF;
    RETURN v_intencao.resposta || jsonb_build_object('idempotente', true);
  END IF;

  FOR i IN 1..p_quantidade LOOP
    IF p_modalidade = 'parcelado' THEN
      v_valor_item := ((v_valor_centavos / p_quantidade) + CASE WHEN i <= (v_valor_centavos % p_quantidade) THEN 1 ELSE 0 END)::numeric / 100;
      v_taxa_item := ((v_taxa_centavos / p_quantidade) + CASE WHEN i <= (v_taxa_centavos % p_quantidade) THEN 1 ELSE 0 END)::numeric / 100;
    ELSE
      v_valor_item := v_valor;
      v_taxa_item := v_taxa;
    END IF;
    v_data_evento := public.financeiro_data_mensal(p_data_evento, i - 1);
    v_data_competencia := public.financeiro_data_mensal(p_data_competencia, i - 1);

    IF p_tipo = 'pagar' THEN
      INSERT INTO public.financeiro_contas_pagar(
        barbearia_id, descricao, valor, data_vencimento, data_competencia,
        categoria_id, origem, grupo_id, modalidade, numero_repeticao, total_repeticoes
      ) VALUES (
        v_barbearia, v_descricao, v_valor_item, v_data_evento, v_data_competencia,
        p_categoria_id, 'manual', v_grupo, p_modalidade, i, p_quantidade
      ) RETURNING * INTO v_pagar;
      v_item := jsonb_build_object('id', v_pagar.id, 'numero', i, 'valor', v_pagar.valor, 'data_evento', v_pagar.data_vencimento);
      PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar.id, NULL, to_jsonb(v_pagar), v_correlation);
    ELSE
      INSERT INTO public.financeiro_contas_receber(
        barbearia_id, descricao, valor_bruto, taxa, data_previsao, data_competencia,
        metodo_pagamento, categoria_id, origem, grupo_id, modalidade, numero_repeticao, total_repeticoes
      ) VALUES (
        v_barbearia, v_descricao, v_valor_item, v_taxa_item, v_data_evento, v_data_competencia,
        v_metodo, p_categoria_id, 'manual', v_grupo, p_modalidade, i, p_quantidade
      ) RETURNING * INTO v_receber;
      v_item := jsonb_build_object('id', v_receber.id, 'numero', i, 'valor', v_receber.valor_liquido, 'valor_bruto', v_receber.valor_bruto, 'taxa', v_receber.taxa, 'data_evento', v_receber.data_previsao);
      PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber.id, NULL, to_jsonb(v_receber), v_correlation);
    END IF;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;

  v_resposta := jsonb_build_object(
    'grupo_id', v_grupo, 'tipo', p_tipo, 'modalidade', p_modalidade,
    'quantidade', p_quantidade, 'items', v_items
  );
  INSERT INTO public.financeiro_idempotencia(barbearia_id, operacao, idempotency_key, payload_hash, resposta)
  VALUES(v_barbearia, 'criar_titulos_em_lote:' || p_tipo, v_chave, v_hash, v_resposta);
  RETURN v_resposta || jsonb_build_object('idempotente', false);
END; $function$;
COMMENT ON FUNCTION public.financeiro_criar_titulos_em_lote(text,text,text,numeric,numeric,date,date,text,uuid,integer,text,text) IS 'Cria parcelas ou recorrencias mensais de forma atomica, auditada e idempotente.';
GRANT ALL ON FUNCTION public.financeiro_criar_titulos_em_lote(text, text, text, numeric, numeric, date, date, text, uuid, integer, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.financeiro_criar_titulos_em_lote(text, text, text, numeric, numeric, date, date, text, uuid, integer, text, text) TO service_role;
CREATE FUNCTION public.financeiro_data_mensal(p_data date, p_meses integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
  SELECT (
    date_trunc('month', p_data::timestamp)
    + make_interval(months => p_meses)
    + make_interval(days => LEAST(
        extract(day FROM p_data)::integer,
        extract(day FROM (date_trunc('month', p_data::timestamp) + make_interval(months => p_meses + 1) - interval '1 day'))::integer
      ) - 1)
  )::date;
$function$;
GRANT ALL ON FUNCTION public.financeiro_data_mensal(date, integer) TO service_role;
CREATE FUNCTION public.financeiro_editar_titulo_manual(p_tipo text, p_titulo_id uuid, p_descricao text, p_valor numeric, p_taxa numeric, p_data_evento date, p_data_competencia date, p_metodo_pagamento text, p_categoria_id uuid, p_expected_updated_at timestamp with time zone, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_barbearia uuid;
  v_descricao text;
  v_metodo text;
  v_correlation text;
  v_valor numeric(15,2);
  v_taxa numeric(15,2);
  v_pagar_antes public.financeiro_contas_pagar%ROWTYPE;
  v_pagar_depois public.financeiro_contas_pagar%ROWTYPE;
  v_receber_antes public.financeiro_contas_receber%ROWTYPE;
  v_receber_depois public.financeiro_contas_receber%ROWTYPE;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_descricao := btrim(p_descricao);
  v_metodo := nullif(btrim(p_metodo_pagamento), '');
  v_correlation := nullif(btrim(p_correlation_id), '');

  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar', 'receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_titulo_id IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_descricao IS NULL OR length(v_descricao) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_DESCRICAO_INVALIDA'; END IF;
  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') OR p_valor <= 0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_data_evento IS NULL OR p_data_competencia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_VERSAO_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;

  v_valor := round(p_valor, 2);
  v_taxa := round(COALESCE(p_taxa, 0), 2);
  IF v_valor <= 0 OR v_taxa < 0 OR v_taxa > v_valor THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF p_tipo = 'pagar' AND (v_taxa <> 0 OR v_metodo IS NOT NULL) THEN RAISE EXCEPTION 'FINANCEIRO_CAMPOS_TITULO_INVALIDOS'; END IF;
  IF p_tipo = 'receber' AND (v_metodo IS NULL OR length(v_metodo) NOT BETWEEN 2 AND 50) THEN RAISE EXCEPTION 'FINANCEIRO_METODO_PAGAMENTO_INVALIDO'; END IF;

  IF p_categoria_id IS NOT NULL THEN
    PERFORM 1
    FROM public.financeiro_categorias
    WHERE id = p_categoria_id
      AND barbearia_id = v_barbearia
      AND ativa
      AND (tipo = 'ambos' OR tipo = CASE WHEN p_tipo = 'pagar' THEN 'saida' ELSE 'entrada' END);
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_INVALIDA'; END IF;
  END IF;

  IF p_tipo = 'pagar' THEN
    SELECT * INTO v_pagar_antes
    FROM public.financeiro_contas_pagar
    WHERE id = p_titulo_id AND barbearia_id = v_barbearia
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
    IF v_pagar_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
    IF v_pagar_antes.status <> 'pendente' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_EDITAVEL'; END IF;
    IF v_pagar_antes.envelope_resgate_transacao_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_COM_RESERVA'; END IF;
    IF v_pagar_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

    UPDATE public.financeiro_contas_pagar
    SET descricao = v_descricao,
        valor = v_valor,
        data_vencimento = p_data_evento,
        data_competencia = p_data_competencia,
        categoria_id = p_categoria_id,
        updated_at = clock_timestamp()
    WHERE id = v_pagar_antes.id
    RETURNING * INTO v_pagar_depois;

    PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_pagar_depois.id, to_jsonb(v_pagar_antes), to_jsonb(v_pagar_depois), v_correlation);
    RETURN jsonb_build_object(
      'id', v_pagar_depois.id, 'tipo', 'pagar', 'descricao', v_pagar_depois.descricao,
      'valor', v_pagar_depois.valor, 'taxa', 0, 'data_evento', v_pagar_depois.data_vencimento,
      'data_competencia', v_pagar_depois.data_competencia, 'metodo_pagamento', NULL,
      'categoria_id', v_pagar_depois.categoria_id, 'status', v_pagar_depois.status,
      'origem', v_pagar_depois.origem, 'updated_at', v_pagar_depois.updated_at
    );
  END IF;

  SELECT * INTO v_receber_antes
  FROM public.financeiro_contas_receber
  WHERE id = p_titulo_id AND barbearia_id = v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_receber_antes.origem <> 'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_MANUAL'; END IF;
  IF v_receber_antes.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_EDITAVEL'; END IF;
  IF v_receber_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;

  UPDATE public.financeiro_contas_receber
  SET descricao = v_descricao,
      valor_bruto = v_valor,
      taxa = v_taxa,
      data_previsao = p_data_evento,
      data_competencia = p_data_competencia,
      metodo_pagamento = v_metodo,
      categoria_id = p_categoria_id,
      updated_at = clock_timestamp()
  WHERE id = v_receber_antes.id
  RETURNING * INTO v_receber_depois;

  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_receber_depois.id, to_jsonb(v_receber_antes), to_jsonb(v_receber_depois), v_correlation);
  RETURN jsonb_build_object(
    'id', v_receber_depois.id, 'tipo', 'receber', 'descricao', v_receber_depois.descricao,
    'valor', v_receber_depois.valor_liquido, 'valor_bruto', v_receber_depois.valor_bruto,
    'taxa', v_receber_depois.taxa, 'data_evento', v_receber_depois.data_previsao,
    'data_competencia', v_receber_depois.data_competencia, 'metodo_pagamento', v_receber_depois.metodo_pagamento,
    'categoria_id', v_receber_depois.categoria_id, 'status', v_receber_depois.status,
    'origem', v_receber_depois.origem, 'updated_at', v_receber_depois.updated_at
  );
END; $function$;
GRANT ALL ON FUNCTION public.financeiro_editar_titulo_manual(text, uuid, text, numeric, numeric, date, date, text, uuid, timestamp with time zone, text) TO authenticated;
GRANT ALL ON FUNCTION public.financeiro_editar_titulo_manual(text, uuid, text, numeric, numeric, date, date, text, uuid, timestamp with time zone, text) TO service_role;
CREATE OR REPLACE FUNCTION public.financeiro_listar_titulos(p_tipo text, p_data_inicio date, p_data_fim date, p_status text DEFAULT NULL::text, p_ordenar_por text DEFAULT 'data'::text, p_direcao text DEFAULT 'asc'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_barbearia uuid; v_total bigint; v_items jsonb;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_tipo IS NULL OR p_tipo NOT IN ('pagar','receber') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_INVALIDO'; END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio > p_data_fim OR (p_data_fim-p_data_inicio)>365 THEN RAISE EXCEPTION 'FINANCEIRO_PERIODO_INVALIDO'; END IF;
  IF (p_tipo='pagar' AND p_status IS NOT NULL AND p_status NOT IN ('pendente','pago','estornado','cancelado')) OR
     (p_tipo='receber' AND p_status IS NOT NULL AND p_status NOT IN ('previsto','liquidado','estornado','cancelado')) THEN RAISE EXCEPTION 'FINANCEIRO_STATUS_INVALIDO'; END IF;
  IF p_ordenar_por IS NULL OR p_direcao IS NULL OR p_ordenar_por NOT IN ('data','descricao','valor','status') OR p_direcao NOT IN ('asc','desc') THEN RAISE EXCEPTION 'FINANCEIRO_ORDENACAO_INVALIDA'; END IF;
  IF p_pagina IS NULL OR p_pagina<1 OR p_por_pagina IS NULL OR p_por_pagina<1 OR p_por_pagina>100 THEN RAISE EXCEPTION 'FINANCEIRO_PAGINACAO_INVALIDA'; END IF;

  WITH titulos AS (
    SELECT cp.id,'pagar'::text tipo,cp.descricao,cp.valor,cp.valor valor_bruto,0::numeric taxa,cp.status,
      cp.data_competencia,cp.data_vencimento data_evento,cp.data_liquidacao,cp.categoria_id,
      cat.nome categoria,prof.nome contraparte,cb.nome conta_bancaria,cp.origem,NULL::text metodo_pagamento,cp.updated_at,
      cp.grupo_id,cp.modalidade,cp.numero_repeticao,cp.total_repeticoes,
      (cp.status='pendente') pode_liquidar,
      (cp.origem='manual' AND cp.status='pendente' AND cp.envelope_resgate_transacao_id IS NULL) pode_editar,
      (cp.origem='manual' AND cp.status='pendente' AND cp.envelope_resgate_transacao_id IS NULL) pode_cancelar,
      (cp.envelope_resgate_transacao_id IS NOT NULL) possui_reserva,
      NULL::uuid fechamento_id,false pode_estornar
    FROM public.financeiro_contas_pagar cp
    LEFT JOIN public.financeiro_categorias cat ON cat.id=cp.categoria_id AND cat.barbearia_id=v_barbearia
    LEFT JOIN public.profissionais prof ON prof.id=cp.profissional_id AND prof.barbearia_id=v_barbearia
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id=cp.conta_bancaria_id AND cb.barbearia_id=v_barbearia
    WHERE p_tipo='pagar' AND cp.barbearia_id=v_barbearia AND cp.data_vencimento BETWEEN p_data_inicio AND p_data_fim AND (p_status IS NULL OR cp.status=p_status)
    UNION ALL
    SELECT cr.id,'receber',cr.descricao,cr.valor_liquido,cr.valor_bruto,cr.taxa,cr.status,
      cr.data_competencia,cr.data_previsao,cr.data_liquidacao,cr.categoria_id,
      cat.nome,cli.nome,cb.nome,cr.origem,cr.metodo_pagamento,cr.updated_at,
      cr.grupo_id,cr.modalidade,cr.numero_repeticao,cr.total_repeticoes,
      (cr.status='previsto'),(cr.origem='manual' AND cr.status='previsto'),
      (cr.origem='manual' AND cr.status='previsto'),false,
      cr.fechamento_id,(cr.fechamento_id IS NOT NULL AND cr.status IN ('previsto','liquidado'))
    FROM public.financeiro_contas_receber cr
    LEFT JOIN public.financeiro_categorias cat ON cat.id=cr.categoria_id AND cat.barbearia_id=v_barbearia
    LEFT JOIN public.clientes cli ON cli.id=cr.cliente_id AND cli.barbearia_id=v_barbearia
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id=cr.conta_destino_id AND cb.barbearia_id=v_barbearia
    WHERE p_tipo='receber' AND cr.barbearia_id=v_barbearia AND cr.data_previsao BETWEEN p_data_inicio AND p_data_fim AND (p_status IS NULL OR cr.status=p_status)
  ), ordenados AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_direcao='asc' AND p_ordenar_por='data' THEN data_evento END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='data' THEN data_evento END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='descricao' THEN descricao END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='descricao' THEN descricao END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='valor' THEN valor END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='valor' THEN valor END DESC,
      CASE WHEN p_direcao='asc' AND p_ordenar_por='status' THEN status END ASC,
      CASE WHEN p_direcao='desc' AND p_ordenar_por='status' THEN status END DESC, id
    ) AS ordem FROM titulos
  ), pagina AS (SELECT * FROM ordenados ORDER BY ordem OFFSET (p_pagina-1)*p_por_pagina LIMIT p_por_pagina)
  SELECT (SELECT count(*) FROM titulos), COALESCE((SELECT jsonb_agg(to_jsonb(p)-'ordem' ORDER BY p.ordem) FROM pagina p),'[]'::jsonb) INTO v_total,v_items;
  RETURN jsonb_build_object('items',v_items,'pagina',p_pagina,'por_pagina',p_por_pagina,'total_itens',v_total,'total_paginas',CASE WHEN v_total=0 THEN 0 ELSE ceil(v_total::numeric/p_por_pagina)::integer END);
END; $function$;
CREATE OR REPLACE FUNCTION public.financeiro_receber_conta(p_conta_receber_id uuid, p_conta_bancaria_id uuid, p_data date, p_idempotency_key text, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_barbearia uuid; v_titulo public.financeiro_contas_receber%ROWTYPE; v_entrada uuid; v_taxa uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  SELECT * INTO v_titulo FROM public.financeiro_contas_receber WHERE id = p_conta_receber_id AND barbearia_id = v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_RECEBIVEL_NAO_ENCONTRADO'; END IF;
  IF v_titulo.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_RECEBIVEL_NAO_PREVISTO'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE id = p_conta_bancaria_id AND barbearia_id = v_barbearia AND ativa;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  SELECT id INTO v_entrada FROM public.financeiro_movimentacoes WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF v_entrada IS NOT NULL THEN RETURN jsonb_build_object('idempotente', true, 'movimentacao_id', v_entrada); END IF;
  UPDATE public.financeiro_contas_receber SET status = 'liquidado', data_liquidacao = p_data, conta_destino_id = p_conta_bancaria_id, updated_at = now() WHERE id = v_titulo.id;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, categoria_id, origem, idempotency_key, conta_receber_id, descricao)
  VALUES (v_barbearia, p_conta_bancaria_id, 'entrada', v_titulo.valor_bruto, v_titulo.data_competencia, p_data, v_titulo.categoria_id, 'conta_receber', p_idempotency_key, v_titulo.id, v_titulo.descricao) RETURNING id INTO v_entrada;
  IF v_titulo.taxa > 0 THEN
    INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, idempotency_key, conta_receber_id, descricao)
    VALUES (v_barbearia, p_conta_bancaria_id, 'saida', v_titulo.taxa, v_titulo.data_competencia, p_data, 'taxa_cartao', p_idempotency_key || ':taxa', v_titulo.id, 'Taxa financeira: ' || v_titulo.descricao) RETURNING id INTO v_taxa;
  END IF;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_titulo.id, to_jsonb(v_titulo), jsonb_build_object('status','liquidado','movimentacao_id',v_entrada,'taxa_movimentacao_id',v_taxa), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'movimentacao_id', v_entrada, 'taxa_movimentacao_id', v_taxa);
END; $function$;
CREATE OR REPLACE FUNCTION public.get_my_profissional_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id
  FROM public.profissionais
  WHERE user_id = auth.uid()
    AND ativo IS TRUE
  LIMIT 1;
$function$;
CREATE FUNCTION public.materiais_catalogo_listar(p_incluir_inativos boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, tipo text, unidade text, ativo boolean, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT m.id, m.nome, m.tipo, m.unidade, m.ativo, m.updated_at
  FROM public.materiais_servico m
  WHERE m.barbearia_id = public.catalogo_assert_admin()
    AND (p_incluir_inativos OR m.ativo)
  ORDER BY m.ativo DESC, lower(m.nome), m.id;
$function$;
GRANT ALL ON FUNCTION public.materiais_catalogo_listar(boolean) TO authenticated;
GRANT ALL ON FUNCTION public.materiais_catalogo_listar(boolean) TO service_role;
CREATE FUNCTION public.material_catalogo_atualizar(p_id uuid, p_nome text, p_tipo text, p_unidade text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_atual public.materiais_servico%ROWTYPE; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('insumo', 'ferramenta') THEN RAISE EXCEPTION 'CATALOGO_TIPO_INVALIDO'; END IF;
  IF p_unidade IS NULL OR length(btrim(p_unidade)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'CATALOGO_UNIDADE_INVALIDA'; END IF;
  SELECT * INTO v_atual FROM public.materiais_servico WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF v_atual.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'CATALOGO_CONFLITO_VERSAO'; END IF;
  IF EXISTS (SELECT 1 FROM public.materiais_servico WHERE barbearia_id=v_barbearia AND id<>p_id AND lower(btrim(nome))=lower(btrim(p_nome))) THEN
    RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO';
  END IF;
  UPDATE public.materiais_servico SET nome=btrim(p_nome),tipo=p_tipo,unidade=btrim(p_unidade),updated_at=clock_timestamp()
  WHERE id=p_id RETURNING updated_at INTO v_updated;
  RETURN jsonb_build_object('id',p_id,'updated_at',v_updated);
END;
$function$;
GRANT ALL ON FUNCTION public.material_catalogo_atualizar(uuid, text, text, text, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.material_catalogo_atualizar(uuid, text, text, text, timestamp with time zone) TO service_role;
CREATE FUNCTION public.material_catalogo_criar(p_nome text, p_tipo text, p_unidade text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_id uuid; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('insumo', 'ferramenta') THEN RAISE EXCEPTION 'CATALOGO_TIPO_INVALIDO'; END IF;
  IF p_unidade IS NULL OR length(btrim(p_unidade)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'CATALOGO_UNIDADE_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':material:' || lower(btrim(p_nome)), 0));
  IF EXISTS (SELECT 1 FROM public.materiais_servico WHERE barbearia_id=v_barbearia AND lower(btrim(nome))=lower(btrim(p_nome))) THEN
    RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO';
  END IF;
  INSERT INTO public.materiais_servico(barbearia_id,nome,tipo,unidade)
  VALUES(v_barbearia,btrim(p_nome),p_tipo,btrim(p_unidade)) RETURNING id,updated_at INTO v_id,v_updated;
  RETURN jsonb_build_object('id',v_id,'updated_at',v_updated);
END;
$function$;
GRANT ALL ON FUNCTION public.material_catalogo_criar(text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.material_catalogo_criar(text, text, text) TO service_role;
CREATE FUNCTION public.material_catalogo_definir_ativo(p_id uuid, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_material public.materiais_servico%ROWTYPE;
BEGIN
  SELECT * INTO v_material FROM public.materiais_servico WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF NOT p_ativo AND EXISTS (
    SELECT 1 FROM public.servicos_materiais sm JOIN public.servicos s ON s.id=sm.servico_id AND s.barbearia_id=sm.barbearia_id
    WHERE sm.barbearia_id=v_barbearia AND sm.material_id=p_id AND s.ativo
  ) THEN RAISE EXCEPTION 'CATALOGO_MATERIAL_EM_USO'; END IF;
  IF p_ativo AND EXISTS (SELECT 1 FROM public.materiais_servico WHERE barbearia_id=v_barbearia AND id<>p_id AND ativo AND lower(btrim(nome))=lower(btrim(v_material.nome))) THEN
    RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO';
  END IF;
  UPDATE public.materiais_servico SET ativo=p_ativo,updated_at=clock_timestamp() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'ativo',p_ativo);
END;
$function$;
GRANT ALL ON FUNCTION public.material_catalogo_definir_ativo(uuid, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.material_catalogo_definir_ativo(uuid, boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.modulo_acesso_verificar(p_modulo text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid;
  v_perfil_ativo boolean := false;
  v_liberado boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_modulo IS NULL THEN RETURN false; END IF;

  SELECT p.barbearia_id, p.ativo
    INTO v_barbearia, v_perfil_ativo
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_barbearia IS NULL OR NOT COALESCE(v_perfil_ativo, false) THEN RETURN false; END IF;

  SELECT bm.ativo_na_unidade
         AND public.modulo_contratado_e_vigente(bm.status_contrato, bm.trial_ate, bm.vigente_ate)
    INTO v_liberado
  FROM public.barbearia_modulos bm
  WHERE bm.barbearia_id = v_barbearia AND bm.modulo = p_modulo;

  RETURN COALESCE(v_liberado, false);
END;
$function$;
CREATE FUNCTION public.modulo_contratado_e_vigente(p_status text, p_trial_ate timestamp with time zone, p_vigente_ate timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_status = 'trial' THEN p_trial_ate IS NOT NULL AND p_trial_ate >= now()
    WHEN p_status = 'ativo' THEN p_vigente_ate IS NULL OR p_vigente_ate >= now()
    ELSE false
  END;
$function$;
GRANT ALL ON FUNCTION public.modulo_contratado_e_vigente(text, timestamp with time zone, timestamp with time zone) TO service_role;
CREATE FUNCTION public.portal_acessar(p_slug text, p_cpf text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_barbearia public.barbearias%ROWTYPE; v_cliente public.clientes%ROWTYPE; v_hash text; v_sessao jsonb;
BEGIN
  SELECT * INTO v_barbearia FROM public.barbearias
  WHERE slug=lower(btrim(COALESCE(p_slug,''))) AND portal_ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_BARBEARIA_NAO_ENCONTRADA'; END IF;
  v_hash:=public.cliente_cpf_hash(v_barbearia.id,p_cpf);
  SELECT * INTO v_cliente FROM public.clientes
  WHERE barbearia_id=v_barbearia.id AND cpf_hash=v_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','cadastro','barbearia',v_barbearia.nome);
  END IF;
  v_sessao:=public.portal_sessao_criar(v_barbearia.id,v_cliente.id);
  RETURN jsonb_build_object(
    'status','autenticado','token',v_sessao->>'token','expira_em',v_sessao->>'expira_em',
    'cliente',jsonb_build_object('id',v_cliente.id,'nome',v_cliente.nome,'cpf_final',rtrim(v_cliente.cpf_final))
  );
END;
$function$;
GRANT ALL ON FUNCTION public.portal_acessar(text, text) TO anon;
GRANT ALL ON FUNCTION public.portal_acessar(text, text) TO service_role;
CREATE FUNCTION public.portal_agendamento_cancelar(p_token text, p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_sessao public.portal_sessoes%ROWTYPE;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  UPDATE public.agendamentos SET status='cancelado'
  WHERE id=p_agendamento_id AND barbearia_id=v_sessao.barbearia_id AND cliente_id=v_sessao.cliente_id
    AND status IN ('pendente','confirmado') AND data_hora>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_AGENDAMENTO_NAO_CANCELAVEL'; END IF;
  RETURN jsonb_build_object('id',p_agendamento_id,'status','cancelado');
END;
$function$;
GRANT ALL ON FUNCTION public.portal_agendamento_cancelar(text, uuid) TO anon;
GRANT ALL ON FUNCTION public.portal_agendamento_cancelar(text, uuid) TO service_role;
CREATE FUNCTION public.portal_agendamento_criar(p_token text, p_servico_id uuid, p_profissional_id uuid, p_inicio timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_preco numeric; v_duracao integer; v_id uuid; v_fuso text; v_data date;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  IF p_inicio IS NULL OR p_inicio<=now() THEN RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL'; END IF;
  SELECT s.preco,s.duracao_minutos INTO v_preco,v_duracao FROM public.servicos s
  WHERE s.id=p_servico_id AND s.barbearia_id=v_sessao.barbearia_id AND s.ativo;
  IF v_duracao IS NULL THEN RAISE EXCEPTION 'PORTAL_SERVICO_INVALIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id
    AND p.barbearia_id=v_sessao.barbearia_id AND p.ativo) THEN RAISE EXCEPTION 'PORTAL_PROFISSIONAL_INVALIDO'; END IF;
  SELECT fuso_horario INTO v_fuso FROM public.barbearias WHERE id=v_sessao.barbearia_id;
  v_data:=(p_inicio AT TIME ZONE COALESCE(v_fuso,'America/Sao_Paulo'))::date;
  IF NOT EXISTS (SELECT 1 FROM public.portal_horarios_livres(
    p_token,p_servico_id,v_data,p_profissional_id,1,100
  ) h WHERE h.profissional_id=p_profissional_id AND h.inicio=p_inicio) THEN
    RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL';
  END IF;
  INSERT INTO public.agendamentos(
    barbearia_id,profissional_id,cliente_id,servico_id,data_hora,duracao_minutos_snapshot,
    data_fim,valor_final,status,origem,pagamento_status
  ) VALUES (
    v_sessao.barbearia_id,p_profissional_id,v_sessao.cliente_id,p_servico_id,p_inicio,v_duracao,
    p_inicio+make_interval(mins=>v_duracao),v_preco,'pendente','portal_cliente','nao_solicitado'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','pendente','inicio',p_inicio,'valor_final',v_preco);
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL'; END IF;
  RAISE;
END;
$function$;
GRANT ALL ON FUNCTION public.portal_agendamento_criar(text, uuid, uuid, timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.portal_agendamento_criar(text, uuid, uuid, timestamp with time zone) TO service_role;
CREATE FUNCTION public.portal_barbearia_publica(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia public.barbearias%ROWTYPE; v_result jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'PORTAL_BARBEARIA_NAO_ENCONTRADA';
  END IF;
  SELECT * INTO v_barbearia FROM public.barbearias
  WHERE slug=lower(btrim(p_slug)) AND portal_ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_BARBEARIA_NAO_ENCONTRADA'; END IF;
  SELECT jsonb_build_object(
    'id',v_barbearia.id,'nome',v_barbearia.nome,'slug',v_barbearia.slug,
    'logo_url',v_barbearia.logo_url,'config_cores',v_barbearia.config_cores,
    'pagamento_online_ativo',v_barbearia.pagamento_online_ativo,
    'equipe',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',p.id,'nome',p.nome,'apelido',p.apelido,'especialidade',p.especialidade,'foto_url',p.foto_url
    ) ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id)
      FROM public.profissionais p WHERE p.barbearia_id=v_barbearia.id AND p.ativo),'[]'::jsonb),
    'servicos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'nome',s.nome,'descricao',s.descricao,'preco',s.preco,'duracao_minutos',s.duracao_minutos
    ) ORDER BY lower(s.nome),s.id)
      FROM public.servicos s WHERE s.barbearia_id=v_barbearia.id AND s.ativo),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
GRANT ALL ON FUNCTION public.portal_barbearia_publica(text) TO anon;
GRANT ALL ON FUNCTION public.portal_barbearia_publica(text) TO service_role;
CREATE FUNCTION public.portal_cadastrar(p_slug text, p_cpf text, p_nome text, p_telefone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_barbearia public.barbearias%ROWTYPE; v_cpf text; v_hash text; v_id uuid; v_sessao jsonb;
BEGIN
  SELECT * INTO v_barbearia FROM public.barbearias
  WHERE slug=lower(btrim(COALESCE(p_slug,''))) AND portal_ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_BARBEARIA_NAO_ENCONTRADA'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PORTAL_NOME_INVALIDO'; END IF;
  IF p_telefone IS NULL OR length(regexp_replace(p_telefone,'\D','','g')) NOT BETWEEN 10 AND 13 THEN
    RAISE EXCEPTION 'PORTAL_TELEFONE_INVALIDO';
  END IF;
  v_cpf:=public.cliente_cpf_normalizar(p_cpf);
  v_hash:=public.cliente_cpf_hash(v_barbearia.id,v_cpf);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia.id::text||':portal-cpf:'||v_hash,0));
  SELECT id INTO v_id FROM public.clientes WHERE barbearia_id=v_barbearia.id AND cpf_hash=v_hash;
  IF v_id IS NULL THEN
    INSERT INTO public.clientes(barbearia_id,nome,telefone,cpf_hash,cpf_final,updated_at)
    VALUES(v_barbearia.id,btrim(p_nome),btrim(p_telefone),v_hash,right(v_cpf,4),now())
    RETURNING id INTO v_id;
  END IF;
  v_sessao:=public.portal_sessao_criar(v_barbearia.id,v_id);
  RETURN jsonb_build_object('status','autenticado','token',v_sessao->>'token','expira_em',v_sessao->>'expira_em');
END;
$function$;
GRANT ALL ON FUNCTION public.portal_cadastrar(text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.portal_cadastrar(text, text, text, text) TO service_role;
CREATE FUNCTION public.portal_dados(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_result jsonb;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  SELECT jsonb_build_object(
    'barbearia',jsonb_build_object(
      'nome',b.nome,'slug',b.slug,'logo_url',b.logo_url,'config_cores',b.config_cores,
      'pagamento_online_ativo',b.pagamento_online_ativo
    ),
    'cliente',jsonb_build_object(
      'id',c.id,'nome',c.nome,'telefone',c.telefone,'cpf_final',rtrim(c.cpf_final),
      'barbeiro_favorito_id',c.barbeiro_favorito_id,'notas_preferencias',c.notas_preferencias
    ),
    'equipe',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',p.id,'nome',p.nome,'apelido',p.apelido,'especialidade',p.especialidade,'foto_url',p.foto_url
    ) ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id)
      FROM public.profissionais p WHERE p.barbearia_id=v_sessao.barbearia_id AND p.ativo),'[]'::jsonb),
    'servicos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'nome',s.nome,'descricao',s.descricao,'preco',s.preco,'duracao_minutos',s.duracao_minutos
    ) ORDER BY lower(s.nome),s.id)
      FROM public.servicos s WHERE s.barbearia_id=v_sessao.barbearia_id AND s.ativo),'[]'::jsonb),
    'agendamentos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,'data_hora',a.data_hora,'data_fim',a.data_fim,'status',a.status,
      'valor_final',a.valor_final,'pagamento_status',a.pagamento_status,
      'profissional_id',a.profissional_id,'profissional_nome',COALESCE(p.apelido,p.nome),
      'servico_id',a.servico_id,'servico_nome',COALESCE(s.nome,'Serviço')
    ) ORDER BY a.data_hora)
      FROM public.agendamentos a
      LEFT JOIN public.profissionais p ON p.id=a.profissional_id AND p.barbearia_id=a.barbearia_id
      LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_sessao.barbearia_id AND a.cliente_id=v_sessao.cliente_id
        AND a.data_hora>=now()-interval '1 day' AND a.status<>'cancelado'),'[]'::jsonb),
    'historico',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',cc.id,'estilo',cc.estilo,'pentes',cc.pentes,'acabamento',cc.acabamento,
      'barba',cc.barba,'observacoes',cc.observacoes,'preferencias_cliente',cc.preferencias_cliente,
      'tem_foto',(cc.foto_path IS NOT NULL AND cc.foto_excluida_em IS NULL),
      'criado_em',cc.criado_em,'profissional_nome',COALESCE(cp.apelido,cp.nome),
      'servico_nome',COALESCE(cs.nome,'Serviço')
    ) ORDER BY cc.criado_em DESC)
      FROM public.cliente_cortes cc
      JOIN public.profissionais cp ON cp.id=cc.profissional_id AND cp.barbearia_id=cc.barbearia_id
      LEFT JOIN public.agendamentos ca ON ca.id=cc.agendamento_id AND ca.barbearia_id=cc.barbearia_id
      LEFT JOIN public.servicos cs ON cs.id=ca.servico_id AND cs.barbearia_id=ca.barbearia_id
      WHERE cc.barbearia_id=v_sessao.barbearia_id AND cc.cliente_id=v_sessao.cliente_id),'[]'::jsonb)
  ) INTO v_result
  FROM public.clientes c JOIN public.barbearias b ON b.id=c.barbearia_id
  WHERE c.id=v_sessao.cliente_id AND c.barbearia_id=v_sessao.barbearia_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'PORTAL_CLIENTE_NAO_ENCONTRADO'; END IF;
  RETURN v_result;
END;
$function$;
GRANT ALL ON FUNCTION public.portal_dados(text) TO anon;
GRANT ALL ON FUNCTION public.portal_dados(text) TO service_role;
CREATE FUNCTION public.portal_encerrar(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.portal_sessoes SET revogada_em=now()
  WHERE token_hash=public.portal_token_hash(p_token) AND revogada_em IS NULL;
  RETURN jsonb_build_object('encerrada',true);
END;
$function$;
GRANT ALL ON FUNCTION public.portal_encerrar(text) TO anon;
GRANT ALL ON FUNCTION public.portal_encerrar(text) TO service_role;
CREATE FUNCTION public.portal_horarios_livres(p_token text, p_servico_id uuid, p_data_inicial date, p_profissional_id uuid DEFAULT NULL::uuid, p_dias integer DEFAULT 14, p_limite integer DEFAULT 60)
 RETURNS TABLE(profissional_id uuid, profissional_nome text, profissional_apelido text, inicio timestamp with time zone, fim timestamp with time zone, duracao_minutos integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_duracao integer; v_fuso text; v_hoje date;
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
    SELECT j.profissional_id,j.nome,j.apelido,slot inicio,slot+make_interval(mins=>v_duracao) fim
    FROM janelas j CROSS JOIN LATERAL generate_series(
      j.janela_inicio,j.janela_fim-make_interval(mins=>v_duracao),interval '15 minutes'
    ) slot WHERE j.janela_fim-j.janela_inicio>=make_interval(mins=>v_duracao)
  )
  SELECT c.profissional_id,c.nome,c.apelido,c.inicio,c.fim,v_duracao FROM candidatos c
  WHERE c.inicio>=now()
    AND NOT EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb
      WHERE pb.barbearia_id=v_sessao.barbearia_id AND pb.profissional_id=c.profissional_id
        AND pb.inicio<c.fim AND pb.fim>c.inicio)
    AND NOT EXISTS (SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=v_sessao.barbearia_id AND a.profissional_id=c.profissional_id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<c.fim AND a.data_fim>c.inicio)
  ORDER BY c.inicio,lower(COALESCE(c.apelido,c.nome)),c.profissional_id LIMIT p_limite;
END;
$function$;
GRANT ALL ON FUNCTION public.portal_horarios_livres(text, uuid, date, uuid, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.portal_horarios_livres(text, uuid, date, uuid, integer, integer) TO service_role;
CREATE FUNCTION public.portal_perfil_atualizar(p_token text, p_nome text, p_telefone text, p_barbeiro_favorito_id uuid, p_notas_preferencias text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_sessao public.portal_sessoes%ROWTYPE;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PORTAL_NOME_INVALIDO'; END IF;
  IF p_telefone IS NULL OR length(regexp_replace(p_telefone,'\D','','g')) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'PORTAL_TELEFONE_INVALIDO'; END IF;
  IF length(COALESCE(p_notas_preferencias,''))>1000 THEN RAISE EXCEPTION 'PORTAL_PREFERENCIAS_INVALIDAS'; END IF;
  IF p_barbeiro_favorito_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profissionais p
    WHERE p.id=p_barbeiro_favorito_id AND p.barbearia_id=v_sessao.barbearia_id AND p.ativo)
  THEN RAISE EXCEPTION 'PORTAL_PROFISSIONAL_INVALIDO'; END IF;
  UPDATE public.clientes SET nome=btrim(p_nome),telefone=btrim(p_telefone),
    barbeiro_favorito_id=p_barbeiro_favorito_id,
    notas_preferencias=NULLIF(btrim(p_notas_preferencias),''),updated_at=now()
  WHERE id=v_sessao.cliente_id AND barbearia_id=v_sessao.barbearia_id;
  RETURN jsonb_build_object('atualizado',true);
END;
$function$;
GRANT ALL ON FUNCTION public.portal_perfil_atualizar(text, text, text, uuid, text) TO anon;
GRANT ALL ON FUNCTION public.portal_perfil_atualizar(text, text, text, uuid, text) TO service_role;
CREATE FUNCTION public.portal_sessao_criar(p_barbearia_id uuid, p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_token text; v_expira timestamptz:=now()+interval '7 days';
BEGIN
  DELETE FROM public.portal_sessoes
  WHERE expira_em<=now() OR (revogada_em IS NOT NULL AND revogada_em<now()-interval '1 day');
  UPDATE public.portal_sessoes SET revogada_em=now()
  WHERE barbearia_id=p_barbearia_id AND cliente_id=p_cliente_id
    AND revogada_em IS NULL AND expira_em>now();
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.portal_sessoes(barbearia_id,cliente_id,token_hash,expira_em)
  VALUES(p_barbearia_id,p_cliente_id,public.portal_token_hash(v_token),v_expira);
  RETURN jsonb_build_object('token',v_token,'expira_em',v_expira);
END;
$function$;
GRANT ALL ON FUNCTION public.portal_sessao_criar(uuid, uuid) TO service_role;
CREATE FUNCTION public.portal_token_hash(p_token text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT encode(extensions.digest(convert_to(COALESCE(p_token,''),'UTF8'),'sha256'),'hex')
$function$;
GRANT ALL ON FUNCTION public.portal_token_hash(text) TO service_role;
CREATE OR REPLACE FUNCTION public.produto_catalogo_atualizar(p_id uuid, p_nome text, p_sku text, p_categoria text, p_descricao text, p_preco_venda numeric, p_preco_custo numeric, p_estoque_quantidade integer, p_estoque_minimo integer, p_comissao_percentual numeric, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_row public.produtos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PRODUTO_NOME_INVALIDO'; END IF;
  IF p_preco_venda IS NULL OR p_preco_venda<0 OR p_preco_custo IS NULL OR p_preco_custo<0 THEN RAISE EXCEPTION 'PRODUTO_PRECO_INVALIDO'; END IF;
  IF p_estoque_quantidade IS NULL OR p_estoque_quantidade<0 OR p_estoque_minimo IS NULL OR p_estoque_minimo<0 THEN RAISE EXCEPTION 'PRODUTO_ESTOQUE_INVALIDO'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'PRODUTO_COMISSAO_INVALIDA'; END IF;
  IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND p.id<>p_id AND lower(btrim(p.nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'PRODUTO_NOME_DUPLICADO'; END IF;
  IF NULLIF(btrim(p_sku),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND p.id<>p_id AND lower(btrim(p.sku))=lower(btrim(p_sku))) THEN RAISE EXCEPTION 'PRODUTO_SKU_DUPLICADO'; END IF;
  UPDATE public.produtos p SET nome=btrim(p_nome),sku=NULLIF(btrim(p_sku),''),categoria=NULLIF(btrim(p_categoria),''),
    descricao=NULLIF(btrim(p_descricao),''),preco_venda=round(p_preco_venda,2),preco_custo=round(p_preco_custo,2),
    estoque_quantidade=p_estoque_quantidade,estoque_minimo=p_estoque_minimo,comissao_percentual=p_comissao_percentual,
    updated_at=clock_timestamp()
  WHERE p.id=p_id AND p.barbearia_id=v_barbearia AND p.updated_at=p_expected_updated_at
  RETURNING p.* INTO v_row;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_id AND p.barbearia_id=v_barbearia) THEN RAISE EXCEPTION 'PRODUTO_CONFLITO_VERSAO'; END IF;
    RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO';
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;
CREATE OR REPLACE FUNCTION public.produto_catalogo_criar(p_nome text, p_sku text, p_categoria text, p_descricao text, p_preco_venda numeric, p_preco_custo numeric, p_estoque_quantidade integer, p_estoque_minimo integer, p_comissao_percentual numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_row public.produtos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PRODUTO_NOME_INVALIDO'; END IF;
  IF p_preco_venda IS NULL OR p_preco_venda<0 OR p_preco_custo IS NULL OR p_preco_custo<0 THEN RAISE EXCEPTION 'PRODUTO_PRECO_INVALIDO'; END IF;
  IF p_estoque_quantidade IS NULL OR p_estoque_quantidade<0 OR p_estoque_minimo IS NULL OR p_estoque_minimo<0 THEN RAISE EXCEPTION 'PRODUTO_ESTOQUE_INVALIDO'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'PRODUTO_COMISSAO_INVALIDA'; END IF;
  IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND lower(btrim(p.nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'PRODUTO_NOME_DUPLICADO'; END IF;
  IF NULLIF(btrim(p_sku),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.produtos p WHERE p.barbearia_id=v_barbearia AND lower(btrim(p.sku))=lower(btrim(p_sku))) THEN RAISE EXCEPTION 'PRODUTO_SKU_DUPLICADO'; END IF;
  INSERT INTO public.produtos(barbearia_id,nome,sku,categoria,descricao,preco_venda,preco_custo,estoque_quantidade,estoque_minimo,comissao_percentual)
  VALUES(v_barbearia,btrim(p_nome),NULLIF(btrim(p_sku),''),NULLIF(btrim(p_categoria),''),NULLIF(btrim(p_descricao),''),round(p_preco_venda,2),round(p_preco_custo,2),p_estoque_quantidade,p_estoque_minimo,p_comissao_percentual)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$function$;
CREATE OR REPLACE FUNCTION public.produto_catalogo_definir_ativo(p_id uuid, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_row public.produtos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO'; END IF;
  UPDATE public.produtos p SET ativo=p_ativo,updated_at=clock_timestamp()
  WHERE p.id=p_id AND p.barbearia_id=v_barbearia RETURNING p.* INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO'; END IF;
  RETURN to_jsonb(v_row);
END;
$function$;
CREATE OR REPLACE FUNCTION public.produtos_catalogo_listar(p_incluir_inativos boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, sku text, categoria text, descricao text, preco_venda numeric, preco_custo numeric, estoque_quantidade integer, estoque_minimo integer, comissao_percentual numeric, ativo boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_role text:=public.get_my_role();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'PRODUTO_NAO_AUTORIZADO';
  END IF;
  RETURN QUERY SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.preco_custo,
    p.estoque_quantidade,p.estoque_minimo,p.comissao_percentual,p.ativo,p.updated_at
  FROM public.produtos p
  WHERE p.barbearia_id=v_barbearia AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC,p.nome,p.id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.recepcao_agenda_listar_periodo(p_data_inicial date, p_data_final date)
 RETURNS TABLE(id uuid, profissional_id uuid, profissional_nome text, profissional_apelido text, cliente_id uuid, cliente_nome text, cliente_telefone text, servico_id uuid, servico_nome text, duracao_minutos integer, data_hora timestamp with time zone, status text, valor_final numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final < p_data_inicial OR p_data_final - p_data_inicial > 13 THEN
    RAISE EXCEPTION 'RECEPCAO_PERIODO_INVALIDO';
  END IF;
  v_inicio := p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_data_final + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT a.id, a.profissional_id, p.nome, p.apelido, a.cliente_id,
    COALESCE(c.nome, NULLIF(btrim(a.cliente_nome_manual), ''), 'Cliente'), c.telefone,
    a.servico_id, COALESCE(s.nome, 'Serviço não informado'), COALESCE(s.duracao_minutos, 30),
    a.data_hora, a.status, a.valor_final
  FROM public.agendamentos a
  JOIN public.profissionais p ON p.id = a.profissional_id AND p.barbearia_id = a.barbearia_id
  LEFT JOIN public.clientes c ON c.id = a.cliente_id AND c.barbearia_id = a.barbearia_id
  LEFT JOIN public.servicos s ON s.id = a.servico_id AND s.barbearia_id = a.barbearia_id
  WHERE a.barbearia_id = v_barbearia AND a.data_hora >= v_inicio AND a.data_hora < v_fim
  ORDER BY a.data_hora, lower(COALESCE(p.apelido, p.nome)), a.id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.recepcao_assert_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'RECEPCAO_ADMIN_NAO_AUTORIZADO';
  END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  RETURN v_barbearia;
END;
$function$;
CREATE OR REPLACE FUNCTION public.recepcao_assert_operador()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() <> 'recepcao' THEN
    RAISE EXCEPTION 'RECEPCAO_NAO_AUTORIZADA';
  END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  RETURN v_barbearia;
END;
$function$;
CREATE FUNCTION public.recepcao_carrinho_salvar(p_pendencia_id uuid, p_valor_servico numeric, p_produtos jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_item record;
  v_count integer;
  v_total_produtos numeric(15,2) := 0;
BEGIN
  IF p_valor_servico IS NULL OR p_valor_servico<0 OR p_valor_servico>99999999 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_VALOR_INVALIDO'; END IF;
  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos)>20 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_VERSAO_INVALIDA'; END IF;

  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_NAO_ENCONTRADO'; END IF;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_CONFLITO_VERSAO'; END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT item->>'produto_id'
    FROM jsonb_array_elements(p_produtos) item
    GROUP BY item->>'produto_id'
    HAVING count(*)>1
  ) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_DUPLICADOS'; END IF;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto
    FROM public.produtos
    WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_total_produtos:=v_total_produtos+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;
  IF round(p_valor_servico,2)+v_total_produtos<=0 THEN RAISE EXCEPTION 'RECEPCAO_CARRINHO_VALOR_INVALIDO'; END IF;

  DELETE FROM public.atendimento_itens_pendentes
  WHERE pendencia_id=v_pendencia.id AND barbearia_id=v_barbearia;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia;
    INSERT INTO public.atendimento_itens_pendentes(
      barbearia_id,pendencia_id,produto_id,quantidade,preco_unitario_snapshot,adicionado_por_papel,adicionado_por
    ) VALUES (
      v_barbearia,v_pendencia.id,v_produto.id,v_item.quantidade,v_produto.preco_venda,'recepcao',auth.uid()
    );
  END LOOP;

  UPDATE public.atendimento_pendencias
  SET valor_servico=round(p_valor_servico,2),updated_at=clock_timestamp()
  WHERE id=v_pendencia.id
  RETURNING * INTO v_pendencia;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_pendencia.agendamento_id,v_pendencia.id,'carrinho_alterado',auth.uid(),'recepcao',
    jsonb_build_object('valor_servico',v_pendencia.valor_servico,'valor_produtos',v_total_produtos,'itens',jsonb_array_length(p_produtos))
  );

  RETURN jsonb_build_object(
    'pendencia_id',v_pendencia.id,
    'updated_at',v_pendencia.updated_at,
    'valor_servico',v_pendencia.valor_servico,
    'valor_produtos',v_total_produtos,
    'valor_total',v_pendencia.valor_servico+v_total_produtos
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'RECEPCAO_CARRINHO_PRODUTOS_INVALIDOS';
END;
$function$;
GRANT ALL ON FUNCTION public.recepcao_carrinho_salvar(uuid, numeric, jsonb, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_carrinho_salvar(uuid, numeric, jsonb, timestamp with time zone) TO service_role;
CREATE OR REPLACE FUNCTION public.recepcao_clientes_buscar(p_busca text, p_limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, nome text, telefone text, proximo_horario timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_busca text := btrim(COALESCE(p_busca, ''));
  v_digits text := regexp_replace(COALESCE(p_busca, ''), '\D', '', 'g');
BEGIN
  IF length(v_busca) < 2 OR p_limite NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'RECEPCAO_BUSCA_INVALIDA'; END IF;
  RETURN QUERY
  SELECT c.id, c.nome, c.telefone,
    (SELECT min(a.data_hora) FROM public.agendamentos a
      WHERE a.barbearia_id = v_barbearia AND a.cliente_id = c.id
        AND a.status IN ('pendente','confirmado','encaixe') AND a.data_hora >= now())
  FROM public.clientes c
  WHERE c.barbearia_id = v_barbearia AND (
    lower(extensions.unaccent(c.nome)) LIKE '%' || lower(extensions.unaccent(v_busca)) || '%'
    OR (length(v_digits) >= 3 AND regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%')
  )
  ORDER BY lower(c.nome), c.id LIMIT p_limite;
END;
$function$;
CREATE FUNCTION public.recepcao_cobranca_concluir(p_pendencia_id uuid, p_desconto numeric, p_forma_pagamento text, p_taxa numeric, p_data_recebimento date, p_chave_idempotencia uuid, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_agendamento public.agendamentos%ROWTYPE;
  v_servico public.servicos%ROWTYPE;
  v_fechamento public.atendimento_fechamentos%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_item record;
  v_conta uuid; v_categoria_servico uuid; v_categoria_produto uuid;
  v_recebivel uuid;
  v_produtos_bruto numeric(15,2):=0; v_bruto numeric(15,2); v_final numeric(15,2);
  v_servico_liquido numeric(15,2); v_produtos_liquido numeric(15,2);
  v_taxa_servico numeric(15,2); v_taxa_produtos numeric(15,2);
  v_comissao_pct numeric(5,2); v_comissao_produtos numeric(15,2):=0;
  v_linha_bruta numeric(15,2); v_linha_desconto numeric(15,2); v_linha_liquida numeric(15,2);
  v_desconto_produtos_restante numeric(15,2); v_bruto_produtos_restante numeric(15,2);
  v_saldo_antes integer; v_liquidado boolean; v_competencia date;
BEGIN
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CHAVE_INVALIDA'; END IF;

  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_NAO_ENCONTRADA'; END IF;

  SELECT * INTO v_fechamento
  FROM public.atendimento_fechamentos
  WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN
    IF v_fechamento.agendamento_id<>v_pendencia.agendamento_id THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CHAVE_EM_USO'; END IF;
    RETURN jsonb_build_object('idempotente',true,'fechamento',to_jsonb(v_fechamento));
  END IF;

  IF p_desconto IS NULL OR p_desconto<0 THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_DESCONTO_INVALIDO'; END IF;
  IF p_taxa IS NULL OR p_taxa<0 THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_TAXA_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_PAGAMENTO_INVALIDO'; END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento<current_date THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_DATA_INVALIDA'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_VERSAO_INVALIDA'; END IF;

  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CONFLITO_VERSAO'; END IF;

  SELECT * INTO v_agendamento
  FROM public.agendamentos
  WHERE id=v_pendencia.agendamento_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND OR v_agendamento.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_STATUS_INVALIDO'; END IF;
  SELECT * INTO v_servico FROM public.servicos WHERE id=v_pendencia.servico_id AND barbearia_id=v_barbearia;

  FOR v_item IN
    SELECT ai.produto_id,ai.quantidade,ai.preco_unitario_snapshot
    FROM public.atendimento_itens_pendentes ai
    WHERE ai.pendencia_id=v_pendencia.id AND ai.barbearia_id=v_barbearia
    ORDER BY ai.produto_id
  LOOP
    SELECT * INTO v_produto
    FROM public.produtos
    WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_produtos_bruto:=v_produtos_bruto+round(v_item.preco_unitario_snapshot*v_item.quantidade,2);
  END LOOP;

  v_bruto:=round(v_pendencia.valor_servico,2)+v_produtos_bruto;
  IF v_bruto<=0 OR p_desconto>v_bruto THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_DESCONTO_INVALIDO'; END IF;
  v_final:=round(v_bruto-p_desconto,2);
  IF p_taxa>v_final THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_TAXA_INVALIDA'; END IF;
  v_servico_liquido:=round(v_final*round(v_pendencia.valor_servico,2)/v_bruto,2);
  v_produtos_liquido:=v_final-v_servico_liquido;
  v_taxa_servico:=CASE WHEN v_final=0 THEN 0 ELSE round(p_taxa*v_servico_liquido/v_final,2) END;
  v_taxa_produtos:=round(p_taxa-v_taxa_servico,2);
  v_comissao_pct:=COALESCE(v_servico.comissao_percentual,(SELECT comissao_percentual FROM public.profissionais WHERE id=v_pendencia.profissional_id),0);
  v_competencia:=(v_agendamento.data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
  v_liquidado:=p_data_recebimento=current_date;

  SELECT id INTO v_conta
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia AND ativa
  ORDER BY conta_principal DESC,created_at,id LIMIT 1;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'RECEPCAO_COBRANCA_CONTA_NAO_CONFIGURADA'; END IF;
  SELECT id INTO v_categoria_servico FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_servicos' ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_categoria_produto FROM public.financeiro_categorias WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_produtos' ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.atendimento_fechamentos(
    barbearia_id,agendamento_id,profissional_id,cliente_id,servico_nome_snapshot,valor_servico_bruto,
    valor_produtos_bruto,desconto,valor_servico_liquido,valor_produtos_liquido,valor_final,taxa,forma_pagamento,
    data_recebimento,comissao_servico_percentual,comissao_servico_valor,chave_idempotencia,criado_por
  ) VALUES (
    v_barbearia,v_agendamento.id,v_pendencia.profissional_id,v_pendencia.cliente_id,COALESCE(v_servico.nome,'Servico'),v_pendencia.valor_servico,
    v_produtos_bruto,round(p_desconto,2),v_servico_liquido,v_produtos_liquido,v_final,round(p_taxa,2),p_forma_pagamento,
    p_data_recebimento,v_comissao_pct,round(v_servico_liquido*v_comissao_pct/100,2),p_chave_idempotencia,auth.uid()
  ) RETURNING * INTO v_fechamento;

  v_desconto_produtos_restante:=v_produtos_bruto-v_produtos_liquido;
  v_bruto_produtos_restante:=v_produtos_bruto;
  FOR v_item IN
    SELECT ai.produto_id,ai.quantidade,ai.preco_unitario_snapshot
    FROM public.atendimento_itens_pendentes ai
    WHERE ai.pendencia_id=v_pendencia.id AND ai.barbearia_id=v_barbearia
    ORDER BY ai.produto_id
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    v_linha_bruta:=round(v_item.preco_unitario_snapshot*v_item.quantidade,2);
    v_linha_desconto:=CASE WHEN v_bruto_produtos_restante=v_linha_bruta THEN v_desconto_produtos_restante
      ELSE round((v_produtos_bruto-v_produtos_liquido)*v_linha_bruta/v_produtos_bruto,2) END;
    v_linha_liquida:=v_linha_bruta-v_linha_desconto;
    v_saldo_antes:=v_produto.estoque_quantidade;
    UPDATE public.produtos SET estoque_quantidade=estoque_quantidade-v_item.quantidade,updated_at=clock_timestamp() WHERE id=v_produto.id;
    INSERT INTO public.vendas_produtos(
      barbearia_id,agendamento_id,profissional_id,nome_produto,valor_venda,produto_id,cliente_id,quantidade,
      preco_unitario_snapshot,preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,
      forma_pagamento,chave_idempotencia,criado_por,fechamento_id,desconto_valor
    ) VALUES (
      v_barbearia,v_agendamento.id,v_pendencia.profissional_id,v_produto.nome,v_linha_bruta,v_produto.id,v_pendencia.cliente_id,v_item.quantidade,
      v_item.preco_unitario_snapshot,v_produto.preco_custo,'concluida',COALESCE(v_produto.comissao_percentual,0),
      round(v_linha_liquida*COALESCE(v_produto.comissao_percentual,0)/100,2),p_forma_pagamento,
      extensions.uuid_generate_v4(),auth.uid(),v_fechamento.id,v_linha_desconto
    ) RETURNING * INTO v_venda;
    INSERT INTO public.estoque_movimentacoes(
      barbearia_id,produto_id,fechamento_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por
    ) VALUES (
      v_barbearia,v_produto.id,v_fechamento.id,v_venda.id,'venda',-v_item.quantidade,v_saldo_antes,v_saldo_antes-v_item.quantidade,'Venda cobrada pela recepcao',auth.uid()
    );
    v_comissao_produtos:=v_comissao_produtos+v_venda.comissao_valor;
    v_desconto_produtos_restante:=v_desconto_produtos_restante-v_linha_desconto;
    v_bruto_produtos_restante:=v_bruto_produtos_restante-v_linha_bruta;
  END LOOP;

  IF v_servico_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Atendimento - '||COALESCE(v_servico.nome,'Servico'),v_servico_liquido,v_taxa_servico,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_pendencia.cliente_id,v_categoria_servico,'servico',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(
        barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,
        conta_receber_id,agendamento_id,fechamento_id,descricao
      ) VALUES (
        v_barbearia,v_conta,'entrada',v_servico_liquido,v_competencia,p_data_recebimento,v_categoria_servico,'checkout',
        p_chave_idempotencia::text||':servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento do atendimento pela recepcao'
      );
      IF v_taxa_servico>0 THEN
        INSERT INTO public.financeiro_movimentacoes(
          barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,
          conta_receber_id,agendamento_id,fechamento_id,descricao
        ) VALUES (
          v_barbearia,v_conta,'saida',v_taxa_servico,v_competencia,p_data_recebimento,'taxa_checkout',
          p_chave_idempotencia::text||':taxa-servico',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa do atendimento'
        );
      END IF;
    END IF;
  END IF;

  IF v_produtos_liquido>0 THEN
    INSERT INTO public.financeiro_contas_receber(
      barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
      conta_destino_id,cliente_id,categoria_id,origem,referencia_externa,agendamento_id,fechamento_id
    ) VALUES (
      v_barbearia,'Produtos do atendimento',v_produtos_liquido,v_taxa_produtos,p_data_recebimento,v_competencia,
      CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
      v_conta,v_pendencia.cliente_id,v_categoria_produto,'produto',v_fechamento.id::text,v_agendamento.id,v_fechamento.id
    ) RETURNING id INTO v_recebivel;
    IF v_liquidado THEN
      INSERT INTO public.financeiro_movimentacoes(
        barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,
        conta_receber_id,agendamento_id,fechamento_id,descricao
      ) VALUES (
        v_barbearia,v_conta,'entrada',v_produtos_liquido,v_competencia,p_data_recebimento,v_categoria_produto,'checkout',
        p_chave_idempotencia::text||':produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Recebimento dos produtos pela recepcao'
      );
      IF v_taxa_produtos>0 THEN
        INSERT INTO public.financeiro_movimentacoes(
          barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,
          conta_receber_id,agendamento_id,fechamento_id,descricao
        ) VALUES (
          v_barbearia,v_conta,'saida',v_taxa_produtos,v_competencia,p_data_recebimento,'taxa_checkout',
          p_chave_idempotencia::text||':taxa-produtos',v_recebivel,v_agendamento.id,v_fechamento.id,'Taxa dos produtos'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.atendimento_fechamentos
  SET comissao_produtos_valor=v_comissao_produtos,comissao_total=comissao_servico_valor+v_comissao_produtos
  WHERE id=v_fechamento.id
  RETURNING * INTO v_fechamento;

  UPDATE public.agendamentos
  SET status='concluido',valor_final=v_servico_liquido,
      pagamento_status=CASE WHEN v_liquidado THEN 'pago' ELSE 'pendente' END,
      pagamento_provedor=p_forma_pagamento,pagamento_referencia=v_fechamento.id::text
  WHERE id=v_agendamento.id;

  UPDATE public.atendimento_pendencias
  SET status='cobrado',fechamento_id=v_fechamento.id,cobrado_por=auth.uid(),cobrado_em=now(),updated_at=clock_timestamp()
  WHERE id=v_pendencia.id;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_agendamento.id,v_pendencia.id,'cobrado',auth.uid(),'recepcao',
    jsonb_build_object('fechamento_id',v_fechamento.id,'valor_final',v_final,'forma_pagamento',p_forma_pagamento)
  );

  RETURN jsonb_build_object('idempotente',false,'fechamento',to_jsonb(v_fechamento));
END;
$function$;
COMMENT ON FUNCTION public.recepcao_cobranca_concluir(uuid,numeric,text,numeric,date,uuid,timestamp with time zone) IS 'Confirma a cobrança da recepção e movimenta estoque, comissões e financeiro de forma atômica e idempotente.';
GRANT ALL ON FUNCTION public.recepcao_cobranca_concluir(uuid, numeric, text, numeric, date, uuid, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_cobranca_concluir(uuid, numeric, text, numeric, date, uuid, timestamp with time zone) TO service_role;
CREATE FUNCTION public.recepcao_fila_devolver(p_pendencia_id uuid, p_motivo text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_motivo text:=btrim(COALESCE(p_motivo,''));
BEGIN
  IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_MOTIVO_INVALIDO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_VERSAO_INVALIDA'; END IF;
  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_NAO_ENCONTRADA'; END IF;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_CONFLITO_VERSAO'; END IF;

  UPDATE public.atendimento_pendencias
  SET status='cancelado',updated_at=clock_timestamp()
  WHERE id=v_pendencia.id
  RETURNING * INTO v_pendencia;
  UPDATE public.agendamentos
  SET status='em_atendimento'
  WHERE id=v_pendencia.agendamento_id AND barbearia_id=v_barbearia AND status='aguardando_pagamento';
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_STATUS_INVALIDO'; END IF;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_pendencia.agendamento_id,v_pendencia.id,'cancelado',auth.uid(),'recepcao',
    jsonb_build_object('acao','devolvido_ao_barbeiro','motivo',v_motivo,'memoria_preservada',true)
  );
  RETURN jsonb_build_object('pendencia_id',v_pendencia.id,'status','cancelado','agendamento_status','em_atendimento');
END;
$function$;
COMMENT ON FUNCTION public.recepcao_fila_devolver(uuid,text,timestamp with time zone) IS 'Retira uma pendencia da fila, registra o motivo e devolve o agendamento ao barbeiro sem movimentacao financeira.';
GRANT ALL ON FUNCTION public.recepcao_fila_devolver(uuid, text, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_fila_devolver(uuid, text, timestamp with time zone) TO service_role;
CREATE FUNCTION public.recepcao_fila_listar()
 RETURNS TABLE(pendencia_id uuid, agendamento_id uuid, cliente_id uuid, cliente_nome text, cliente_telefone text, profissional_id uuid, profissional_nome text, servico_nome text, valor_servico numeric, produtos jsonb, valor_produtos numeric, valor_total numeric, criado_em timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.recepcao_assert_operador();
BEGIN
  RETURN QUERY
  SELECT ap.id,ap.agendamento_id,ap.cliente_id,c.nome,c.telefone,ap.profissional_id,COALESCE(p.apelido,p.nome),COALESCE(s.nome,'Serviço'),ap.valor_servico,
    COALESCE(items.produtos,'[]'::jsonb),COALESCE(items.total,0),ap.valor_servico+COALESCE(items.total,0),ap.criado_em,ap.updated_at
  FROM public.atendimento_pendencias ap
  JOIN public.clientes c ON c.id=ap.cliente_id AND c.barbearia_id=ap.barbearia_id
  JOIN public.profissionais p ON p.id=ap.profissional_id AND p.barbearia_id=ap.barbearia_id
  LEFT JOIN public.servicos s ON s.id=ap.servico_id AND s.barbearia_id=ap.barbearia_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',ai.id,'produto_id',ai.produto_id,'nome',pr.nome,'quantidade',ai.quantidade,'preco_unitario',ai.preco_unitario_snapshot,'estoque_disponivel',pr.estoque_quantidade) ORDER BY ai.criado_em,ai.id) produtos,
      sum(ai.preco_unitario_snapshot*ai.quantidade)::numeric total
    FROM public.atendimento_itens_pendentes ai JOIN public.produtos pr ON pr.id=ai.produto_id AND pr.barbearia_id=ai.barbearia_id
    WHERE ai.pendencia_id=ap.id AND ai.barbearia_id=v_barbearia
  ) items ON true
  WHERE ap.barbearia_id=v_barbearia AND ap.status='aguardando_pagamento'
  ORDER BY ap.criado_em,ap.id;
END;
$function$;
GRANT ALL ON FUNCTION public.recepcao_fila_listar() TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_fila_listar() TO service_role;
CREATE FUNCTION public.recepcao_produtos_listar()
 RETURNS TABLE(id uuid, nome text, sku text, categoria text, descricao text, preco_venda numeric, estoque_quantidade integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.recepcao_assert_operador();
BEGIN
  RETURN QUERY
  SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.estoque_quantidade
  FROM public.produtos p
  WHERE p.barbearia_id=v_barbearia AND p.ativo
  ORDER BY (p.estoque_quantidade>0) DESC,p.nome,p.id;
END;
$function$;
GRANT ALL ON FUNCTION public.recepcao_produtos_listar() TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_produtos_listar() TO service_role;
CREATE FUNCTION public.recepcao_profissionais_listar()
 RETURNS TABLE(id uuid, nome text, apelido text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid:=public.recepcao_assert_operador();
BEGIN
  RETURN QUERY
  SELECT p.id,p.nome,p.apelido
  FROM public.profissionais p
  WHERE p.barbearia_id=v_barbearia AND p.ativo
  ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id;
END;
$function$;
GRANT ALL ON FUNCTION public.recepcao_profissionais_listar() TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_profissionais_listar() TO service_role;
CREATE OR REPLACE FUNCTION public.recepcao_usuario_atualizar(p_usuario_id uuid, p_nome text, p_telefone text, p_ativo boolean, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid := public.recepcao_assert_admin();
  v_updated timestamptz := clock_timestamp();
  v_result public.profiles%ROWTYPE;
BEGIN
  IF p_usuario_id IS NULL OR p_ativo IS NULL OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'RECEPCAO_NOME_INVALIDO'; END IF;
  IF p_telefone IS NOT NULL AND btrim(p_telefone) <> '' AND length(btrim(p_telefone)) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'RECEPCAO_TELEFONE_INVALIDO'; END IF;

  UPDATE public.profiles
  SET nome = btrim(p_nome), telefone = NULLIF(btrim(p_telefone), ''), ativo = p_ativo, updated_at = v_updated
  WHERE id = p_usuario_id AND barbearia_id = v_barbearia AND role = 'recepcao' AND updated_at = p_expected_updated_at
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_usuario_id AND barbearia_id = v_barbearia AND role = 'recepcao') THEN
      RAISE EXCEPTION 'RECEPCAO_USUARIO_NAO_ENCONTRADO';
    END IF;
    RAISE EXCEPTION 'RECEPCAO_CONFLITO_VERSAO';
  END IF;

  RETURN jsonb_build_object('id', v_result.id, 'ativo', v_result.ativo, 'updated_at', v_result.updated_at);
END;
$function$;
CREATE OR REPLACE FUNCTION public.recepcao_usuarios_listar(p_incluir_inativos boolean DEFAULT true)
 RETURNS TABLE(id uuid, nome text, email text, telefone text, ativo boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.recepcao_assert_admin();
BEGIN
  RETURN QUERY
  SELECT p.id, p.nome, p.email, p.telefone, p.ativo, p.created_at, p.updated_at
  FROM public.profiles p
  WHERE p.barbearia_id = v_barbearia
    AND p.role = 'recepcao'
    AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC, lower(p.nome), p.id;
END;
$function$;
CREATE FUNCTION public.recepcao_venda_avulsa_concluir_cliente(p_produtos jsonb, p_profissional_id uuid, p_cliente_id uuid, p_desconto numeric, p_forma_pagamento text, p_taxa numeric, p_data_recebimento date, p_chave_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_result jsonb;
  v_venda_id uuid;
  v_venda public.vendas_balcao%ROWTYPE;
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=p_cliente_id AND c.barbearia_id=v_barbearia
  ) THEN RAISE EXCEPTION 'RECEPCAO_VENDA_CLIENTE_INVALIDO'; END IF;

  v_result:=public.recepcao_venda_avulsa_concluir(
    p_produtos,p_profissional_id,p_desconto,p_forma_pagamento,p_taxa,p_data_recebimento,p_chave_idempotencia
  );
  v_venda_id:=(v_result->'venda'->>'id')::uuid;
  SELECT * INTO v_venda
  FROM public.vendas_balcao
  WHERE id=v_venda_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_VENDA_NAO_ENCONTRADA'; END IF;

  IF COALESCE((v_result->>'idempotente')::boolean,false) AND v_venda.cliente_id IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION 'RECEPCAO_VENDA_CHAVE_EM_USO';
  END IF;

  UPDATE public.vendas_balcao
  SET cliente_id=p_cliente_id
  WHERE id=v_venda.id AND barbearia_id=v_barbearia
  RETURNING * INTO v_venda;
  UPDATE public.financeiro_contas_receber
  SET cliente_id=p_cliente_id,updated_at=clock_timestamp()
  WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda.id;

  RETURN jsonb_set(v_result,'{venda}',to_jsonb(v_venda),false);
END;
$function$;
COMMENT ON FUNCTION public.recepcao_venda_avulsa_concluir_cliente(jsonb,uuid,uuid,numeric,text,numeric,date,uuid) IS 'Conclui venda avulsa atomica e associa opcionalmente um cliente da mesma barbearia.';
GRANT ALL ON FUNCTION public.recepcao_venda_avulsa_concluir_cliente(jsonb, uuid, uuid, numeric, text, numeric, date, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_venda_avulsa_concluir_cliente(jsonb, uuid, uuid, numeric, text, numeric, date, uuid) TO service_role;
CREATE FUNCTION public.recepcao_venda_avulsa_concluir(p_produtos jsonb, p_profissional_id uuid, p_desconto numeric, p_forma_pagamento text, p_taxa numeric, p_data_recebimento date, p_chave_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_venda_balcao public.vendas_balcao%ROWTYPE;
  v_produto public.produtos%ROWTYPE;
  v_profissional public.profissionais%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_item record;
  v_count integer;
  v_conta uuid; v_categoria uuid; v_recebivel uuid;
  v_bruto numeric(15,2):=0; v_final numeric(15,2);
  v_linha_bruta numeric(15,2); v_linha_desconto numeric(15,2); v_linha_liquida numeric(15,2);
  v_desconto_restante numeric(15,2); v_bruto_restante numeric(15,2);
  v_comissao_pct numeric(5,2); v_comissao_total numeric(15,2):=0;
  v_saldo_antes integer; v_liquidado boolean;
BEGIN
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'RECEPCAO_VENDA_CHAVE_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text||':recepcao-venda:'||p_chave_idempotencia::text,0));
  SELECT * INTO v_venda_balcao
  FROM public.vendas_balcao
  WHERE barbearia_id=v_barbearia AND chave_idempotencia=p_chave_idempotencia;
  IF FOUND THEN RETURN jsonb_build_object('idempotente',true,'venda',to_jsonb(v_venda_balcao)); END IF;

  IF p_produtos IS NULL OR jsonb_typeof(p_produtos)<>'array' OR jsonb_array_length(p_produtos) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_INVALIDOS'; END IF;
  IF p_desconto IS NULL OR p_desconto<0 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_DESCONTO_INVALIDO'; END IF;
  IF p_taxa IS NULL OR p_taxa<0 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_TAXA_INVALIDA'; END IF;
  IF p_forma_pagamento NOT IN ('dinheiro','pix','debito','credito','outro') THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PAGAMENTO_INVALIDO'; END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento<current_date THEN RAISE EXCEPTION 'RECEPCAO_VENDA_DATA_INVALIDA'; END IF;

  IF p_profissional_id IS NOT NULL THEN
    SELECT * INTO v_profissional
    FROM public.profissionais
    WHERE id=p_profissional_id AND barbearia_id=v_barbearia AND ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PROFISSIONAL_INVALIDO'; END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT item->>'produto_id'
    FROM jsonb_array_elements(p_produtos) item
    GROUP BY item->>'produto_id'
    HAVING count(*)>1
  ) duplicados;
  IF v_count>0 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_DUPLICADOS'; END IF;

  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    IF v_item.quantidade IS NULL OR v_item.quantidade NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_INVALIDOS'; END IF;
    SELECT * INTO v_produto
    FROM public.produtos
    WHERE id=v_item.produto_id AND barbearia_id=v_barbearia AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTO_NAO_ENCONTRADO'; END IF;
    IF v_produto.estoque_quantidade<v_item.quantidade THEN RAISE EXCEPTION 'RECEPCAO_VENDA_ESTOQUE_INSUFICIENTE:%',v_produto.nome; END IF;
    v_bruto:=v_bruto+round(v_produto.preco_venda*v_item.quantidade,2);
  END LOOP;

  IF p_desconto>v_bruto THEN RAISE EXCEPTION 'RECEPCAO_VENDA_DESCONTO_INVALIDO'; END IF;
  v_final:=round(v_bruto-p_desconto,2);
  IF p_taxa>v_final THEN RAISE EXCEPTION 'RECEPCAO_VENDA_TAXA_INVALIDA'; END IF;
  v_liquidado:=p_data_recebimento=current_date;

  SELECT id INTO v_conta
  FROM public.financeiro_contas_bancarias
  WHERE barbearia_id=v_barbearia AND ativa
  ORDER BY conta_principal DESC,created_at,id LIMIT 1;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'RECEPCAO_VENDA_CONTA_NAO_CONFIGURADA'; END IF;
  SELECT id INTO v_categoria
  FROM public.financeiro_categorias
  WHERE barbearia_id=v_barbearia AND ativa AND grupo_dre='receita_produtos'
  ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.vendas_balcao(
    barbearia_id,profissional_id,valor_produtos_bruto,desconto,valor_final,taxa,forma_pagamento,
    data_recebimento,chave_idempotencia,criado_por
  ) VALUES (
    v_barbearia,p_profissional_id,v_bruto,round(p_desconto,2),v_final,round(p_taxa,2),p_forma_pagamento,
    p_data_recebimento,p_chave_idempotencia,auth.uid()
  ) RETURNING * INTO v_venda_balcao;

  v_desconto_restante:=v_bruto-v_final;
  v_bruto_restante:=v_bruto;
  FOR v_item IN
    SELECT (item->>'produto_id')::uuid produto_id,(item->>'quantidade')::integer quantidade
    FROM jsonb_array_elements(p_produtos) item
    ORDER BY item->>'produto_id'
  LOOP
    SELECT * INTO v_produto FROM public.produtos WHERE id=v_item.produto_id AND barbearia_id=v_barbearia FOR UPDATE;
    v_linha_bruta:=round(v_produto.preco_venda*v_item.quantidade,2);
    v_linha_desconto:=CASE WHEN v_bruto_restante=v_linha_bruta THEN v_desconto_restante
      ELSE round((v_bruto-v_final)*v_linha_bruta/v_bruto,2) END;
    v_linha_liquida:=v_linha_bruta-v_linha_desconto;
    v_comissao_pct:=CASE WHEN p_profissional_id IS NULL THEN 0 ELSE COALESCE(v_produto.comissao_percentual,v_profissional.comissao_produtos_percentual,0) END;
    v_saldo_antes:=v_produto.estoque_quantidade;
    UPDATE public.produtos
    SET estoque_quantidade=estoque_quantidade-v_item.quantidade,updated_at=clock_timestamp()
    WHERE id=v_produto.id;
    INSERT INTO public.vendas_produtos(
      barbearia_id,profissional_id,nome_produto,valor_venda,produto_id,quantidade,preco_unitario_snapshot,
      preco_custo_snapshot,status,comissao_percentual_snapshot,comissao_valor,forma_pagamento,chave_idempotencia,
      criado_por,desconto_valor,venda_balcao_id
    ) VALUES (
      v_barbearia,p_profissional_id,v_produto.nome,v_linha_bruta,v_produto.id,v_item.quantidade,v_produto.preco_venda,
      v_produto.preco_custo,'concluida',v_comissao_pct,round(v_linha_liquida*v_comissao_pct/100,2),p_forma_pagamento,
      extensions.uuid_generate_v4(),auth.uid(),v_linha_desconto,v_venda_balcao.id
    ) RETURNING * INTO v_venda;
    INSERT INTO public.estoque_movimentacoes(
      barbearia_id,produto_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por
    ) VALUES (
      v_barbearia,v_produto.id,v_venda.id,'venda',-v_item.quantidade,v_saldo_antes,v_saldo_antes-v_item.quantidade,
      'Venda avulsa na recepcao',auth.uid()
    );
    v_comissao_total:=v_comissao_total+v_venda.comissao_valor;
    v_desconto_restante:=v_desconto_restante-v_linha_desconto;
    v_bruto_restante:=v_bruto_restante-v_linha_bruta;
  END LOOP;

  UPDATE public.vendas_balcao SET comissao_total=v_comissao_total
  WHERE id=v_venda_balcao.id RETURNING * INTO v_venda_balcao;

  INSERT INTO public.financeiro_contas_receber(
    barbearia_id,descricao,valor_bruto,taxa,data_previsao,data_competencia,data_liquidacao,metodo_pagamento,status,
    conta_destino_id,categoria_id,origem,referencia_externa,venda_balcao_id
  ) VALUES (
    v_barbearia,'Venda avulsa de produtos',v_final,round(p_taxa,2),p_data_recebimento,current_date,
    CASE WHEN v_liquidado THEN p_data_recebimento END,p_forma_pagamento,CASE WHEN v_liquidado THEN 'liquidado' ELSE 'previsto' END,
    v_conta,v_categoria,'produto',v_venda_balcao.id::text,v_venda_balcao.id
  ) RETURNING id INTO v_recebivel;
  IF v_liquidado THEN
    INSERT INTO public.financeiro_movimentacoes(
      barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,
      idempotency_key,conta_receber_id,venda_balcao_id,descricao
    ) VALUES (
      v_barbearia,v_conta,'entrada',v_final,current_date,p_data_recebimento,v_categoria,'venda_balcao',
      p_chave_idempotencia::text||':entrada',v_recebivel,v_venda_balcao.id,'Recebimento de venda no balcao'
    );
    IF p_taxa>0 THEN
      INSERT INTO public.financeiro_movimentacoes(
        barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,idempotency_key,
        conta_receber_id,venda_balcao_id,descricao
      ) VALUES (
        v_barbearia,v_conta,'saida',round(p_taxa,2),current_date,p_data_recebimento,'taxa_checkout',
        p_chave_idempotencia::text||':taxa',v_recebivel,v_venda_balcao.id,'Taxa de venda no balcao'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('idempotente',false,'venda',to_jsonb(v_venda_balcao));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'RECEPCAO_VENDA_PRODUTOS_INVALIDOS';
END;
$function$;
COMMENT ON FUNCTION public.recepcao_venda_avulsa_concluir(jsonb,uuid,numeric,text,numeric,date,uuid) IS 'Conclui um carrinho avulso da recepcao com estoque e financeiro atomicos; profissional responsavel e opcional.';
GRANT ALL ON FUNCTION public.recepcao_venda_avulsa_concluir(jsonb, uuid, numeric, text, numeric, date, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_venda_avulsa_concluir(jsonb, uuid, numeric, text, numeric, date, uuid) TO service_role;
CREATE FUNCTION public.recepcao_venda_avulsa_estornar(p_venda_id uuid, p_motivo text, p_chave_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_venda_balcao public.vendas_balcao%ROWTYPE;
  v_venda public.vendas_produtos%ROWTYPE;
  v_saldo integer;
  v_motivo text:=btrim(COALESCE(p_motivo,''));
BEGIN
  IF p_chave_idempotencia IS NULL THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_CHAVE_INVALIDA'; END IF;
  IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_MOTIVO_INVALIDO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text||':recepcao-estorno:'||p_venda_id::text,0));

  SELECT * INTO v_venda_balcao
  FROM public.vendas_balcao
  WHERE id=p_venda_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda_balcao.status='estornada' THEN
    IF v_venda_balcao.estorno_chave_idempotencia=p_chave_idempotencia THEN
      RETURN jsonb_build_object('idempotente',true,'venda',to_jsonb(v_venda_balcao));
    END IF;
    RAISE EXCEPTION 'RECEPCAO_ESTORNO_JA_REALIZADO';
  END IF;

  FOR v_venda IN
    SELECT *
    FROM public.vendas_produtos
    WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda_balcao.id AND status='concluida'
    ORDER BY produto_id,id
    FOR UPDATE
  LOOP
    SELECT estoque_quantidade INTO v_saldo
    FROM public.produtos
    WHERE id=v_venda.produto_id AND barbearia_id=v_barbearia
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_ESTORNO_PRODUTO_NAO_ENCONTRADO'; END IF;
    UPDATE public.produtos
    SET estoque_quantidade=estoque_quantidade+v_venda.quantidade,updated_at=clock_timestamp()
    WHERE id=v_venda.produto_id AND barbearia_id=v_barbearia;
    UPDATE public.vendas_produtos SET status='cancelada' WHERE id=v_venda.id AND barbearia_id=v_barbearia;
    INSERT INTO public.estoque_movimentacoes(
      barbearia_id,produto_id,venda_produto_id,tipo,quantidade,saldo_antes,saldo_depois,descricao,criado_por
    ) VALUES (
      v_barbearia,v_venda.produto_id,v_venda.id,'estorno',v_venda.quantidade,v_saldo,v_saldo+v_venda.quantidade,
      'Estorno de venda avulsa: '||v_motivo,auth.uid()
    );
  END LOOP;

  UPDATE public.financeiro_contas_receber
  SET status='estornado',updated_at=clock_timestamp()
  WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda_balcao.id AND status IN ('previsto','liquidado');
  UPDATE public.financeiro_movimentacoes
  SET status='estornado'
  WHERE barbearia_id=v_barbearia AND venda_balcao_id=v_venda_balcao.id AND status='efetivado';
  UPDATE public.vendas_balcao
  SET status='estornada',estornado_por=auth.uid(),estornado_em=clock_timestamp(),motivo_estorno=v_motivo,
      estorno_chave_idempotencia=p_chave_idempotencia
  WHERE id=v_venda_balcao.id AND barbearia_id=v_barbearia
  RETURNING * INTO v_venda_balcao;

  RETURN jsonb_build_object('idempotente',false,'venda',to_jsonb(v_venda_balcao));
END;
$function$;
COMMENT ON FUNCTION public.recepcao_venda_avulsa_estornar(uuid,text,uuid) IS 'Estorna uma venda avulsa da recepcao, restaura estoque e marca o financeiro sem apagar o historico.';
GRANT ALL ON FUNCTION public.recepcao_venda_avulsa_estornar(uuid, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_venda_avulsa_estornar(uuid, text, uuid) TO service_role;
CREATE FUNCTION public.recepcao_vendas_balcao_listar(p_data_inicial date, p_data_final date, p_limite integer DEFAULT 50)
 RETURNS TABLE(id uuid, profissional_id uuid, profissional_nome text, cliente_id uuid, cliente_nome text, criado_por_nome text, valor_produtos_bruto numeric, desconto numeric, valor_final numeric, taxa numeric, valor_liquido numeric, forma_pagamento text, data_recebimento date, comissao_total numeric, status text, criado_em timestamp with time zone, estornado_em timestamp with time zone, motivo_estorno text, produtos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>31 THEN
    RAISE EXCEPTION 'RECEPCAO_VENDAS_PERIODO_INVALIDO';
  END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RECEPCAO_VENDAS_LIMITE_INVALIDO'; END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT
    vb.id,vb.profissional_id,COALESCE(p.apelido,p.nome),vb.cliente_id,c.nome,
    COALESCE(pr.nome,pr.email,'Recepção'),vb.valor_produtos_bruto,vb.desconto,vb.valor_final,vb.taxa,
    vb.valor_liquido,vb.forma_pagamento,vb.data_recebimento,vb.comissao_total,vb.status,vb.criado_em,
    vb.estornado_em,vb.motivo_estorno,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',vp.id,'produto_id',vp.produto_id,'nome',vp.nome_produto,'quantidade',vp.quantidade,
        'valor_bruto',vp.valor_venda,'desconto',vp.desconto_valor,'valor_liquido',vp.valor_liquido,
        'status',vp.status
      ) ORDER BY vp.nome_produto,vp.id)
      FROM public.vendas_produtos vp
      WHERE vp.barbearia_id=v_barbearia AND vp.venda_balcao_id=vb.id
    ),'[]'::jsonb)
  FROM public.vendas_balcao vb
  LEFT JOIN public.profissionais p ON p.id=vb.profissional_id AND p.barbearia_id=vb.barbearia_id
  LEFT JOIN public.clientes c ON c.id=vb.cliente_id AND c.barbearia_id=vb.barbearia_id
  LEFT JOIN public.profiles pr ON pr.id=vb.criado_por AND pr.barbearia_id=vb.barbearia_id
  WHERE vb.barbearia_id=v_barbearia AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim
  ORDER BY vb.criado_em DESC,vb.id DESC
  LIMIT p_limite;
END;
$function$;
GRANT ALL ON FUNCTION public.recepcao_vendas_balcao_listar(date, date, integer) TO authenticated;
GRANT ALL ON FUNCTION public.recepcao_vendas_balcao_listar(date, date, integer) TO service_role;
CREATE FUNCTION public.servico_catalogo_atualizar(p_id uuid, p_nome text, p_preco numeric, p_duracao_minutos integer, p_descricao text, p_comissao_percentual numeric, p_materiais jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_atual public.servicos%ROWTYPE; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_preco IS NULL OR p_preco < 0 THEN RAISE EXCEPTION 'CATALOGO_PRECO_INVALIDO'; END IF;
  IF p_duracao_minutos IS NULL OR p_duracao_minutos NOT BETWEEN 5 AND 480 THEN RAISE EXCEPTION 'CATALOGO_DURACAO_INVALIDA'; END IF;
  IF p_descricao IS NOT NULL AND length(btrim(p_descricao)) > 1000 THEN RAISE EXCEPTION 'CATALOGO_DESCRICAO_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN RAISE EXCEPTION 'CATALOGO_COMISSAO_INVALIDA'; END IF;
  PERFORM public.catalogo_validar_materiais(v_barbearia,p_materiais);
  SELECT * INTO v_atual FROM public.servicos WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF v_atual.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'CATALOGO_CONFLITO_VERSAO'; END IF;
  IF EXISTS (SELECT 1 FROM public.servicos WHERE barbearia_id=v_barbearia AND id<>p_id AND lower(btrim(nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO'; END IF;
  UPDATE public.servicos SET nome=btrim(p_nome),preco=round(p_preco,2),duracao_minutos=p_duracao_minutos,
    descricao=NULLIF(btrim(p_descricao),''),comissao_percentual=p_comissao_percentual,updated_at=clock_timestamp()
  WHERE id=p_id RETURNING updated_at INTO v_updated;
  DELETE FROM public.servicos_materiais WHERE servico_id=p_id AND barbearia_id=v_barbearia;
  INSERT INTO public.servicos_materiais(barbearia_id,servico_id,material_id,quantidade,observacao)
  SELECT v_barbearia,p_id,x.material_id,x.quantidade,NULLIF(btrim(x.observacao),'')
  FROM jsonb_to_recordset(COALESCE(p_materiais,'[]'::jsonb)) x(material_id uuid, quantidade numeric, observacao text);
  RETURN jsonb_build_object('id',p_id,'updated_at',v_updated);
END;
$function$;
GRANT ALL ON FUNCTION public.servico_catalogo_atualizar(uuid, text, numeric, integer, text, numeric, jsonb, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.servico_catalogo_atualizar(uuid, text, numeric, integer, text, numeric, jsonb, timestamp with time zone) TO service_role;
CREATE FUNCTION public.servico_catalogo_criar(p_nome text, p_preco numeric, p_duracao_minutos integer, p_descricao text, p_comissao_percentual numeric, p_materiais jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_id uuid; v_updated timestamptz;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'CATALOGO_NOME_INVALIDO'; END IF;
  IF p_preco IS NULL OR p_preco < 0 THEN RAISE EXCEPTION 'CATALOGO_PRECO_INVALIDO'; END IF;
  IF p_duracao_minutos IS NULL OR p_duracao_minutos NOT BETWEEN 5 AND 480 THEN RAISE EXCEPTION 'CATALOGO_DURACAO_INVALIDA'; END IF;
  IF p_descricao IS NOT NULL AND length(btrim(p_descricao)) > 1000 THEN RAISE EXCEPTION 'CATALOGO_DESCRICAO_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN RAISE EXCEPTION 'CATALOGO_COMISSAO_INVALIDA'; END IF;
  PERFORM public.catalogo_validar_materiais(v_barbearia,p_materiais);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':servico:' || lower(btrim(p_nome)), 0));
  IF EXISTS (SELECT 1 FROM public.servicos WHERE barbearia_id=v_barbearia AND lower(btrim(nome))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO'; END IF;
  INSERT INTO public.servicos(barbearia_id,nome,preco,duracao_minutos,descricao,comissao_percentual,ativo)
  VALUES(v_barbearia,btrim(p_nome),round(p_preco,2),p_duracao_minutos,NULLIF(btrim(p_descricao),''),p_comissao_percentual,true)
  RETURNING id,updated_at INTO v_id,v_updated;
  INSERT INTO public.servicos_materiais(barbearia_id,servico_id,material_id,quantidade,observacao)
  SELECT v_barbearia,v_id,x.material_id,x.quantidade,NULLIF(btrim(x.observacao),'')
  FROM jsonb_to_recordset(COALESCE(p_materiais,'[]'::jsonb)) x(material_id uuid, quantidade numeric, observacao text);
  RETURN jsonb_build_object('id',v_id,'updated_at',v_updated);
END;
$function$;
GRANT ALL ON FUNCTION public.servico_catalogo_criar(text, numeric, integer, text, numeric, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.servico_catalogo_criar(text, numeric, integer, text, numeric, jsonb) TO service_role;
CREATE FUNCTION public.servico_catalogo_definir_ativo(p_id uuid, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_barbearia uuid := public.catalogo_assert_admin(); v_servico public.servicos%ROWTYPE;
BEGIN
  SELECT * INTO v_servico FROM public.servicos WHERE id=p_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO_NAO_ENCONTRADO'; END IF;
  IF p_ativo AND EXISTS (SELECT 1 FROM public.servicos WHERE barbearia_id=v_barbearia AND id<>p_id AND ativo AND lower(btrim(nome))=lower(btrim(v_servico.nome))) THEN RAISE EXCEPTION 'CATALOGO_NOME_DUPLICADO'; END IF;
  UPDATE public.servicos SET ativo=p_ativo,updated_at=clock_timestamp() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'ativo',p_ativo);
END;
$function$;
GRANT ALL ON FUNCTION public.servico_catalogo_definir_ativo(uuid, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.servico_catalogo_definir_ativo(uuid, boolean) TO service_role;
CREATE FUNCTION public.servicos_catalogo_listar(p_incluir_inativos boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, preco numeric, duracao_minutos integer, descricao text, comissao_percentual numeric, ativo boolean, updated_at timestamp with time zone, materiais jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id, s.nome, s.preco, s.duracao_minutos, s.descricao,
    s.comissao_percentual, s.ativo, s.updated_at,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'unidade', m.unidade,
        'quantidade', sm.quantidade, 'observacao', sm.observacao, 'ativo', m.ativo
      ) ORDER BY lower(m.nome)) FILTER (WHERE m.id IS NOT NULL),
      '[]'::jsonb
    ) AS materiais
  FROM public.servicos s
  LEFT JOIN public.servicos_materiais sm
    ON sm.servico_id = s.id AND sm.barbearia_id = s.barbearia_id
  LEFT JOIN public.materiais_servico m
    ON m.id = sm.material_id AND m.barbearia_id = sm.barbearia_id
  WHERE s.barbearia_id = public.catalogo_assert_admin()
    AND (p_incluir_inativos OR s.ativo)
  GROUP BY s.id
  ORDER BY s.ativo DESC, lower(s.nome), s.id;
$function$;
GRANT ALL ON FUNCTION public.servicos_catalogo_listar(boolean) TO authenticated;
GRANT ALL ON FUNCTION public.servicos_catalogo_listar(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.vendas_produtos_aplicar_comissao_padrao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_produto_percentual numeric; v_profissional_percentual numeric;
BEGIN
  IF NEW.produto_id IS NULL OR NEW.profissional_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.comissao_percentual INTO v_produto_percentual
  FROM public.produtos p WHERE p.id=NEW.produto_id AND p.barbearia_id=NEW.barbearia_id;
  IF v_produto_percentual IS NULL THEN
    SELECT p.comissao_produtos_percentual INTO v_profissional_percentual
    FROM public.profissionais p WHERE p.id=NEW.profissional_id AND p.barbearia_id=NEW.barbearia_id;
    NEW.comissao_percentual_snapshot:=COALESCE(v_profissional_percentual,0);
    NEW.comissao_valor:=round((NEW.valor_venda-COALESCE(NEW.desconto_valor,0))*NEW.comissao_percentual_snapshot/100,2);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TABLE public.agenda_horarios_extras (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, profissional_id uuid, data date NOT NULL, hora_inicio time without time zone NOT NULL, hora_fim time without time zone NOT NULL, motivo text, criado_por uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.agenda_horarios_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_horarios_extras ADD CONSTRAINT agenda_horario_extra_intervalo_check CHECK (hora_fim > hora_inicio);
ALTER TABLE public.agenda_horarios_extras ADD CONSTRAINT agenda_horario_extra_motivo_check CHECK (motivo IS NULL OR length(btrim(motivo)) <= 200);
ALTER TABLE public.agenda_horarios_extras ADD CONSTRAINT agenda_horarios_extras_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.agenda_horarios_extras ADD CONSTRAINT agenda_horarios_extras_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.agenda_horarios_extras ADD CONSTRAINT agenda_horarios_extras_pkey PRIMARY KEY (id);
ALTER TABLE public.agenda_horarios_extras ADD CONSTRAINT agenda_horarios_extras_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE CASCADE;
GRANT ALL ON public.agenda_horarios_extras TO authenticated;
GRANT ALL ON public.agenda_horarios_extras TO service_role;
CREATE INDEX agenda_horarios_extras_periodo_idx ON public.agenda_horarios_extras (barbearia_id, data, hora_inicio);
CREATE POLICY agenda_horarios_extras_admin ON public.agenda_horarios_extras USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text])))) WITH CHECK (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE POLICY agenda_horarios_extras_barbeiro_leitura ON public.agenda_horarios_extras FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = 'barbeiro'::text) AND ((profissional_id IS NULL) OR (profissional_id = public.get_my_profissional_id()))));
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_status_check CHECK (status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'em_atendimento'::text, 'aguardando_pagamento'::text, 'concluido'::text, 'cancelado'::text, 'encaixe'::text]));
ALTER TABLE public.agendamentos ADD COLUMN duracao_minutos_snapshot integer;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_duracao_snapshot_check CHECK (duracao_minutos_snapshot >= 5 AND duracao_minutos_snapshot <= 480);
ALTER TABLE public.agendamentos ADD COLUMN data_fim timestamp with time zone;

UPDATE public.agendamentos AS a
SET duracao_minutos_snapshot = COALESCE(s.duracao_minutos, 30),
    data_fim = a.data_hora + make_interval(mins => COALESCE(s.duracao_minutos, 30))
FROM public.servicos AS s
WHERE s.id = a.servico_id
  AND (a.duracao_minutos_snapshot IS NULL OR a.data_fim IS NULL);

UPDATE public.agendamentos
SET duracao_minutos_snapshot = COALESCE(duracao_minutos_snapshot, 30),
    data_fim = COALESCE(
      data_fim,
      data_hora + make_interval(mins => COALESCE(duracao_minutos_snapshot, 30))
    )
WHERE duracao_minutos_snapshot IS NULL OR data_fim IS NULL;

ALTER TABLE public.agendamentos
  ALTER COLUMN duracao_minutos_snapshot SET DEFAULT 30,
  ALTER COLUMN duracao_minutos_snapshot SET NOT NULL,
  ALTER COLUMN data_fim SET NOT NULL;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_data_fim_check CHECK (data_fim > data_hora);
ALTER TABLE public.agendamentos ADD COLUMN origem text DEFAULT 'interno'::text NOT NULL;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_origem_check CHECK (origem = ANY (ARRAY['interno'::text, 'portal_cliente'::text]));
ALTER TABLE public.agendamentos ADD COLUMN pagamento_status text DEFAULT 'nao_solicitado'::text NOT NULL;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_pagamento_status_check CHECK (pagamento_status = ANY (ARRAY['nao_solicitado'::text, 'pendente'::text, 'pago'::text, 'falhou'::text, 'estornado'::text]));
ALTER TABLE public.agendamentos ADD COLUMN pagamento_provedor text;
ALTER TABLE public.agendamentos ADD COLUMN pagamento_referencia text;
CREATE INDEX agendamentos_ocupacao_idx ON public.agendamentos (profissional_id, data_hora, data_fim) WHERE status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'encaixe'::text, 'em_atendimento'::text]);
CREATE TRIGGER agendamentos_preparar_e_proteger_horario_trg BEFORE INSERT OR UPDATE OF profissional_id, servico_id, data_hora, status, duracao_minutos_snapshot ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.agendamentos_preparar_e_proteger_horario();
CREATE TABLE public.atendimento_fechamentos (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, agendamento_id uuid NOT NULL, profissional_id uuid NOT NULL, cliente_id uuid NOT NULL, status text DEFAULT 'concluido'::text NOT NULL, servico_nome_snapshot text NOT NULL, valor_servico_bruto numeric(15,2) NOT NULL, valor_produtos_bruto numeric(15,2) DEFAULT 0 NOT NULL, desconto numeric(15,2) DEFAULT 0 NOT NULL, valor_servico_liquido numeric(15,2) NOT NULL, valor_produtos_liquido numeric(15,2) NOT NULL, valor_final numeric(15,2) NOT NULL, taxa numeric(15,2) DEFAULT 0 NOT NULL, valor_liquido numeric(15,2) GENERATED ALWAYS AS ((valor_final - taxa)) STORED, forma_pagamento text NOT NULL, data_recebimento date NOT NULL, comissao_servico_percentual numeric(5,2) DEFAULT 0 NOT NULL, comissao_servico_valor numeric(15,2) DEFAULT 0 NOT NULL, comissao_produtos_valor numeric(15,2) DEFAULT 0 NOT NULL, comissao_total numeric(15,2) DEFAULT 0 NOT NULL, chave_idempotencia uuid NOT NULL, criado_por uuid NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL, estornado_por uuid, estornado_em timestamp with time zone, motivo_estorno text);
ALTER TABLE public.atendimento_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamento_agendamento_tenant_fkey FOREIGN KEY (barbearia_id, agendamento_id) REFERENCES public.agendamentos(barbearia_id, id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamento_cliente_tenant_fkey FOREIGN KEY (barbearia_id, cliente_id) REFERENCES public.clientes(barbearia_id, id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamento_profissional_tenant_fkey FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais(barbearia_id, id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_barbearia_id_agendamento_id_key UNIQUE (barbearia_id, agendamento_id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_barbearia_id_chave_idempotencia_key UNIQUE (barbearia_id, chave_idempotencia);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_check CHECK (desconto <= (valor_servico_bruto + valor_produtos_bruto));
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_check1 CHECK (valor_final = (valor_servico_liquido + valor_produtos_liquido));
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_check2 CHECK (valor_final = (valor_servico_bruto + valor_produtos_bruto - desconto));
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_check3 CHECK (taxa <= valor_final);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_check4 CHECK (status = 'concluido'::text AND estornado_em IS NULL OR status = 'estornado'::text AND estornado_em IS NOT NULL);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_comissao_produtos_valor_check CHECK (comissao_produtos_valor >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_comissao_servico_percentual_check CHECK (comissao_servico_percentual >= 0::numeric AND comissao_servico_percentual <= 100::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_comissao_servico_valor_check CHECK (comissao_servico_valor >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_comissao_total_check CHECK (comissao_total >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_desconto_check CHECK (desconto >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_estornado_por_fkey FOREIGN KEY (estornado_por) REFERENCES auth.users(id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_forma_pagamento_check CHECK (forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'debito'::text, 'credito'::text, 'outro'::text]));
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_pkey PRIMARY KEY (id);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_status_check CHECK (status = ANY (ARRAY['concluido'::text, 'estornado'::text]));
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_taxa_check CHECK (taxa >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_valor_final_check CHECK (valor_final >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_valor_produtos_bruto_check CHECK (valor_produtos_bruto >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_valor_produtos_liquido_check CHECK (valor_produtos_liquido >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_valor_servico_bruto_check CHECK (valor_servico_bruto >= 0::numeric);
ALTER TABLE public.atendimento_fechamentos ADD CONSTRAINT atendimento_fechamentos_valor_servico_liquido_check CHECK (valor_servico_liquido >= 0::numeric);
GRANT SELECT ON public.atendimento_fechamentos TO authenticated;
GRANT ALL ON public.atendimento_fechamentos TO service_role;
CREATE INDEX atendimento_fechamentos_profissional_data_idx ON public.atendimento_fechamentos (barbearia_id, profissional_id, criado_em DESC);
CREATE TRIGGER atendimento_fechamentos_bloqueia_barbeiro_recepcao BEFORE INSERT ON public.atendimento_fechamentos FOR EACH ROW EXECUTE FUNCTION public.checkout_bloquear_barbeiro_com_recepcao();
CREATE POLICY atendimento_fechamentos_admin_leitura ON public.atendimento_fechamentos FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE POLICY atendimento_fechamentos_barbeiro_leitura ON public.atendimento_fechamentos FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (profissional_id = public.get_my_profissional_id())));
CREATE TABLE public.atendimento_itens_pendentes (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, pendencia_id uuid NOT NULL, produto_id uuid NOT NULL, quantidade integer NOT NULL, preco_unitario_snapshot numeric(15,2) NOT NULL, adicionado_por_papel text NOT NULL, adicionado_por uuid NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.atendimento_itens_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_adicionado_por_fkey FOREIGN KEY (adicionado_por) REFERENCES auth.users(id);
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_adicionado_por_papel_check CHECK (adicionado_por_papel = ANY (ARRAY['barbeiro'::text, 'recepcao'::text]));
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_pendencia_id_produto_id_key UNIQUE (pendencia_id, produto_id);
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_pkey PRIMARY KEY (id);
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_preco_unitario_snapshot_check CHECK (preco_unitario_snapshot >= 0::numeric);
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_quantidade_check CHECK (quantidade >= 1 AND quantidade <= 100);
GRANT ALL ON public.atendimento_itens_pendentes TO service_role;
CREATE INDEX atendimento_itens_pendentes_tenant_idx ON public.atendimento_itens_pendentes (barbearia_id, pendencia_id);
CREATE TABLE public.atendimento_operacao_log (id bigint GENERATED ALWAYS AS IDENTITY NOT NULL, barbearia_id uuid NOT NULL, agendamento_id uuid NOT NULL, pendencia_id uuid, evento text NOT NULL, ator_id uuid NOT NULL, ator_papel text NOT NULL, detalhes jsonb DEFAULT '{}'::jsonb NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.atendimento_operacao_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_operacao_log ADD CONSTRAINT atendimento_operacao_log_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_operacao_log ADD CONSTRAINT atendimento_operacao_log_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id);
ALTER TABLE public.atendimento_operacao_log ADD CONSTRAINT atendimento_operacao_log_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.atendimento_operacao_log ADD CONSTRAINT atendimento_operacao_log_evento_check CHECK (evento = ANY (ARRAY['enviado_recepcao'::text, 'carrinho_alterado'::text, 'cobrado'::text, 'cancelado'::text]));
ALTER TABLE public.atendimento_operacao_log ADD CONSTRAINT atendimento_operacao_log_pkey PRIMARY KEY (id);
GRANT ALL ON public.atendimento_operacao_log TO service_role;
CREATE INDEX atendimento_operacao_log_agendamento_idx ON public.atendimento_operacao_log (barbearia_id, agendamento_id, criado_em);
CREATE TABLE public.atendimento_pendencias (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, agendamento_id uuid NOT NULL, profissional_id uuid NOT NULL, cliente_id uuid NOT NULL, servico_id uuid, memoria_corte_id uuid NOT NULL, valor_servico numeric(15,2) NOT NULL, status text DEFAULT 'aguardando_pagamento'::text NOT NULL, chave_idempotencia uuid NOT NULL, criado_por uuid NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, fechamento_id uuid, cobrado_por uuid, cobrado_em timestamp with time zone);
ALTER TABLE public.atendimento_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_barbearia_id_chave_idempotencia_key UNIQUE (barbearia_id, chave_idempotencia);
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_cobrado_por_fkey FOREIGN KEY (cobrado_por) REFERENCES auth.users(id);
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_fechamento_tenant_fkey FOREIGN KEY (barbearia_id, fechamento_id) REFERENCES public.atendimento_fechamentos(barbearia_id, id);
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_pkey PRIMARY KEY (id);
ALTER TABLE public.atendimento_itens_pendentes ADD CONSTRAINT atendimento_itens_pendentes_pendencia_id_fkey FOREIGN KEY (pendencia_id) REFERENCES public.atendimento_pendencias(id) ON DELETE CASCADE;
ALTER TABLE public.atendimento_operacao_log ADD CONSTRAINT atendimento_operacao_log_pendencia_id_fkey FOREIGN KEY (pendencia_id) REFERENCES public.atendimento_pendencias(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE RESTRICT;
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_status_check CHECK (status = ANY (ARRAY['aguardando_pagamento'::text, 'cobrado'::text, 'cancelado'::text]));
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_valor_servico_check CHECK (valor_servico >= 0::numeric);
GRANT SELECT ON public.atendimento_pendencias TO authenticated;
GRANT ALL ON public.atendimento_pendencias TO service_role;
CREATE UNIQUE INDEX atendimento_pendencias_aberta_agendamento_unique ON public.atendimento_pendencias (barbearia_id, agendamento_id) WHERE status = 'aguardando_pagamento'::text;
CREATE INDEX atendimento_pendencias_fila_idx ON public.atendimento_pendencias (barbearia_id, status, criado_em);
CREATE POLICY atendimento_pendencias_leitura_operacional ON public.atendimento_pendencias FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND (((public.get_my_role() = 'recepcao'::text) AND public.modulo_acesso_verificar('recepcao'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text])) OR ((public.get_my_role() = 'barbeiro'::text) AND (profissional_id = public.get_my_profissional_id())))));
CREATE TABLE public.barbearia_modulos (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, modulo text NOT NULL, status_contrato text DEFAULT 'nao_contratado'::text NOT NULL, ativo_na_unidade boolean DEFAULT false NOT NULL, trial_ate timestamp with time zone, vigente_ate timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
COMMENT ON TABLE public.barbearia_modulos IS 'Entitlements comerciais e ativação por unidade. status_contrato é alterado somente pela plataforma.';
COMMENT ON COLUMN public.barbearia_modulos.status_contrato IS 'Estado comercial controlado pelo Garagem System; nunca editável pelo tenant.';
ALTER TABLE public.barbearia_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbearia_modulos ADD CONSTRAINT barbearia_modulos_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.barbearia_modulos ADD CONSTRAINT barbearia_modulos_barbearia_id_modulo_key UNIQUE (barbearia_id, modulo);
ALTER TABLE public.barbearia_modulos ADD CONSTRAINT barbearia_modulos_check CHECK (status_contrato <> 'trial'::text OR trial_ate IS NOT NULL);
ALTER TABLE public.barbearia_modulos ADD CONSTRAINT barbearia_modulos_modulo_check CHECK (modulo = 'recepcao'::text);
ALTER TABLE public.barbearia_modulos ADD CONSTRAINT barbearia_modulos_pkey PRIMARY KEY (id);
ALTER TABLE public.barbearia_modulos ADD CONSTRAINT barbearia_modulos_status_contrato_check CHECK (status_contrato = ANY (ARRAY['nao_contratado'::text, 'trial'::text, 'ativo'::text, 'suspenso'::text, 'cancelado'::text]));
GRANT SELECT ON public.barbearia_modulos TO authenticated;
GRANT ALL ON public.barbearia_modulos TO service_role;
CREATE POLICY barbearia_modulos_leitura_admin ON public.barbearia_modulos FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
COMMENT ON COLUMN public.barbearias.logo_url IS 'URL pública do logo institucional compactado; a escrita do arquivo é isolada pelo primeiro segmento do path.';
ALTER TABLE public.barbearias ADD COLUMN fuso_horario text DEFAULT 'America/Sao_Paulo'::text NOT NULL;
ALTER TABLE public.barbearias ADD COLUMN portal_segredo uuid DEFAULT extensions.uuid_generate_v4() NOT NULL;
ALTER TABLE public.barbearias ADD COLUMN portal_ativo boolean DEFAULT true NOT NULL;
ALTER TABLE public.barbearias ADD COLUMN pagamento_online_ativo boolean DEFAULT false NOT NULL;
ALTER TABLE public.barbearias ADD COLUMN pagamento_provedor text;
ALTER TABLE public.barbearias ADD COLUMN pix_chave text;
ALTER TABLE public.barbearias ADD COLUMN pix_beneficiario text;
ALTER TABLE public.barbearias ADD COLUMN pix_cidade text;
ALTER TABLE public.barbearias ADD CONSTRAINT barbearias_pix_configuracao_completa CHECK (pix_chave IS NULL AND pix_beneficiario IS NULL AND pix_cidade IS NULL OR char_length(pix_chave) >= 1 AND char_length(pix_chave) <= 77 AND char_length(pix_beneficiario) >= 2 AND char_length(pix_beneficiario) <= 25 AND char_length(pix_cidade) >= 2 AND char_length(pix_cidade) <= 15);
CREATE POLICY barbearias_identidade_atualizar ON public.barbearias FOR UPDATE TO authenticated USING (((id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text])))) WITH CHECK (((id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE TABLE public.cliente_cortes (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, cliente_id uuid NOT NULL, agendamento_id uuid NOT NULL, profissional_id uuid NOT NULL, estilo text NOT NULL, pentes text, acabamento text, barba text, observacoes text, preferencias_cliente text, foto_path text, foto_mime text, foto_bytes integer, foto_largura integer, foto_altura integer, foto_excluida_em timestamp with time zone, ativo boolean DEFAULT true NOT NULL, arquivado_em timestamp with time zone, criado_por uuid NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION public.cliente_corte_json(p_corte public.cliente_cortes)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id',p_corte.id,'cliente_id',p_corte.cliente_id,'agendamento_id',p_corte.agendamento_id,
    'profissional_id',p_corte.profissional_id,'estilo',p_corte.estilo,'pentes',p_corte.pentes,
    'acabamento',p_corte.acabamento,'barba',p_corte.barba,'observacoes',p_corte.observacoes,
    'preferencias_cliente',p_corte.preferencias_cliente,
    'foto_path',CASE WHEN p_corte.foto_excluida_em IS NULL THEN p_corte.foto_path ELSE NULL END,
    'foto_mime',p_corte.foto_mime,'foto_bytes',p_corte.foto_bytes,
    'foto_largura',p_corte.foto_largura,'foto_altura',p_corte.foto_altura,
    'ativo',p_corte.ativo,'criado_em',p_corte.criado_em
  )
$function$;
GRANT ALL ON FUNCTION public.cliente_corte_json(public.cliente_cortes) TO service_role;
ALTER TABLE public.cliente_cortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE RESTRICT;
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_arquivo_check CHECK (ativo AND arquivado_em IS NULL OR NOT ativo AND arquivado_em IS NOT NULL);
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_estilo_check CHECK (length(btrim(estilo)) >= 2 AND length(btrim(estilo)) <= 80);
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_foto_check CHECK (foto_path IS NULL AND foto_mime IS NULL AND foto_bytes IS NULL AND foto_largura IS NULL AND foto_altura IS NULL OR foto_path IS NOT NULL AND (foto_mime = ANY (ARRAY['image/webp'::text, 'image/jpeg'::text])) AND foto_bytes >= 1 AND foto_bytes <= 1048576 AND foto_largura >= 1 AND foto_largura <= 1600 AND foto_altura >= 1 AND foto_altura <= 1600);
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_pkey PRIMARY KEY (id);
ALTER TABLE public.atendimento_pendencias ADD CONSTRAINT atendimento_pendencias_memoria_corte_id_fkey FOREIGN KEY (memoria_corte_id) REFERENCES public.cliente_cortes(id) ON DELETE RESTRICT;
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE RESTRICT;
ALTER TABLE public.cliente_cortes ADD CONSTRAINT cliente_cortes_textos_check CHECK (length(COALESCE(pentes, ''::text)) <= 120 AND length(COALESCE(acabamento, ''::text)) <= 80 AND length(COALESCE(barba, ''::text)) <= 80 AND length(COALESCE(observacoes, ''::text)) <= 1000 AND length(COALESCE(preferencias_cliente, ''::text)) <= 1000);
GRANT ALL ON public.cliente_cortes TO service_role;
CREATE UNIQUE INDEX cliente_cortes_um_ativo_idx ON public.cliente_cortes (cliente_id) WHERE ativo;
CREATE INDEX cliente_cortes_historico_idx ON public.cliente_cortes (barbearia_id, cliente_id, criado_em DESC);
CREATE INDEX cliente_cortes_agendamento_idx ON public.cliente_cortes (barbearia_id, agendamento_id, criado_em DESC);
CREATE POLICY cliente_cortes_leitura_autorizada ON public.cliente_cortes FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND ((public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text])) OR ((public.get_my_role() = 'barbeiro'::text) AND (EXISTS ( SELECT 1
   FROM public.agendamentos a
  WHERE ((a.barbearia_id = cliente_cortes.barbearia_id) AND (a.cliente_id = cliente_cortes.cliente_id) AND (a.profissional_id = public.get_my_profissional_id()))))))));
ALTER TABLE public.clientes ADD COLUMN cpf_hash text;
ALTER TABLE public.clientes ADD COLUMN cpf_final character(4);
ALTER TABLE public.clientes ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL;
CREATE UNIQUE INDEX clientes_cpf_tenant_uidx ON public.clientes (barbearia_id, cpf_hash) WHERE cpf_hash IS NOT NULL;
CREATE INDEX clientes_busca_tenant_idx ON public.clientes (barbearia_id, lower(nome));
CREATE POLICY clientes_leitura_operadores_autorizados ON public.clientes FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text, 'barbeiro'::text]))));
CREATE TABLE public.estoque_movimentacoes (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, produto_id uuid NOT NULL, fechamento_id uuid, venda_produto_id uuid, tipo text NOT NULL, quantidade integer NOT NULL, saldo_antes integer NOT NULL, saldo_depois integer NOT NULL, descricao text, criado_por uuid NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_mov_fechamento_tenant_fkey FOREIGN KEY (barbearia_id, fechamento_id) REFERENCES public.atendimento_fechamentos(barbearia_id, id);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_mov_venda_tenant_fkey FOREIGN KEY (barbearia_id, venda_produto_id) REFERENCES public.vendas_produtos(barbearia_id, id);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_check CHECK (saldo_depois = (saldo_antes + quantidade));
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_pkey PRIMARY KEY (id);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_quantidade_check CHECK (quantidade <> 0);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_saldo_antes_check CHECK (saldo_antes >= 0);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_saldo_depois_check CHECK (saldo_depois >= 0);
ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_tipo_check CHECK (tipo = ANY (ARRAY['venda'::text, 'estorno'::text, 'entrada'::text, 'ajuste'::text]));
GRANT SELECT ON public.estoque_movimentacoes TO authenticated;
GRANT ALL ON public.estoque_movimentacoes TO service_role;
CREATE INDEX estoque_mov_produto_data_idx ON public.estoque_movimentacoes (barbearia_id, produto_id, criado_em DESC);
CREATE POLICY estoque_movimentacoes_admin_leitura ON public.estoque_movimentacoes FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE POLICY estoque_movimentacoes_barbeiro_leitura ON public.estoque_movimentacoes FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (EXISTS ( SELECT 1
   FROM public.atendimento_fechamentos f
  WHERE ((f.id = estoque_movimentacoes.fechamento_id) AND (f.barbearia_id = estoque_movimentacoes.barbearia_id) AND (f.profissional_id = public.get_my_profissional_id()))))));
ALTER TABLE public.financeiro_contas_pagar ADD COLUMN grupo_id uuid;
ALTER TABLE public.financeiro_contas_pagar ADD COLUMN modalidade text DEFAULT 'unico'::text NOT NULL;
ALTER TABLE public.financeiro_contas_pagar ADD CONSTRAINT financeiro_contas_pagar_modalidade_check CHECK (modalidade = ANY (ARRAY['unico'::text, 'parcelado'::text, 'recorrente'::text]));
ALTER TABLE public.financeiro_contas_pagar ADD COLUMN numero_repeticao integer;
ALTER TABLE public.financeiro_contas_pagar ADD COLUMN total_repeticoes integer;
ALTER TABLE public.financeiro_contas_pagar ADD CONSTRAINT financeiro_cp_repeticao_check CHECK (modalidade = 'unico'::text AND grupo_id IS NULL AND numero_repeticao IS NULL AND total_repeticoes IS NULL OR (modalidade = ANY (ARRAY['parcelado'::text, 'recorrente'::text])) AND grupo_id IS NOT NULL AND numero_repeticao >= 1 AND numero_repeticao <= 60 AND total_repeticoes >= 2 AND total_repeticoes <= 60 AND numero_repeticao <= total_repeticoes);
CREATE UNIQUE INDEX financeiro_cp_grupo_numero_idx ON public.financeiro_contas_pagar (barbearia_id, grupo_id, numero_repeticao) WHERE grupo_id IS NOT NULL;
ALTER TABLE public.financeiro_contas_receber ADD COLUMN data_competencia date;

UPDATE public.financeiro_contas_receber
SET data_competencia = data_previsao
WHERE data_competencia IS NULL;

ALTER TABLE public.financeiro_contas_receber
  ALTER COLUMN data_competencia SET NOT NULL;
ALTER TABLE public.financeiro_contas_receber ADD COLUMN fechamento_id uuid;
ALTER TABLE public.financeiro_contas_receber ADD CONSTRAINT financeiro_cr_fechamento_tenant_fkey FOREIGN KEY (barbearia_id, fechamento_id) REFERENCES public.atendimento_fechamentos(barbearia_id, id);
ALTER TABLE public.financeiro_contas_receber ADD COLUMN venda_balcao_id uuid;
ALTER TABLE public.financeiro_contas_receber ADD COLUMN grupo_id uuid;
ALTER TABLE public.financeiro_contas_receber ADD COLUMN modalidade text DEFAULT 'unico'::text NOT NULL;
ALTER TABLE public.financeiro_contas_receber ADD CONSTRAINT financeiro_contas_receber_modalidade_check CHECK (modalidade = ANY (ARRAY['unico'::text, 'parcelado'::text, 'recorrente'::text]));
ALTER TABLE public.financeiro_contas_receber ADD COLUMN numero_repeticao integer;
ALTER TABLE public.financeiro_contas_receber ADD COLUMN total_repeticoes integer;
ALTER TABLE public.financeiro_contas_receber ADD CONSTRAINT financeiro_cr_repeticao_check CHECK (modalidade = 'unico'::text AND grupo_id IS NULL AND numero_repeticao IS NULL AND total_repeticoes IS NULL OR (modalidade = ANY (ARRAY['parcelado'::text, 'recorrente'::text])) AND grupo_id IS NOT NULL AND numero_repeticao >= 1 AND numero_repeticao <= 60 AND total_repeticoes >= 2 AND total_repeticoes <= 60 AND numero_repeticao <= total_repeticoes);
CREATE UNIQUE INDEX financeiro_cr_checkout_componente_unique ON public.financeiro_contas_receber (barbearia_id, fechamento_id, origem) WHERE fechamento_id IS NOT NULL;
CREATE UNIQUE INDEX financeiro_cr_grupo_numero_idx ON public.financeiro_contas_receber (barbearia_id, grupo_id, numero_repeticao) WHERE grupo_id IS NOT NULL;
ALTER TABLE public.financeiro_movimentacoes ADD COLUMN fechamento_id uuid;
ALTER TABLE public.financeiro_movimentacoes ADD CONSTRAINT financeiro_mov_fechamento_tenant_fkey FOREIGN KEY (barbearia_id, fechamento_id) REFERENCES public.atendimento_fechamentos(barbearia_id, id);
ALTER TABLE public.financeiro_movimentacoes ADD COLUMN venda_balcao_id uuid;
CREATE TABLE public.materiais_servico (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, nome text NOT NULL, tipo text NOT NULL, unidade text DEFAULT 'unidade'::text NOT NULL, ativo boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.materiais_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_servico ADD CONSTRAINT materiais_servico_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.materiais_servico ADD CONSTRAINT materiais_servico_nome_check CHECK (length(btrim(nome)) >= 2 AND length(btrim(nome)) <= 100);
ALTER TABLE public.materiais_servico ADD CONSTRAINT materiais_servico_pkey PRIMARY KEY (id);
ALTER TABLE public.materiais_servico ADD CONSTRAINT materiais_servico_tipo_check CHECK (tipo = ANY (ARRAY['insumo'::text, 'ferramenta'::text]));
ALTER TABLE public.materiais_servico ADD CONSTRAINT materiais_servico_unidade_check CHECK (length(btrim(unidade)) >= 1 AND length(btrim(unidade)) <= 30);
GRANT SELECT ON public.materiais_servico TO authenticated;
GRANT ALL ON public.materiais_servico TO service_role;
CREATE UNIQUE INDEX materiais_servico_nome_ativo_uidx ON public.materiais_servico (barbearia_id, lower(btrim(nome))) WHERE ativo;
CREATE UNIQUE INDEX materiais_servico_tenant_id_uidx ON public.materiais_servico (barbearia_id, id);
CREATE POLICY materiais_servico_leitura_tenant ON public.materiais_servico FOR SELECT USING ((barbearia_id = public.get_my_barbearia_id()));
CREATE TABLE public.portal_sessoes (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, cliente_id uuid NOT NULL, token_hash text NOT NULL, expira_em timestamp with time zone NOT NULL, ultimo_uso_em timestamp with time zone DEFAULT now() NOT NULL, revogada_em timestamp with time zone, criada_em timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION public.portal_sessao_validar(p_token text)
 RETURNS public.portal_sessoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_sessao public.portal_sessoes%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token)<>64 OR p_token !~ '^[0-9a-f]+$' THEN
    RAISE EXCEPTION 'PORTAL_SESSAO_INVALIDA';
  END IF;
  SELECT * INTO v_sessao FROM public.portal_sessoes
  WHERE token_hash=public.portal_token_hash(p_token)
    AND revogada_em IS NULL AND expira_em>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_SESSAO_INVALIDA'; END IF;
  UPDATE public.portal_sessoes SET ultimo_uso_em=now() WHERE id=v_sessao.id;
  RETURN v_sessao;
END;
$function$;
GRANT ALL ON FUNCTION public.portal_sessao_validar(text) TO service_role;
ALTER TABLE public.portal_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessoes ADD CONSTRAINT portal_sessoes_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.portal_sessoes ADD CONSTRAINT portal_sessoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.portal_sessoes ADD CONSTRAINT portal_sessoes_expiracao_check CHECK (expira_em > criada_em);
ALTER TABLE public.portal_sessoes ADD CONSTRAINT portal_sessoes_pkey PRIMARY KEY (id);
ALTER TABLE public.portal_sessoes ADD CONSTRAINT portal_sessoes_token_hash_key UNIQUE (token_hash);
GRANT ALL ON public.portal_sessoes TO service_role;
CREATE INDEX portal_sessoes_cliente_idx ON public.portal_sessoes (barbearia_id, cliente_id, expira_em DESC);
CREATE POLICY produtos_leitura_operadores_autorizados ON public.produtos FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text, 'barbeiro'::text]))));
CREATE POLICY profiles_leitura_operadores_autorizados ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR ((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text])))));
CREATE POLICY profissionais_leitura_operadores_autorizados ON public.profissionais FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text, 'barbeiro'::text]))));
CREATE TABLE public.profissionais_bloqueios (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, profissional_id uuid NOT NULL, inicio timestamp with time zone NOT NULL, fim timestamp with time zone NOT NULL, motivo text, criado_por uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.profissionais_bloqueios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_bloqueios ADD CONSTRAINT profissionais_bloqueios_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.profissionais_bloqueios ADD CONSTRAINT profissionais_bloqueios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profissionais_bloqueios ADD CONSTRAINT profissionais_bloqueios_motivo_check CHECK (motivo IS NULL OR length(btrim(motivo)) <= 200);
ALTER TABLE public.profissionais_bloqueios ADD CONSTRAINT profissionais_bloqueios_periodo_check CHECK (fim > inicio);
ALTER TABLE public.profissionais_bloqueios ADD CONSTRAINT profissionais_bloqueios_pkey PRIMARY KEY (id);
ALTER TABLE public.profissionais_bloqueios ADD CONSTRAINT profissionais_bloqueios_profissional_tenant_fkey FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais(barbearia_id, id) ON DELETE CASCADE;
GRANT SELECT ON public.profissionais_bloqueios TO authenticated;
GRANT ALL ON public.profissionais_bloqueios TO service_role;
CREATE INDEX profissionais_bloqueios_periodo_idx ON public.profissionais_bloqueios (barbearia_id, profissional_id, inicio, fim);
CREATE POLICY profissionais_bloqueios_admin_leitura ON public.profissionais_bloqueios FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE POLICY profissionais_bloqueios_barbeiro_leitura ON public.profissionais_bloqueios FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (profissional_id = public.get_my_profissional_id())));
CREATE TABLE public.profissionais_jornadas (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, profissional_id uuid NOT NULL, dia_semana smallint NOT NULL, ativo boolean DEFAULT false NOT NULL, hora_inicio time without time zone, hora_fim time without time zone, intervalo_inicio time without time zone, intervalo_fim time without time zone, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.profissionais_jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_dia_semana_check CHECK (dia_semana >= 0 AND dia_semana <= 6);
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_expediente_check CHECK (NOT ativo AND hora_inicio IS NULL AND hora_fim IS NULL AND intervalo_inicio IS NULL AND intervalo_fim IS NULL OR ativo AND hora_inicio IS NOT NULL AND hora_fim IS NOT NULL AND hora_fim > hora_inicio);
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_intervalo_check CHECK (intervalo_inicio IS NULL AND intervalo_fim IS NULL OR ativo AND intervalo_inicio IS NOT NULL AND intervalo_fim IS NOT NULL AND intervalo_fim > intervalo_inicio AND intervalo_inicio > hora_inicio AND intervalo_fim < hora_fim);
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_pkey PRIMARY KEY (id);
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_profissional_id_dia_semana_key UNIQUE (profissional_id, dia_semana);
ALTER TABLE public.profissionais_jornadas ADD CONSTRAINT profissionais_jornadas_profissional_tenant_fkey FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais(barbearia_id, id) ON DELETE CASCADE;
GRANT SELECT ON public.profissionais_jornadas TO authenticated;
GRANT ALL ON public.profissionais_jornadas TO service_role;
CREATE INDEX profissionais_jornadas_tenant_idx ON public.profissionais_jornadas (barbearia_id, profissional_id, dia_semana);
CREATE POLICY profissionais_jornadas_admin_leitura ON public.profissionais_jornadas FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE POLICY profissionais_jornadas_barbeiro_leitura ON public.profissionais_jornadas FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (profissional_id = public.get_my_profissional_id())));
CREATE UNIQUE INDEX servicos_tenant_id_uidx ON public.servicos (barbearia_id, id);
CREATE POLICY servicos_leitura_operadores_autorizados ON public.servicos FOR SELECT TO authenticated USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text, 'barbeiro'::text]))));
CREATE TABLE public.servicos_materiais (barbearia_id uuid NOT NULL, servico_id uuid NOT NULL, material_id uuid NOT NULL, quantidade numeric(10,3) DEFAULT 1 NOT NULL, observacao text);
ALTER TABLE public.servicos_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos_materiais ADD CONSTRAINT servicos_materiais_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.servicos_materiais ADD CONSTRAINT servicos_materiais_material_tenant_fkey FOREIGN KEY (barbearia_id, material_id) REFERENCES public.materiais_servico(barbearia_id, id);
ALTER TABLE public.servicos_materiais ADD CONSTRAINT servicos_materiais_observacao_check CHECK (observacao IS NULL OR length(btrim(observacao)) <= 200);
ALTER TABLE public.servicos_materiais ADD CONSTRAINT servicos_materiais_pkey PRIMARY KEY (servico_id, material_id);
ALTER TABLE public.servicos_materiais ADD CONSTRAINT servicos_materiais_quantidade_check CHECK (quantidade > 0::numeric);
ALTER TABLE public.servicos_materiais ADD CONSTRAINT servicos_materiais_servico_tenant_fkey FOREIGN KEY (barbearia_id, servico_id) REFERENCES public.servicos(barbearia_id, id) ON DELETE CASCADE;
GRANT SELECT ON public.servicos_materiais TO authenticated;
GRANT ALL ON public.servicos_materiais TO service_role;
CREATE INDEX servicos_materiais_tenant_idx ON public.servicos_materiais (barbearia_id, material_id);
CREATE POLICY servicos_materiais_leitura_tenant ON public.servicos_materiais FOR SELECT USING ((barbearia_id = public.get_my_barbearia_id()));
CREATE TABLE public.vendas_balcao (id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, barbearia_id uuid NOT NULL, profissional_id uuid, valor_produtos_bruto numeric(15,2) NOT NULL, desconto numeric(15,2) DEFAULT 0 NOT NULL, valor_final numeric(15,2) NOT NULL, taxa numeric(15,2) DEFAULT 0 NOT NULL, valor_liquido numeric(15,2) GENERATED ALWAYS AS ((valor_final - taxa)) STORED, forma_pagamento text NOT NULL, data_recebimento date NOT NULL, comissao_total numeric(15,2) DEFAULT 0 NOT NULL, status text DEFAULT 'concluida'::text NOT NULL, chave_idempotencia uuid NOT NULL, criado_por uuid NOT NULL, criado_em timestamp with time zone DEFAULT now() NOT NULL, estornado_por uuid, estornado_em timestamp with time zone, motivo_estorno text, estorno_chave_idempotencia uuid, cliente_id uuid);
ALTER TABLE public.vendas_balcao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_barbearia_id_chave_idempotencia_key UNIQUE (barbearia_id, chave_idempotencia);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_barbearia_id_fkey FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_barbearia_id_id_key UNIQUE (barbearia_id, id);
ALTER TABLE public.financeiro_contas_receber ADD CONSTRAINT financeiro_cr_venda_balcao_tenant_fkey FOREIGN KEY (barbearia_id, venda_balcao_id) REFERENCES public.vendas_balcao(barbearia_id, id);
ALTER TABLE public.financeiro_movimentacoes ADD CONSTRAINT financeiro_mov_venda_balcao_tenant_fkey FOREIGN KEY (barbearia_id, venda_balcao_id) REFERENCES public.vendas_balcao(barbearia_id, id);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_check CHECK (desconto <= valor_produtos_bruto);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_check1 CHECK (valor_final = (valor_produtos_bruto - desconto));
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_check2 CHECK (taxa <= valor_final);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_cliente_tenant_fkey FOREIGN KEY (barbearia_id, cliente_id) REFERENCES public.clientes(barbearia_id, id);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_comissao_total_check CHECK (comissao_total >= 0::numeric);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_desconto_check CHECK (desconto >= 0::numeric);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_estado_estorno_check CHECK (status = 'concluida'::text AND estornado_em IS NULL AND estornado_por IS NULL AND motivo_estorno IS NULL AND estorno_chave_idempotencia IS NULL OR status = 'estornada'::text AND estornado_em IS NOT NULL AND estornado_por IS NOT NULL AND length(btrim(motivo_estorno)) >= 3 AND length(btrim(motivo_estorno)) <= 500 AND estorno_chave_idempotencia IS NOT NULL);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_estornado_por_fkey FOREIGN KEY (estornado_por) REFERENCES auth.users(id);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_forma_pagamento_check CHECK (forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'debito'::text, 'credito'::text, 'outro'::text]));
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_pkey PRIMARY KEY (id);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_profissional_tenant_fkey FOREIGN KEY (barbearia_id, profissional_id) REFERENCES public.profissionais(barbearia_id, id);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_status_check CHECK (status = ANY (ARRAY['concluida'::text, 'estornada'::text]));
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_taxa_check CHECK (taxa >= 0::numeric);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_valor_final_check CHECK (valor_final >= 0::numeric);
ALTER TABLE public.vendas_balcao ADD CONSTRAINT vendas_balcao_valor_produtos_bruto_check CHECK (valor_produtos_bruto > 0::numeric);
GRANT SELECT ON public.vendas_balcao TO authenticated;
GRANT ALL ON public.vendas_balcao TO service_role;
CREATE INDEX vendas_balcao_cliente_data_idx ON public.vendas_balcao (barbearia_id, cliente_id, criado_em DESC) WHERE cliente_id IS NOT NULL;
CREATE UNIQUE INDEX vendas_balcao_estorno_idempotencia_unique ON public.vendas_balcao (barbearia_id, estorno_chave_idempotencia) WHERE estorno_chave_idempotencia IS NOT NULL;
CREATE INDEX vendas_balcao_data_idx ON public.vendas_balcao (barbearia_id, criado_em DESC);
CREATE POLICY vendas_balcao_admin_leitura ON public.vendas_balcao FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (public.get_my_role() = ANY (ARRAY['admin'::text, 'master'::text]))));
CREATE POLICY vendas_balcao_barbeiro_leitura ON public.vendas_balcao FOR SELECT USING (((barbearia_id = public.get_my_barbearia_id()) AND (profissional_id = public.get_my_profissional_id())));
ALTER TABLE public.vendas_produtos ADD COLUMN fechamento_id uuid;
ALTER TABLE public.vendas_produtos ADD CONSTRAINT vendas_produtos_fechamento_tenant_fkey FOREIGN KEY (barbearia_id, fechamento_id) REFERENCES public.atendimento_fechamentos(barbearia_id, id);
ALTER TABLE public.vendas_produtos ADD COLUMN desconto_valor numeric(15,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.vendas_produtos ADD CONSTRAINT vendas_produtos_desconto_check CHECK (desconto_valor >= 0::numeric AND desconto_valor <= valor_venda);
ALTER TABLE public.vendas_produtos ADD COLUMN valor_liquido numeric(15,2) GENERATED ALWAYS AS ((valor_venda - desconto_valor)) STORED;
ALTER TABLE public.vendas_produtos ADD CONSTRAINT vendas_produtos_valor_liquido_check CHECK (valor_liquido = (valor_venda - desconto_valor));
ALTER TABLE public.vendas_produtos ADD COLUMN venda_balcao_id uuid;
ALTER TABLE public.vendas_produtos ADD CONSTRAINT vendas_produtos_balcao_tenant_fkey FOREIGN KEY (barbearia_id, venda_balcao_id) REFERENCES public.vendas_balcao(barbearia_id, id);
CREATE INDEX vendas_produtos_balcao_idx ON public.vendas_produtos (barbearia_id, venda_balcao_id);

-- O PostgreSQL concede EXECUTE a PUBLIC por padrão ao criar funções. Reaplica
-- explicitamente a matriz de acesso aprovada para não expor RPCs internas.
DO $$
DECLARE
  v_function regprocedure;
  v_name text;
  v_touched text[] := ARRAY[
    'admin_agenda_listar',
    'admin_agenda_listar_periodo',
    'admin_bloqueio_criar',
    'admin_bloqueio_excluir',
    'admin_bloqueios_listar',
    'admin_checkout_estornar',
    'admin_horario_extra_criar',
    'admin_horarios_extras_listar',
    'admin_jornadas_listar',
    'admin_jornadas_salvar',
    'admin_recepcao_resumo',
    'agenda_assert_operador',
    'agenda_cliente_criar_rapido',
    'agenda_disponibilidade_calendario',
    'agenda_disponibilidade_periodo',
    'agenda_encaixe_catalogo',
    'agenda_encaixe_criar',
    'agenda_horarios_livres',
    'agendamentos_preparar_e_proteger_horario',
    'barbeiro_agenda_contexto',
    'barbeiro_agenda_listar',
    'barbeiro_agenda_listar_memoria',
    'barbeiro_agenda_listar_periodo',
    'barbeiro_agendamento_mudar_status',
    'barbeiro_atendimento_concluir',
    'barbeiro_atendimento_enviar_recepcao',
    'barbeiro_checkout_concluir',
    'barbeiro_painel_resumo',
    'barbeiro_produto_vender',
    'barbeiro_produtos_listar',
    'barbeiros_atualizar',
    'barbeiros_listar',
    'catalogo_assert_admin',
    'catalogo_validar_materiais',
    'checkout_bloquear_barbeiro_com_recepcao',
    'cliente_corte_json',
    'cliente_corte_ultimo',
    'cliente_cpf_hash',
    'cliente_cpf_normalizar',
    'cliente_ficha_detalhe',
    'cliente_salvar',
    'clientes_assert_admin',
    'clientes_listar',
    'configuracoes_modulo_definir_ativo',
    'configuracoes_modulos_listar',
    'configuracoes_pix_obter',
    'configuracoes_pix_salvar',
    'disponibilidade_assert_admin',
    'financeiro_assert_admin',
    'financeiro_auditar',
    'financeiro_cancelar_titulo_manual',
    'financeiro_criar_titulo_manual',
    'financeiro_criar_titulos_em_lote',
    'financeiro_data_mensal',
    'financeiro_editar_titulo_manual',
    'financeiro_listar_titulos',
    'financeiro_receber_conta',
    'get_my_profissional_id',
    'materiais_catalogo_listar',
    'material_catalogo_atualizar',
    'material_catalogo_criar',
    'material_catalogo_definir_ativo',
    'modulo_acesso_verificar',
    'modulo_contratado_e_vigente',
    'portal_acessar',
    'portal_agendamento_cancelar',
    'portal_agendamento_criar',
    'portal_barbearia_publica',
    'portal_cadastrar',
    'portal_dados',
    'portal_encerrar',
    'portal_horarios_livres',
    'portal_perfil_atualizar',
    'portal_sessao_criar',
    'portal_sessao_validar',
    'portal_token_hash',
    'produto_catalogo_atualizar',
    'produto_catalogo_criar',
    'produto_catalogo_definir_ativo',
    'produtos_catalogo_listar',
    'recepcao_agenda_listar_periodo',
    'recepcao_assert_admin',
    'recepcao_assert_operador',
    'recepcao_carrinho_salvar',
    'recepcao_clientes_buscar',
    'recepcao_cobranca_concluir',
    'recepcao_fila_devolver',
    'recepcao_fila_listar',
    'recepcao_produtos_listar',
    'recepcao_profissionais_listar',
    'recepcao_usuario_atualizar',
    'recepcao_usuarios_listar',
    'recepcao_venda_avulsa_concluir',
    'recepcao_venda_avulsa_concluir_cliente',
    'recepcao_venda_avulsa_estornar',
    'recepcao_vendas_balcao_listar',
    'servico_catalogo_atualizar',
    'servico_catalogo_criar',
    'servico_catalogo_definir_ativo',
    'servicos_catalogo_listar',
    'vendas_produtos_aplicar_comissao_padrao'
  ];
  v_internal text[] := ARRAY[
    'agenda_assert_operador',
    'agendamentos_preparar_e_proteger_horario',
    'barbeiro_atendimento_concluir',
    'catalogo_validar_materiais',
    'checkout_bloquear_barbeiro_com_recepcao',
    'cliente_corte_json',
    'cliente_cpf_hash',
    'cliente_cpf_normalizar',
    'clientes_assert_admin',
    'disponibilidade_assert_admin',
    'financeiro_assert_admin',
    'financeiro_auditar',
    'financeiro_data_mensal',
    'modulo_contratado_e_vigente',
    'portal_sessao_criar',
    'portal_sessao_validar',
    'portal_token_hash',
    'recepcao_assert_admin',
    'recepcao_assert_operador',
    'vendas_produtos_aplicar_comissao_padrao'
  ];
  v_portal text[] := ARRAY[
    'portal_acessar',
    'portal_agendamento_cancelar',
    'portal_agendamento_criar',
    'portal_barbearia_publica',
    'portal_cadastrar',
    'portal_dados',
    'portal_encerrar',
    'portal_horarios_livres',
    'portal_perfil_atualizar'
  ];
BEGIN
  FOR v_function, v_name IN
    SELECT p.oid::regprocedure, p.proname
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_touched)
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function
    );

    IF v_name = ANY (v_portal) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_function);
    ELSIF NOT (v_name = ANY (v_internal)) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function);
    END IF;
  END LOOP;
END;
$$;

-- Mantém escrita direta bloqueada; as mutações passam somente pelas RPCs.
DO $$
DECLARE
  v_table regclass;
  v_name text;
  v_touched text[] := ARRAY[
    'agenda_horarios_extras',
    'atendimento_fechamentos',
    'atendimento_itens_pendentes',
    'atendimento_operacao_log',
    'atendimento_pendencias',
    'barbearia_modulos',
    'cliente_cortes',
    'estoque_movimentacoes',
    'materiais_servico',
    'portal_sessoes',
    'profissionais_bloqueios',
    'profissionais_jornadas',
    'servicos_materiais',
    'vendas_balcao'
  ];
  v_authenticated_read text[] := ARRAY[
    'agenda_horarios_extras',
    'atendimento_fechamentos',
    'atendimento_pendencias',
    'barbearia_modulos',
    'estoque_movimentacoes',
    'materiais_servico',
    'profissionais_bloqueios',
    'profissionais_jornadas',
    'servicos_materiais',
    'vendas_balcao'
  ];
BEGIN
  FOR v_table, v_name IN
    SELECT c.oid::regclass, c.relname
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname = ANY (v_touched)
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated',
      v_table
    );

    IF v_name = ANY (v_authenticated_read) THEN
      EXECUTE format('GRANT SELECT ON TABLE %s TO authenticated', v_table);
    END IF;
  END LOOP;
END;
$$;

-- Recursos do Storage não aparecem no diff do schema public.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cortes-clientes',
  'cortes-clientes',
  false,
  1048576,
  ARRAY['image/webp', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS cortes_clientes_ler ON storage.objects;
DROP POLICY IF EXISTS cortes_clientes_enviar ON storage.objects;
DROP POLICY IF EXISTS cortes_clientes_remover ON storage.objects;

CREATE POLICY cortes_clientes_ler ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'cortes-clientes'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin', 'master')
    OR (
      public.get_my_role() = 'barbeiro'
      AND EXISTS (
        SELECT 1
        FROM public.agendamentos AS a
        WHERE a.barbearia_id = public.get_my_barbearia_id()
          AND a.cliente_id::text = (storage.foldername(name))[2]
          AND a.profissional_id = public.get_my_profissional_id()
      )
    )
  )
);

CREATE POLICY cortes_clientes_enviar ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'cortes-clientes'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin', 'master')
    OR (
      public.get_my_role() = 'barbeiro'
      AND EXISTS (
        SELECT 1
        FROM public.agendamentos AS a
        WHERE a.barbearia_id = public.get_my_barbearia_id()
          AND a.cliente_id::text = (storage.foldername(name))[2]
          AND a.profissional_id = public.get_my_profissional_id()
      )
    )
  )
);

CREATE POLICY cortes_clientes_remover ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'cortes-clientes'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin', 'master')
    OR (
      public.get_my_role() = 'barbeiro'
      AND EXISTS (
        SELECT 1
        FROM public.agendamentos AS a
        WHERE a.barbearia_id = public.get_my_barbearia_id()
          AND a.cliente_id::text = (storage.foldername(name))[2]
          AND a.profissional_id = public.get_my_profissional_id()
      )
    )
  )
);

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'barbearias-logos',
  'barbearias-logos',
  true,
  614400,
  ARRAY['image/webp', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS barbearias_logos_inserir ON storage.objects;
DROP POLICY IF EXISTS barbearias_logos_atualizar ON storage.objects;
DROP POLICY IF EXISTS barbearias_logos_remover ON storage.objects;
DROP POLICY IF EXISTS barbearias_logos_ler_proprio ON storage.objects;

CREATE POLICY barbearias_logos_inserir ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'barbearias-logos'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin', 'master')
);

CREATE POLICY barbearias_logos_atualizar ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'barbearias-logos'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin', 'master')
) WITH CHECK (
  bucket_id = 'barbearias-logos'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin', 'master')
);

CREATE POLICY barbearias_logos_remover ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'barbearias-logos'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin', 'master')
);

CREATE POLICY barbearias_logos_ler_proprio ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'barbearias-logos'
  AND (storage.foldername(name))[1] = public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin', 'master')
);

-- A fila da recepção precisa emitir atualizações para o painel em tempo real.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'atendimento_pendencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_pendencias;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
