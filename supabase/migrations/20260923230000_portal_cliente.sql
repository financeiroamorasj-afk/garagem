-- Portal público do cliente: acesso por CPF protegido, sessão temporária,
-- catálogo, histórico e agendamento usando a disponibilidade real da equipe.

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS portal_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pagamento_online_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagamento_provedor text;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS pagamento_status text NOT NULL DEFAULT 'nao_solicitado',
  ADD COLUMN IF NOT EXISTS pagamento_provedor text,
  ADD COLUMN IF NOT EXISTS pagamento_referencia text;

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_origem_check,
  ADD CONSTRAINT agendamentos_origem_check
    CHECK (origem IN ('interno','portal_cliente')),
  DROP CONSTRAINT IF EXISTS agendamentos_pagamento_status_check,
  ADD CONSTRAINT agendamentos_pagamento_status_check
    CHECK (pagamento_status IN ('nao_solicitado','pendente','pago','falhou','estornado'));

CREATE TABLE IF NOT EXISTS public.portal_sessoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  revogada_em timestamptz,
  criada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_sessoes_expiracao_check CHECK (expira_em > criada_em)
);

CREATE INDEX IF NOT EXISTS portal_sessoes_cliente_idx
  ON public.portal_sessoes(barbearia_id,cliente_id,expira_em DESC);

ALTER TABLE public.portal_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_sessoes FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.portal_token_hash(p_token text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(COALESCE(p_token,''),'UTF8'),'sha256'),'hex')
$$;

CREATE OR REPLACE FUNCTION public.portal_sessao_criar(p_barbearia_id uuid,p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_sessao_validar(p_token text)
RETURNS public.portal_sessoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_barbearia_publica(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_acessar(p_slug text,p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_cadastrar(
  p_slug text,p_cpf text,p_nome text,p_telefone text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_dados(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_horarios_livres(
  p_token text,p_servico_id uuid,p_data_inicial date,
  p_profissional_id uuid DEFAULT NULL,p_dias integer DEFAULT 14,p_limite integer DEFAULT 60
)
RETURNS TABLE (
  profissional_id uuid,profissional_nome text,profissional_apelido text,
  inicio timestamptz,fim timestamptz,duracao_minutos integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_agendamento_criar(
  p_token text,p_servico_id uuid,p_profissional_id uuid,p_inicio timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_agendamento_cancelar(p_token text,p_agendamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_sessao public.portal_sessoes%ROWTYPE;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  UPDATE public.agendamentos SET status='cancelado'
  WHERE id=p_agendamento_id AND barbearia_id=v_sessao.barbearia_id AND cliente_id=v_sessao.cliente_id
    AND status IN ('pendente','confirmado') AND data_hora>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_AGENDAMENTO_NAO_CANCELAVEL'; END IF;
  RETURN jsonb_build_object('id',p_agendamento_id,'status','cancelado');
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_perfil_atualizar(
  p_token text,p_nome text,p_telefone text,p_barbeiro_favorito_id uuid,p_notas_preferencias text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.portal_encerrar(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
BEGIN
  UPDATE public.portal_sessoes SET revogada_em=now()
  WHERE token_hash=public.portal_token_hash(p_token) AND revogada_em IS NULL;
  RETURN jsonb_build_object('encerrada',true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_token_hash(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.portal_sessao_criar(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.portal_sessao_validar(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.portal_barbearia_publica(text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_acessar(text,text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_cadastrar(text,text,text,text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_dados(text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_agendamento_criar(text,uuid,uuid,timestamptz) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_agendamento_cancelar(text,uuid) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_perfil_atualizar(text,text,text,uuid,text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_encerrar(text) FROM PUBLIC,authenticated;

GRANT EXECUTE ON FUNCTION public.portal_barbearia_publica(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_acessar(text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_cadastrar(text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_dados(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_horarios_livres(text,uuid,date,uuid,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_agendamento_criar(text,uuid,uuid,timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_agendamento_cancelar(text,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_perfil_atualizar(text,text,text,uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_encerrar(text) TO anon;
