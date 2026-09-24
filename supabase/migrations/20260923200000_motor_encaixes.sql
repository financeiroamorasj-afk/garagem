-- Motor de horários livres e criação atômica de encaixes.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS duracao_minutos_snapshot integer,
  ADD COLUMN IF NOT EXISTS data_fim timestamptz;

UPDATE public.agendamentos a
SET duracao_minutos_snapshot=COALESCE(s.duracao_minutos,30),
    data_fim=a.data_hora+make_interval(mins=>COALESCE(s.duracao_minutos,30))
FROM public.servicos s
WHERE s.id=a.servico_id AND (a.duracao_minutos_snapshot IS NULL OR a.data_fim IS NULL);

UPDATE public.agendamentos
SET duracao_minutos_snapshot=COALESCE(duracao_minutos_snapshot,30),
    data_fim=COALESCE(data_fim,data_hora+make_interval(mins=>COALESCE(duracao_minutos_snapshot,30)))
WHERE duracao_minutos_snapshot IS NULL OR data_fim IS NULL;

ALTER TABLE public.agendamentos
  ALTER COLUMN duracao_minutos_snapshot SET DEFAULT 30,
  ALTER COLUMN duracao_minutos_snapshot SET NOT NULL,
  ALTER COLUMN data_fim SET NOT NULL;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_duracao_snapshot_check CHECK (duracao_minutos_snapshot BETWEEN 5 AND 480),
  ADD CONSTRAINT agendamentos_data_fim_check CHECK (data_fim>data_hora);

CREATE INDEX agendamentos_ocupacao_idx
  ON public.agendamentos (profissional_id,data_hora,data_fim)
  WHERE status IN ('pendente','confirmado','encaixe','em_atendimento');

CREATE OR REPLACE FUNCTION public.agendamentos_preparar_e_proteger_horario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS agendamentos_preparar_e_proteger_horario_trg ON public.agendamentos;
CREATE TRIGGER agendamentos_preparar_e_proteger_horario_trg
BEFORE INSERT OR UPDATE OF profissional_id,servico_id,data_hora,status,duracao_minutos_snapshot
ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.agendamentos_preparar_e_proteger_horario();

CREATE OR REPLACE FUNCTION public.agenda_assert_operador()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.agenda_encaixe_catalogo()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.agenda_cliente_criar_rapido(p_nome text,p_telefone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.agenda_assert_operador(); v_id uuid;
BEGIN
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;
  IF p_telefone IS NOT NULL AND length(btrim(p_telefone)) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'AGENDA_TELEFONE_INVALIDO'; END IF;
  INSERT INTO public.clientes(barbearia_id,nome,telefone)
  VALUES(v_barbearia,btrim(p_nome),NULLIF(btrim(p_telefone),'')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'nome',btrim(p_nome),'telefone',NULLIF(btrim(p_telefone),''));
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_horarios_livres(
  p_servico_id uuid,
  p_data_inicial date,
  p_profissional_id uuid DEFAULT NULL,
  p_dias integer DEFAULT 14,
  p_limite integer DEFAULT 12
)
RETURNS TABLE (
  profissional_id uuid,profissional_nome text,profissional_apelido text,
  inicio timestamptz,fim timestamptz,duracao_minutos integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.agenda_encaixe_criar(
  p_cliente_id uuid,p_servico_id uuid,p_profissional_id uuid,p_inicio timestamptz,p_valor_final numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.agendamentos_preparar_e_proteger_horario() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agenda_assert_operador() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agenda_encaixe_catalogo() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agenda_cliente_criar_rapido(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agenda_encaixe_criar(uuid,uuid,uuid,timestamptz,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agenda_encaixe_catalogo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_cliente_criar_rapido(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_horarios_livres(uuid,date,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_encaixe_criar(uuid,uuid,uuid,timestamptz,numeric) TO authenticated;
