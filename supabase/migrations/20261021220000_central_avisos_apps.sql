-- Central de atualizações dos aplicativos do gestor e do barbeiro.
-- A leitura é individual e um comunicado pode ter um destino diferente em cada app.

CREATE TABLE IF NOT EXISTS public.app_comunicados (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  chave text NOT NULL UNIQUE,
  barbearia_id uuid REFERENCES public.barbearias(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  resumo text NOT NULL,
  publico text NOT NULL,
  prioridade text NOT NULL DEFAULT 'informativo',
  rotulo_acao text NOT NULL DEFAULT 'Ver atualização',
  rota_gestao text,
  rota_barbeiro text,
  publicado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_comunicados_chave_check CHECK (chave ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  CONSTRAINT app_comunicados_titulo_check CHECK (length(btrim(titulo)) BETWEEN 3 AND 120),
  CONSTRAINT app_comunicados_resumo_check CHECK (length(btrim(resumo)) BETWEEN 10 AND 500),
  CONSTRAINT app_comunicados_publico_check CHECK (publico IN ('gestao','barbeiros','ambos')),
  CONSTRAINT app_comunicados_prioridade_check CHECK (prioridade IN ('informativo','importante','urgente')),
  CONSTRAINT app_comunicados_rotulo_check CHECK (length(btrim(rotulo_acao)) BETWEEN 2 AND 40),
  CONSTRAINT app_comunicados_rota_gestao_check CHECK (rota_gestao IS NULL OR rota_gestao ~ '^/admin(/[a-z0-9_-]+)*$'),
  CONSTRAINT app_comunicados_rota_barbeiro_check CHECK (rota_barbeiro IS NULL OR rota_barbeiro ~ '^/barber(/[a-z0-9_-]+)*$'),
  CONSTRAINT app_comunicados_destinos_check CHECK (
    (publico='gestao' AND rota_gestao IS NOT NULL)
    OR (publico='barbeiros' AND rota_barbeiro IS NOT NULL)
    OR (publico='ambos' AND rota_gestao IS NOT NULL AND rota_barbeiro IS NOT NULL)
  ),
  CONSTRAINT app_comunicados_expiracao_check CHECK (expira_em IS NULL OR expira_em>publicado_em)
);

CREATE INDEX IF NOT EXISTS app_comunicados_publicacao_idx
  ON public.app_comunicados (publicado_em DESC)
  WHERE ativo;
CREATE INDEX IF NOT EXISTS app_comunicados_tenant_idx
  ON public.app_comunicados (barbearia_id,publicado_em DESC)
  WHERE ativo;

CREATE TABLE IF NOT EXISTS public.app_comunicados_leituras (
  comunicado_id uuid NOT NULL REFERENCES public.app_comunicados(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comunicado_id,usuario_id)
);

CREATE INDEX IF NOT EXISTS app_comunicados_leituras_usuario_idx
  ON public.app_comunicados_leituras (usuario_id,lido_em DESC);

ALTER TABLE public.app_comunicados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_comunicados_leituras ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_comunicados FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.app_comunicados_leituras FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.app_comunicados TO service_role;
GRANT ALL ON TABLE public.app_comunicados_leituras TO service_role;

CREATE OR REPLACE FUNCTION public.app_comunicados_contexto_validar(p_contexto text)
RETURNS TABLE (usuario_id uuid,barbearia_id uuid,perfil text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_usuario uuid:=auth.uid();
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_perfil text:=public.get_my_role();
BEGIN
  IF v_usuario IS NULL OR v_barbearia IS NULL OR p_contexto NOT IN ('gestao','barbeiro') THEN
    RAISE EXCEPTION 'APP_COMUNICADOS_NAO_AUTORIZADO';
  END IF;
  IF p_contexto='gestao' AND v_perfil NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'APP_COMUNICADOS_NAO_AUTORIZADO';
  END IF;
  IF p_contexto='barbeiro' AND public.get_my_profissional_id() IS NULL THEN
    RAISE EXCEPTION 'APP_COMUNICADOS_NAO_AUTORIZADO';
  END IF;
  RETURN QUERY SELECT v_usuario,v_barbearia,v_perfil;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_comunicados_listar(
  p_contexto text,
  p_limite integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  titulo text,
  resumo text,
  prioridade text,
  publicado_em timestamptz,
  rotulo_acao text,
  destino text,
  lido boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_contexto record;
BEGIN
  SELECT * INTO v_contexto FROM public.app_comunicados_contexto_validar(p_contexto);
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'APP_COMUNICADOS_FILTRO_INVALIDO';
  END IF;

  RETURN QUERY
  SELECT c.id,c.titulo,c.resumo,c.prioridade,c.publicado_em,c.rotulo_acao,
    CASE WHEN p_contexto='gestao' THEN c.rota_gestao ELSE c.rota_barbeiro END AS destino,
    (l.usuario_id IS NOT NULL) AS lido
  FROM public.app_comunicados c
  LEFT JOIN public.app_comunicados_leituras l
    ON l.comunicado_id=c.id AND l.usuario_id=v_contexto.usuario_id
  WHERE c.ativo
    AND c.publicado_em<=clock_timestamp()
    AND (c.expira_em IS NULL OR c.expira_em>clock_timestamp())
    AND (c.barbearia_id IS NULL OR c.barbearia_id=v_contexto.barbearia_id)
    AND (
      (p_contexto='gestao' AND c.publico IN ('gestao','ambos'))
      OR (p_contexto='barbeiro' AND c.publico IN ('barbeiros','ambos'))
    )
  ORDER BY (l.usuario_id IS NULL) DESC,
    CASE c.prioridade WHEN 'urgente' THEN 1 WHEN 'importante' THEN 2 ELSE 3 END,
    c.publicado_em DESC,c.id
  LIMIT p_limite;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_comunicado_marcar_lido(
  p_comunicado_id uuid,
  p_contexto text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_contexto record;
BEGIN
  SELECT * INTO v_contexto FROM public.app_comunicados_contexto_validar(p_contexto);
  IF p_comunicado_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_comunicados c
    WHERE c.id=p_comunicado_id
      AND c.ativo
      AND c.publicado_em<=clock_timestamp()
      AND (c.expira_em IS NULL OR c.expira_em>clock_timestamp())
      AND (c.barbearia_id IS NULL OR c.barbearia_id=v_contexto.barbearia_id)
      AND (
        (p_contexto='gestao' AND c.publico IN ('gestao','ambos'))
        OR (p_contexto='barbeiro' AND c.publico IN ('barbeiros','ambos'))
      )
  ) THEN
    RAISE EXCEPTION 'APP_COMUNICADO_NAO_ENCONTRADO';
  END IF;

  INSERT INTO public.app_comunicados_leituras(comunicado_id,usuario_id,lido_em)
  VALUES(p_comunicado_id,v_contexto.usuario_id,clock_timestamp())
  ON CONFLICT(comunicado_id,usuario_id) DO UPDATE SET lido_em=EXCLUDED.lido_em;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_comunicados_marcar_todos_lidos(p_contexto text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_contexto record;
  v_total integer;
BEGIN
  SELECT * INTO v_contexto FROM public.app_comunicados_contexto_validar(p_contexto);
  WITH inseridos AS (
    INSERT INTO public.app_comunicados_leituras(comunicado_id,usuario_id,lido_em)
    SELECT c.id,v_contexto.usuario_id,clock_timestamp()
    FROM public.app_comunicados c
    WHERE c.ativo
      AND c.publicado_em<=clock_timestamp()
      AND (c.expira_em IS NULL OR c.expira_em>clock_timestamp())
      AND (c.barbearia_id IS NULL OR c.barbearia_id=v_contexto.barbearia_id)
      AND (
        (p_contexto='gestao' AND c.publico IN ('gestao','ambos'))
        OR (p_contexto='barbeiro' AND c.publico IN ('barbeiros','ambos'))
      )
    ON CONFLICT(comunicado_id,usuario_id) DO UPDATE SET lido_em=EXCLUDED.lido_em
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_total FROM inseridos;
  RETURN v_total;
END;
$$;

COMMENT ON TABLE public.app_comunicados IS
  'Atualizações e avisos segmentados por aplicativo, globais ou específicos de uma barbearia.';
COMMENT ON TABLE public.app_comunicados_leituras IS
  'Controle individual de leitura dos comunicados exibidos no sino dos aplicativos.';

REVOKE ALL ON FUNCTION public.app_comunicados_contexto_validar(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.app_comunicados_listar(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.app_comunicado_marcar_lido(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.app_comunicados_marcar_todos_lidos(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.app_comunicados_listar(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_comunicado_marcar_lido(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_comunicados_marcar_todos_lidos(text) TO authenticated;

-- Primeiros avisos: publicados amanhã às 06:00 no horário de Brasília.
INSERT INTO public.app_comunicados(
  chave,titulo,resumo,publico,prioridade,rotulo_acao,rota_gestao,publicado_em
) VALUES (
  '2026-10-grade-agenda',
  'Nova grade da agenda',
  'A agenda agora usa horários de 30 em 30 minutos por padrão. A gestão pode alternar para 15 minutos quando precisar.',
  'gestao','importante','Revisar grade','/admin/disponibilidade','2026-10-22 06:00:00-03'
)
ON CONFLICT(chave) DO NOTHING;

INSERT INTO public.app_comunicados(
  chave,titulo,resumo,publico,prioridade,rotulo_acao,rota_barbeiro,publicado_em
) VALUES (
  '2026-10-disponibilidade-freelancer',
  'Disponibilidade para freelancers',
  'Profissionais freelancers agora podem configurar jornada, intervalos, folgas e bloqueios diretamente no aplicativo.',
  'barbeiros','importante','Abrir disponibilidade','/barber/disponibilidade','2026-10-22 06:00:00-03'
)
ON CONFLICT(chave) DO NOTHING;
