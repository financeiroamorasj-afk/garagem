-- Amplia o registro auditado de atendimento retroativo para hoje e os dois
-- dias anteriores, gravando início e término com status concluído, sem deixar
-- o atendimento em andamento no painel nem bloquear a cadeira do profissional.

DROP FUNCTION IF EXISTS public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,numeric);

CREATE OR REPLACE FUNCTION public.barbeiro_encaixe_retroativo_criar(
  p_cliente_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz DEFAULT NULL,
  p_valor_final numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_profissional public.profissionais%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_servico public.servicos%ROWTYPE;
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_fuso text;
  v_hoje date;
  v_data_inicio date;
  v_id uuid;
  v_inicio timestamptz:=date_trunc('minute',p_inicio);
  v_fim timestamptz;
  v_duracao_real integer;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  SELECT * INTO v_profissional FROM public.profissionais
  WHERE id=public.get_my_profissional_id() AND barbearia_id=v_barbearia AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_inicio IS NULL THEN RAISE EXCEPTION 'AGENDA_RETROATIVO_HORARIO_INVALIDO'; END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id=p_cliente_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;
  SELECT * INTO v_servico FROM public.servicos WHERE id=p_servico_id AND barbearia_id=v_barbearia AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO'; END IF;
  IF p_valor_final IS NOT NULL AND p_valor_final<0 THEN RAISE EXCEPTION 'AGENDA_VALOR_INVALIDO'; END IF;

  SELECT COALESCE(fuso_horario,'America/Sao_Paulo') INTO v_fuso
  FROM public.barbearias WHERE id=v_barbearia;
  v_hoje:=(clock_timestamp() AT TIME ZONE v_fuso)::date;
  v_data_inicio:=(v_inicio AT TIME ZONE v_fuso)::date;
  IF v_data_inicio < v_hoje - 2 OR v_data_inicio > v_hoje OR v_inicio > clock_timestamp() THEN
    RAISE EXCEPTION 'AGENDA_RETROATIVO_FORA_JANELA';
  END IF;

  IF p_fim IS NOT NULL THEN
    v_fim := date_trunc('minute', p_fim);
  ELSE
    v_fim := v_inicio + make_interval(mins => COALESCE(v_servico.duracao_minutos, 30));
  END IF;

  IF v_fim <= v_inicio THEN
    RAISE EXCEPTION 'AGENDA_RETROATIVO_TERMINO_INVALIDO';
  END IF;

  IF v_fim > clock_timestamp() THEN
    RAISE EXCEPTION 'AGENDA_RETROATIVO_TERMINO_FUTURO';
  END IF;

  IF (v_fim AT TIME ZONE v_fuso)::date <> v_data_inicio THEN
    RAISE EXCEPTION 'AGENDA_RETROATIVO_TERMINO_OUTRO_DIA';
  END IF;

  v_duracao_real := GREATEST(1, round(extract(epoch FROM (v_fim - v_inicio))/60.0)::integer);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_profissional.id::text||':agenda',0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional.id
      AND a.status IN ('confirmado','encaixe','em_atendimento','concluido')
      AND a.data_hora < v_fim
      AND COALESCE(a.concluido_em, a.data_fim, a.ocupacao_fim, a.data_hora + interval '15 minutes') > v_inicio
  ) THEN
    RAISE EXCEPTION 'AGENDA_RETROATIVO_CONFLITO_HORARIO';
  END IF;

  INSERT INTO public.agendamentos(
    barbearia_id,profissional_id,cliente_id,servico_id,data_hora,
    duracao_minutos_snapshot,margem_minutos_snapshot,data_fim,ocupacao_fim,
    valor_final,status,origem,iniciado_em,concluido_em,registro_retroativo,
    retroativo_registrado_em,retroativo_registrado_por
  ) VALUES (
    v_barbearia,v_profissional.id,v_cliente.id,v_servico.id,v_inicio,
    v_duracao_real,5,v_fim,v_fim + interval '5 minutes',
    COALESCE(p_valor_final,v_servico.preco),'concluido','interno',v_inicio,v_fim,true,
    clock_timestamp(),auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',v_id,
    'status','concluido',
    'profissional_id',v_profissional.id,
    'cliente_id',v_cliente.id,
    'cliente_nome',v_cliente.nome,
    'cliente_telefone',v_cliente.telefone,
    'servico_id',v_servico.id,
    'servico_nome',v_servico.nome,
    'duracao_minutos',v_servico.duracao_minutos,
    'duracao_real_minutos',v_duracao_real,
    'valor_final',COALESCE(p_valor_final,v_servico.preco),
    'data_hora',v_inicio,
    'iniciado_em',v_inicio,
    'concluido_em',v_fim,
    'registro_retroativo',true,
    'retroativo_registrado_em',clock_timestamp()
  );
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN RAISE EXCEPTION 'AGENDA_RETROATIVO_CONFLITO_HORARIO'; END IF;
  RAISE;
END;
$$;

-- Sobrecarga para compatibilidade com chamadas posicionais legadas de 4 argumentos
CREATE OR REPLACE FUNCTION public.barbeiro_encaixe_retroativo_criar(
  p_cliente_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_valor_final numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
BEGIN
  RETURN public.barbeiro_encaixe_retroativo_criar(p_cliente_id, p_servico_id, p_inicio, NULL::timestamptz, p_valor_final);
END;
$$;

REVOKE ALL ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,timestamptz,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,timestamptz,numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,numeric) TO authenticated;

COMMENT ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,timestamptz,numeric) IS
  'Cria atendimento concluído do próprio profissional com início e fim informados em hoje ou nos dois dias anteriores e trilha de auditoria retroativa.';
