-- Define quem administra a disponibilidade e libera autosserviço seguro ao profissional.

ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS tipo_vinculo text NOT NULL DEFAULT 'clt',
  ADD COLUMN IF NOT EXISTS responsavel_disponibilidade text NOT NULL DEFAULT 'gestao';

ALTER TABLE public.profissionais
  DROP CONSTRAINT IF EXISTS profissionais_tipo_vinculo_check,
  ADD CONSTRAINT profissionais_tipo_vinculo_check
    CHECK (tipo_vinculo IN ('clt','freelancer','pj','parceiro','outro')),
  DROP CONSTRAINT IF EXISTS profissionais_responsavel_disponibilidade_check,
  ADD CONSTRAINT profissionais_responsavel_disponibilidade_check
    CHECK (responsavel_disponibilidade IN ('gestao','profissional'));

CREATE TABLE IF NOT EXISTS public.profissionais_disponibilidade_auditoria (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  profissional_id uuid NOT NULL,
  entidade text NOT NULL CHECK (entidade IN ('vinculo','jornada','bloqueio')),
  acao text NOT NULL CHECK (acao IN ('inserido','atualizado','excluido')),
  estado_anterior jsonb,
  estado_novo jsonb,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profissionais_disponibilidade_auditoria_profissional_fkey
    FOREIGN KEY (barbearia_id, profissional_id)
    REFERENCES public.profissionais(barbearia_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS profissionais_disponibilidade_auditoria_idx
  ON public.profissionais_disponibilidade_auditoria(barbearia_id, profissional_id, alterado_em DESC);

ALTER TABLE public.profissionais_disponibilidade_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profissionais_disponibilidade_auditoria FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.disponibilidade_auditar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_entidade text:=TG_ARGV[0];
  v_barbearia uuid;
  v_profissional uuid;
BEGIN
  IF v_entidade='vinculo' THEN
    v_barbearia:=COALESCE(NEW.barbearia_id,OLD.barbearia_id);
    v_profissional:=COALESCE(NEW.id,OLD.id);
  ELSE
    v_barbearia:=COALESCE(NEW.barbearia_id,OLD.barbearia_id);
    v_profissional:=COALESCE(NEW.profissional_id,OLD.profissional_id);
  END IF;
  IF v_entidade='vinculo' THEN
    IF TG_OP='UPDATE'
       AND NEW.tipo_vinculo IS NOT DISTINCT FROM OLD.tipo_vinculo
       AND NEW.responsavel_disponibilidade IS NOT DISTINCT FROM OLD.responsavel_disponibilidade THEN
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO public.profissionais_disponibilidade_auditoria(
    barbearia_id,profissional_id,entidade,acao,estado_anterior,estado_novo,alterado_por
  ) VALUES (
    v_barbearia,v_profissional,v_entidade,
    CASE TG_OP WHEN 'INSERT' THEN 'inserido' WHEN 'UPDATE' THEN 'atualizado' ELSE 'excluido' END,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN COALESCE(NEW,OLD);
END;
$$;

DROP TRIGGER IF EXISTS profissionais_vinculo_auditoria_trg ON public.profissionais;
CREATE TRIGGER profissionais_vinculo_auditoria_trg
AFTER UPDATE OF tipo_vinculo,responsavel_disponibilidade ON public.profissionais
FOR EACH ROW EXECUTE FUNCTION public.disponibilidade_auditar('vinculo');

DROP TRIGGER IF EXISTS profissionais_jornadas_auditoria_trg ON public.profissionais_jornadas;
CREATE TRIGGER profissionais_jornadas_auditoria_trg
AFTER INSERT OR UPDATE OR DELETE ON public.profissionais_jornadas
FOR EACH ROW EXECUTE FUNCTION public.disponibilidade_auditar('jornada');

DROP TRIGGER IF EXISTS profissionais_bloqueios_auditoria_trg ON public.profissionais_bloqueios;
CREATE TRIGGER profissionais_bloqueios_auditoria_trg
AFTER INSERT OR UPDATE OR DELETE ON public.profissionais_bloqueios
FOR EACH ROW EXECUTE FUNCTION public.disponibilidade_auditar('bloqueio');

DROP FUNCTION IF EXISTS public.barbeiros_listar(boolean);
CREATE FUNCTION public.barbeiros_listar(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (
  id uuid,nome text,apelido text,telefone text,especialidade text,foto_url text,
  comissao_percentual numeric,comissao_produtos_percentual numeric,
  tipo_vinculo text,responsavel_disponibilidade text,
  ativo boolean,user_id uuid,email text,criado_em timestamptz,updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin','master') OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO';
  END IF;
  RETURN QUERY SELECT p.id,p.nome,p.apelido,p.telefone,p.especialidade,p.foto_url,
    p.comissao_percentual,p.comissao_produtos_percentual,p.tipo_vinculo,p.responsavel_disponibilidade,
    p.ativo,p.user_id,pr.email,p.criado_em,p.updated_at
  FROM public.profissionais p
  LEFT JOIN public.profiles pr ON pr.id=p.user_id AND pr.barbearia_id=p.barbearia_id
  WHERE p.barbearia_id=v_barbearia AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC,COALESCE(NULLIF(btrim(p.apelido),''),p.nome),p.nome;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiros_atualizar(
  p_profissional_id uuid,p_nome text,p_apelido text,p_telefone text,p_especialidade text,
  p_comissao_percentual numeric,p_comissao_produtos_percentual numeric,
  p_tipo_vinculo text,p_responsavel_disponibilidade text,
  p_ativo boolean,p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_antes public.profissionais%ROWTYPE; v_depois public.profissionais%ROWTYPE;
  v_nome text:=btrim(p_nome); v_apelido text:=NULLIF(btrim(p_apelido),'');
  v_telefone text:=NULLIF(btrim(p_telefone),''); v_especialidade text:=NULLIF(btrim(p_especialidade),'');
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin','master') OR v_barbearia IS NULL THEN RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO'; END IF;
  IF p_profissional_id IS NULL OR p_expected_updated_at IS NULL OR p_ativo IS NULL THEN RAISE EXCEPTION 'BARBEIROS_DADOS_INVALIDOS'; END IF;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'BARBEIROS_NOME_INVALIDO'; END IF;
  IF v_apelido IS NOT NULL AND length(v_apelido) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'BARBEIROS_APELIDO_INVALIDO'; END IF;
  IF v_telefone IS NOT NULL AND length(v_telefone) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'BARBEIROS_TELEFONE_INVALIDO'; END IF;
  IF v_especialidade IS NOT NULL AND length(v_especialidade)>100 THEN RAISE EXCEPTION 'BARBEIROS_ESPECIALIDADE_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'BARBEIROS_COMISSAO_INVALIDA'; END IF;
  IF p_comissao_produtos_percentual IS NOT NULL AND p_comissao_produtos_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'BARBEIROS_COMISSAO_PRODUTOS_INVALIDA'; END IF;
  IF p_tipo_vinculo NOT IN ('clt','freelancer','pj','parceiro','outro')
     OR p_responsavel_disponibilidade NOT IN ('gestao','profissional') THEN RAISE EXCEPTION 'BARBEIROS_VINCULO_INVALIDO'; END IF;
  SELECT * INTO v_antes FROM public.profissionais
  WHERE id=p_profissional_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARBEIROS_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'BARBEIROS_CONFLITO_VERSAO'; END IF;
  UPDATE public.profissionais SET nome=v_nome,apelido=v_apelido,telefone=v_telefone,especialidade=v_especialidade,
    comissao_percentual=p_comissao_percentual,comissao_produtos_percentual=p_comissao_produtos_percentual,
    tipo_vinculo=p_tipo_vinculo,responsavel_disponibilidade=p_responsavel_disponibilidade,
    ativo=p_ativo,updated_at=clock_timestamp()
  WHERE id=v_antes.id RETURNING * INTO v_depois;
  RETURN jsonb_build_object('id',v_depois.id,'ativo',v_depois.ativo,'tipo_vinculo',v_depois.tipo_vinculo,
    'responsavel_disponibilidade',v_depois.responsavel_disponibilidade,'updated_at',v_depois.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_disponibilidade_contexto()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.get_my_profissional_id();
  v_role text:=public.get_my_role(); v_row public.profissionais%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_profissional IS NULL
     OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_AUTOSSERVICO_NAO_AUTORIZADO';
  END IF;
  SELECT * INTO v_row FROM public.profissionais
  WHERE id=v_profissional AND barbearia_id=v_barbearia AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  RETURN jsonb_build_object(
    'profissional_id',v_row.id,'nome',v_row.nome,'apelido',v_row.apelido,
    'tipo_vinculo',v_row.tipo_vinculo,'responsavel_disponibilidade',v_row.responsavel_disponibilidade,
    'pode_editar',v_role IN ('admin','master') OR v_row.responsavel_disponibilidade='profissional'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_disponibilidade_assert_editavel()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_contexto jsonb:=public.barbeiro_disponibilidade_contexto();
BEGIN
  IF NOT COALESCE((v_contexto->>'pode_editar')::boolean,false) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_GESTAO_RESPONSAVEL';
  END IF;
  RETURN (v_contexto->>'profissional_id')::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_jornadas_listar()
RETURNS TABLE (
  dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,
  intervalo_inicio time,intervalo_fim time,updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_profissional uuid:=(public.barbeiro_disponibilidade_contexto()->>'profissional_id')::uuid;
BEGIN
  RETURN QUERY SELECT j.dia_semana,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,j.updated_at
  FROM public.profissionais_jornadas j WHERE j.profissional_id=v_profissional ORDER BY j.dia_semana;
END;
$$;

CREATE OR REPLACE FUNCTION public.disponibilidade_jornada_conflitos(
  p_barbearia uuid,p_profissional uuid,p_dias jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_fuso text; v_result jsonb;
BEGIN
  SELECT COALESCE(fuso_horario,'America/Sao_Paulo') INTO v_fuso FROM public.barbearias WHERE id=p_barbearia;
  SELECT jsonb_build_object(
    'quantidade',count(*),
    'agendamentos',COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'inicio',a.data_hora,'cliente',COALESCE(c.nome,'Cliente')) ORDER BY a.data_hora),'[]'::jsonb)
  ) INTO v_result
  FROM public.agendamentos a
  LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  LEFT JOIN LATERAL (
    SELECT x.* FROM jsonb_to_recordset(p_dias) x(
      dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time
    ) WHERE x.dia_semana=extract(dow FROM a.data_hora AT TIME ZONE v_fuso)::smallint
  ) x ON true
  WHERE a.barbearia_id=p_barbearia AND a.profissional_id=p_profissional
    AND a.status IN ('pendente','confirmado','encaixe','em_atendimento') AND a.data_hora>=now()
    AND NOT (
      (COALESCE(x.ativo,false)
        AND a.data_hora>=(((a.data_hora AT TIME ZONE v_fuso)::date+x.hora_inicio) AT TIME ZONE v_fuso)
        AND a.data_fim<=(((a.data_hora AT TIME ZONE v_fuso)::date+x.hora_fim) AT TIME ZONE v_fuso)
        AND (x.intervalo_inicio IS NULL
          OR a.data_fim<=(((a.data_hora AT TIME ZONE v_fuso)::date+x.intervalo_inicio) AT TIME ZONE v_fuso)
          OR a.data_hora>=(((a.data_hora AT TIME ZONE v_fuso)::date+x.intervalo_fim) AT TIME ZONE v_fuso)))
      OR EXISTS (
        SELECT 1 FROM public.agenda_horarios_extras h
        WHERE h.barbearia_id=p_barbearia AND (h.profissional_id IS NULL OR h.profissional_id=p_profissional)
          AND h.data=(a.data_hora AT TIME ZONE v_fuso)::date
          AND a.data_hora>=((h.data+h.hora_inicio) AT TIME ZONE v_fuso)
          AND a.data_fim<=((h.data+h.hora_fim) AT TIME ZONE v_fuso)
      )
    );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_jornada_analisar(p_dias jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_contexto jsonb:=public.barbeiro_disponibilidade_contexto();
BEGIN
  RETURN public.disponibilidade_jornada_conflitos(public.get_my_barbearia_id(),(v_contexto->>'profissional_id')::uuid,p_dias);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_jornadas_salvar(p_dias jsonb,p_confirmar_conflitos boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.barbeiro_disponibilidade_assert_editavel();
  v_count integer; v_conflitos jsonb;
BEGIN
  IF p_dias IS NULL OR jsonb_typeof(p_dias)<>'array' OR jsonb_array_length(p_dias)<>7 THEN RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA'; END IF;
  SELECT count(DISTINCT x.dia_semana) INTO v_count FROM jsonb_to_recordset(p_dias) x(dia_semana smallint) WHERE x.dia_semana BETWEEN 0 AND 6;
  IF v_count<>7 OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
    WHERE x.ativo IS NULL OR (x.ativo AND (x.hora_inicio IS NULL OR x.hora_fim IS NULL OR x.hora_fim<=x.hora_inicio))
      OR (x.ativo AND ((x.intervalo_inicio IS NULL)<>(x.intervalo_fim IS NULL)))
      OR (x.ativo AND x.intervalo_inicio IS NOT NULL AND (x.intervalo_fim<=x.intervalo_inicio OR x.intervalo_inicio<=x.hora_inicio OR x.intervalo_fim>=x.hora_fim))
  ) THEN RAISE EXCEPTION 'DISPONIBILIDADE_JORNADA_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_profissional::text||':agenda',0));
  v_conflitos:=public.disponibilidade_jornada_conflitos(v_barbearia,v_profissional,p_dias);
  IF COALESCE((v_conflitos->>'quantidade')::integer,0)>0 AND NOT COALESCE(p_confirmar_conflitos,false) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_CONFLITOS_CONFIRMAR:%',v_conflitos->>'quantidade';
  END IF;
  INSERT INTO public.profissionais_jornadas(barbearia_id,profissional_id,dia_semana,ativo,hora_inicio,hora_fim,intervalo_inicio,intervalo_fim,updated_at)
  SELECT v_barbearia,v_profissional,x.dia_semana,x.ativo,
    CASE WHEN x.ativo THEN x.hora_inicio END,CASE WHEN x.ativo THEN x.hora_fim END,
    CASE WHEN x.ativo THEN x.intervalo_inicio END,CASE WHEN x.ativo THEN x.intervalo_fim END,clock_timestamp()
  FROM jsonb_to_recordset(p_dias) x(dia_semana smallint,ativo boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time)
  ON CONFLICT(profissional_id,dia_semana) DO UPDATE SET ativo=excluded.ativo,hora_inicio=excluded.hora_inicio,
    hora_fim=excluded.hora_fim,intervalo_inicio=excluded.intervalo_inicio,intervalo_fim=excluded.intervalo_fim,updated_at=excluded.updated_at;
  RETURN jsonb_build_object('profissional_id',v_profissional,'dias',7,'conflitos',v_conflitos);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_bloqueios_listar(p_data_inicial date,p_data_final date)
RETURNS TABLE (id uuid,inicio timestamptz,fim timestamptz,motivo text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=(public.barbeiro_disponibilidade_contexto()->>'profissional_id')::uuid; v_fuso text;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>366 THEN RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO'; END IF;
  SELECT COALESCE(fuso_horario,'America/Sao_Paulo') INTO v_fuso FROM public.barbearias WHERE id=v_barbearia;
  RETURN QUERY SELECT b.id,b.inicio,b.fim,b.motivo,b.created_at FROM public.profissionais_bloqueios b
  WHERE b.barbearia_id=v_barbearia AND b.profissional_id=v_profissional
    AND b.inicio<(p_data_final+1)::timestamp AT TIME ZONE v_fuso AND b.fim>p_data_inicial::timestamp AT TIME ZONE v_fuso
  ORDER BY b.inicio,b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_bloqueio_analisar(p_inicio timestamptz,p_fim timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=(public.barbeiro_disponibilidade_contexto()->>'profissional_id')::uuid; v_result jsonb;
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<=p_inicio THEN RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_INVALIDO'; END IF;
  SELECT jsonb_build_object('quantidade',count(*),'agendamentos',COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'inicio',a.data_hora,'cliente',COALESCE(c.nome,'Cliente')) ORDER BY a.data_hora),'[]'::jsonb))
  INTO v_result FROM public.agendamentos a LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
    AND a.data_hora<p_fim AND a.data_fim>p_inicio;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_bloqueio_criar(
  p_inicio timestamptz,p_fim timestamptz,p_motivo text DEFAULT NULL,p_confirmar_conflitos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.barbeiro_disponibilidade_assert_editavel(); v_id uuid; v_conflitos jsonb;
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<=p_inicio OR p_fim-p_inicio>interval '31 days' THEN RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_INVALIDO'; END IF;
  IF p_motivo IS NOT NULL AND length(btrim(p_motivo))>200 THEN RAISE EXCEPTION 'DISPONIBILIDADE_MOTIVO_INVALIDO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_profissional::text||':agenda',0));
  v_conflitos:=public.barbeiro_bloqueio_analisar(p_inicio,p_fim);
  IF COALESCE((v_conflitos->>'quantidade')::integer,0)>0 AND NOT COALESCE(p_confirmar_conflitos,false) THEN
    RAISE EXCEPTION 'DISPONIBILIDADE_CONFLITOS_CONFIRMAR:%',v_conflitos->>'quantidade';
  END IF;
  INSERT INTO public.profissionais_bloqueios(barbearia_id,profissional_id,inicio,fim,motivo,criado_por)
  VALUES(v_barbearia,v_profissional,p_inicio,p_fim,NULLIF(btrim(p_motivo),''),auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'conflitos',v_conflitos);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_bloqueio_excluir(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.barbeiro_disponibilidade_assert_editavel();
BEGIN
  DELETE FROM public.profissionais_bloqueios WHERE id=p_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPONIBILIDADE_BLOQUEIO_NAO_ENCONTRADO'; END IF;
  RETURN jsonb_build_object('id',p_id,'excluido',true);
END;
$$;

REVOKE ALL ON FUNCTION public.disponibilidade_auditar() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.disponibilidade_jornada_conflitos(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.barbeiro_disponibilidade_assert_editavel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.barbeiros_listar(boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,numeric,text,text,boolean,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_disponibilidade_contexto() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_jornadas_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_jornada_analisar(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_jornadas_salvar(jsonb,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_bloqueios_listar(date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_bloqueio_analisar(timestamptz,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_bloqueio_criar(timestamptz,timestamptz,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_bloqueio_excluir(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.barbeiros_listar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,numeric,text,text,boolean,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_disponibilidade_contexto() TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_jornadas_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_jornada_analisar(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_jornadas_salvar(jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_bloqueios_listar(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_bloqueio_analisar(timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_bloqueio_criar(timestamptz,timestamptz,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_bloqueio_excluir(uuid) TO authenticated;
