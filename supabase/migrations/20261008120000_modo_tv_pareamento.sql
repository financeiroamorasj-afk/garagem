-- Pareamento de telas sem sessão administrativa no aparelho.
CREATE TABLE public.tv_aparelhos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text,
  token_hash text NOT NULL UNIQUE,
  codigo text,
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','conectado','revogado')),
  codigo_expira_em timestamptz,
  pareado_por uuid REFERENCES auth.users(id),
  video_id text,
  playlist_id text,
  modo_video text NOT NULL DEFAULT 'split' CHECK (modo_video IN ('split','smart')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  CHECK (nome IS NULL OR char_length(nome) BETWEEN 2 AND 60)
);
CREATE UNIQUE INDEX tv_aparelhos_codigo_pendente ON public.tv_aparelhos(codigo) WHERE estado = 'pendente';
CREATE INDEX tv_aparelhos_unidade ON public.tv_aparelhos(barbearia_id, estado);
CREATE INDEX tv_aparelhos_pendentes_expiracao ON public.tv_aparelhos(codigo_expira_em) WHERE estado='pendente';
ALTER TABLE public.tv_aparelhos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_aparelhos FROM PUBLIC, anon, authenticated;

CREATE TABLE public.tv_permissoes (
  usuario_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  controlar_video boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tv_permissoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_permissoes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tv_pareamento_iniciar()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_codigo text;
  v_id uuid;
  v_tentativa integer;
BEGIN
  DELETE FROM public.tv_aparelhos WHERE estado='pendente' AND codigo_expira_em < now();
  IF (SELECT count(*) FROM public.tv_aparelhos WHERE estado='pendente') >= 2000 THEN
    RAISE EXCEPTION 'TV_PAREAMENTO_INDISPONIVEL';
  END IF;
  FOR v_tentativa IN 1..10 LOOP
    v_codigo := upper(encode(extensions.gen_random_bytes(4), 'hex'));
    INSERT INTO public.tv_aparelhos(token_hash,codigo,codigo_expira_em)
    VALUES (encode(extensions.digest(v_token,'sha256'),'hex'),v_codigo,now() + interval '10 minutes')
    ON CONFLICT DO NOTHING RETURNING id INTO v_id;
    EXIT WHEN v_id IS NOT NULL;
  END LOOP;
  IF v_id IS NULL THEN RAISE EXCEPTION 'TV_CODIGO_INDISPONIVEL'; END IF;
  RETURN jsonb_build_object('token',v_token,'codigo',v_codigo,'expira_em',now() + interval '10 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_pareamento_confirmar(p_codigo text, p_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_unidade uuid := public.get_my_barbearia_id();
  v_aparelho public.tv_aparelhos%ROWTYPE;
  v_nome text := btrim(coalesce(p_nome,''));
BEGIN
  IF auth.uid() IS NULL OR v_unidade IS NULL OR coalesce(public.get_my_role(),'') NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO';
  END IF;
  IF char_length(v_nome) NOT BETWEEN 2 AND 60 OR coalesce(p_codigo,'') !~ '^[A-Fa-f0-9]{8}$' THEN
    RAISE EXCEPTION 'TV_PAREAMENTO_INVALIDO';
  END IF;
  SELECT * INTO v_aparelho FROM public.tv_aparelhos
  WHERE codigo = upper(p_codigo) AND estado = 'pendente' FOR UPDATE;
  IF NOT FOUND OR v_aparelho.codigo_expira_em < now() THEN
    RAISE EXCEPTION 'TV_CODIGO_EXPIRADO';
  END IF;
  UPDATE public.tv_aparelhos
  SET barbearia_id=v_unidade, nome=v_nome, estado='conectado', codigo=NULL,
      codigo_expira_em=NULL, pareado_por=auth.uid(), atualizado_em=clock_timestamp()
  WHERE id=v_aparelho.id;
  RETURN jsonb_build_object('id',v_aparelho.id,'nome',v_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_estado_ler(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_aparelho public.tv_aparelhos%ROWTYPE;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_equipe jsonb;
  v_agenda jsonb;
  v_identidade jsonb;
BEGIN
  IF coalesce(p_token,'') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('estado','invalido'); END IF;
  SELECT * INTO v_aparelho FROM public.tv_aparelhos
  WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  IF NOT FOUND THEN RETURN jsonb_build_object('estado','invalido'); END IF;
  IF v_aparelho.estado='pendente' THEN
    IF v_aparelho.codigo_expira_em < now() THEN RETURN jsonb_build_object('estado','expirado'); END IF;
    RETURN jsonb_build_object('estado','pendente','codigo',v_aparelho.codigo,'expira_em',v_aparelho.codigo_expira_em);
  END IF;
  IF v_aparelho.estado <> 'conectado' THEN RETURN jsonb_build_object('estado','revogado'); END IF;

  v_inicio := v_hoje::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (v_hoje + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  SELECT jsonb_build_object('nome',b.nome,'logo_url',b.logo_url) INTO v_identidade
  FROM public.barbearias b WHERE b.id=v_aparelho.barbearia_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'apelido',p.apelido) ORDER BY p.nome),'[]'::jsonb)
    INTO v_equipe FROM public.profissionais p
  WHERE p.barbearia_id=v_aparelho.barbearia_id AND p.ativo;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'profissional_id',a.profissional_id,
    'profissional_nome',p.nome,'profissional_apelido',p.apelido,
    'cliente_nome', CASE
      WHEN position(' ' in btrim(coalesce(c.nome,a.cliente_nome_manual,'Cliente'))) = 0
        THEN btrim(coalesce(c.nome,a.cliente_nome_manual,'Cliente'))
      ELSE split_part(btrim(coalesce(c.nome,a.cliente_nome_manual,'Cliente')),' ',1) || ' ' ||
        left((regexp_split_to_array(btrim(coalesce(c.nome,a.cliente_nome_manual,'Cliente')),'\s+'))[
          array_length(regexp_split_to_array(btrim(coalesce(c.nome,a.cliente_nome_manual,'Cliente')),'\s+'),1)
        ],1) || '.' END,
    'servico_nome',coalesce(s.nome,'Serviço não informado'),
    'duracao_minutos',coalesce(s.duracao_minutos,30),
    'data_hora',a.data_hora,'status',a.status
  ) ORDER BY a.data_hora,p.nome,a.id),'[]'::jsonb) INTO v_agenda
  FROM public.agendamentos a
  JOIN public.profissionais p ON p.id=a.profissional_id AND p.barbearia_id=a.barbearia_id
  LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
  WHERE a.barbearia_id=v_aparelho.barbearia_id AND a.data_hora>=v_inicio AND a.data_hora<v_fim;
  RETURN jsonb_build_object(
    'estado','conectado','aparelho',v_aparelho.nome,'identidade',v_identidade,
    'equipe',v_equipe,'agenda',v_agenda,'data',v_hoje,
    'video_id',v_aparelho.video_id,'playlist_id',v_aparelho.playlist_id,
    'modo_video',v_aparelho.modo_video,'atualizado_em',v_aparelho.atualizado_em
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_aparelhos_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_unidade uuid := public.get_my_barbearia_id();
  v_admin boolean := coalesce(public.get_my_role(),'') IN ('admin','master');
  v_permitido boolean;
  v_resultado jsonb;
BEGIN
  SELECT t.controlar_video INTO v_permitido FROM public.tv_permissoes t
  JOIN public.profiles p ON p.id=t.usuario_id AND p.barbearia_id=t.barbearia_id
    AND p.role='barbeiro' AND coalesce(p.ativo,true)
  WHERE t.usuario_id=auth.uid() AND t.barbearia_id=v_unidade;
  IF auth.uid() IS NULL OR v_unidade IS NULL OR NOT (v_admin OR
    (coalesce(public.get_my_role(),'')='barbeiro' AND coalesce(v_permitido,false))) THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'nome',d.nome,'video_id',d.video_id,'playlist_id',d.playlist_id,
    'modo_video',d.modo_video,'atualizado_em',d.atualizado_em
  ) ORDER BY d.nome),'[]'::jsonb) INTO v_resultado
  FROM public.tv_aparelhos d WHERE d.barbearia_id=v_unidade AND d.estado='conectado';
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_permissoes_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.get_my_role(),'') NOT IN ('admin','master') OR public.get_my_barbearia_id() IS NULL THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'nome',coalesce(p.nome,p.email,'Barbeiro'),
    'permitido',coalesce(t.controlar_video,false)
  ) ORDER BY p.nome),'[]'::jsonb) INTO v_resultado
  FROM public.profiles p LEFT JOIN public.tv_permissoes t ON t.usuario_id=p.id
  WHERE p.barbearia_id=public.get_my_barbearia_id() AND p.role='barbeiro' AND coalesce(p.ativo,true);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_permissao_definir(p_usuario_id uuid, p_permitir boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE v_unidade uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.get_my_role(),'') NOT IN ('admin','master') OR v_unidade IS NULL THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO';
  END IF;
  IF p_permitir IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id=p_usuario_id AND p.barbearia_id=v_unidade AND p.role='barbeiro' AND coalesce(p.ativo,true)) THEN
    RAISE EXCEPTION 'TV_USUARIO_INVALIDO';
  END IF;
  INSERT INTO public.tv_permissoes(usuario_id,barbearia_id,controlar_video)
  VALUES (p_usuario_id,v_unidade,p_permitir)
  ON CONFLICT (usuario_id) DO UPDATE SET controlar_video=EXCLUDED.controlar_video,
    atualizado_em=clock_timestamp() WHERE public.tv_permissoes.barbearia_id=v_unidade;
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_video_definir(
  p_aparelho_id uuid, p_video_id text, p_playlist_id text, p_modo text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_unidade uuid := public.get_my_barbearia_id();
  v_permitido boolean;
BEGIN
  SELECT t.controlar_video INTO v_permitido FROM public.tv_permissoes t
  JOIN public.profiles p ON p.id=t.usuario_id AND p.barbearia_id=t.barbearia_id
    AND p.role='barbeiro' AND coalesce(p.ativo,true)
  WHERE t.usuario_id=auth.uid() AND t.barbearia_id=v_unidade;
  IF auth.uid() IS NULL OR v_unidade IS NULL OR NOT (
    coalesce(public.get_my_role(),'') IN ('admin','master') OR
    (coalesce(public.get_my_role(),'')='barbeiro' AND coalesce(v_permitido,false))
  ) THEN RAISE EXCEPTION 'TV_SEM_PERMISSAO'; END IF;
  IF p_modo NOT IN ('split','smart') OR
    (p_video_id IS NOT NULL AND p_video_id !~ '^[A-Za-z0-9_-]{6,80}$') OR
    (p_playlist_id IS NOT NULL AND p_playlist_id !~ '^[A-Za-z0-9_-]{6,80}$') THEN
    RAISE EXCEPTION 'TV_VIDEO_INVALIDO';
  END IF;
  UPDATE public.tv_aparelhos SET video_id=p_video_id,playlist_id=p_playlist_id,
    modo_video=p_modo,atualizado_em=clock_timestamp()
  WHERE id=p_aparelho_id AND barbearia_id=v_unidade AND estado='conectado';
  IF NOT FOUND THEN RAISE EXCEPTION 'TV_APARELHO_NAO_ENCONTRADO'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tv_aparelho_revogar(p_aparelho_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.get_my_role(),'') NOT IN ('admin','master') OR public.get_my_barbearia_id() IS NULL THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO';
  END IF;
  UPDATE public.tv_aparelhos SET estado='revogado',revogado_em=clock_timestamp(),atualizado_em=clock_timestamp()
  WHERE id=p_aparelho_id AND barbearia_id=public.get_my_barbearia_id() AND estado='conectado';
  IF NOT FOUND THEN RAISE EXCEPTION 'TV_APARELHO_NAO_ENCONTRADO'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.tv_pareamento_iniciar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_pareamento_confirmar(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_estado_ler(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_aparelhos_listar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_permissoes_listar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_permissao_definir(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_video_definir(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_aparelho_revogar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_pareamento_iniciar(),public.tv_estado_ler(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_pareamento_confirmar(text,text),public.tv_aparelhos_listar(),
  public.tv_permissoes_listar(),public.tv_permissao_definir(uuid,boolean),
  public.tv_video_definir(uuid,text,text,text),public.tv_aparelho_revogar(uuid) TO authenticated;
