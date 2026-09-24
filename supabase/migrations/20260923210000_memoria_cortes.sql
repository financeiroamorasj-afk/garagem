-- Memória do cliente: conclusão atômica do atendimento, preferências e foto privada.

CREATE TABLE IF NOT EXISTS public.cliente_cortes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL UNIQUE REFERENCES public.agendamentos(id) ON DELETE RESTRICT,
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE RESTRICT,
  estilo text NOT NULL,
  pentes text,
  acabamento text,
  barba text,
  observacoes text,
  preferencias_cliente text,
  foto_path text,
  foto_mime text,
  foto_bytes integer,
  foto_largura integer,
  foto_altura integer,
  foto_excluida_em timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  arquivado_em timestamptz,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_cortes_estilo_check CHECK (length(btrim(estilo)) BETWEEN 2 AND 80),
  CONSTRAINT cliente_cortes_textos_check CHECK (
    length(COALESCE(pentes,'')) <= 120 AND length(COALESCE(acabamento,'')) <= 80
    AND length(COALESCE(barba,'')) <= 80 AND length(COALESCE(observacoes,'')) <= 1000
    AND length(COALESCE(preferencias_cliente,'')) <= 1000
  ),
  CONSTRAINT cliente_cortes_foto_check CHECK (
    (foto_path IS NULL AND foto_mime IS NULL AND foto_bytes IS NULL AND foto_largura IS NULL AND foto_altura IS NULL)
    OR (foto_path IS NOT NULL AND foto_mime IN ('image/webp','image/jpeg')
      AND foto_bytes BETWEEN 1 AND 1048576 AND foto_largura BETWEEN 1 AND 1600 AND foto_altura BETWEEN 1 AND 1600)
  ),
  CONSTRAINT cliente_cortes_arquivo_check CHECK (
    (ativo AND arquivado_em IS NULL) OR (NOT ativo AND arquivado_em IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_cortes_um_ativo_idx
  ON public.cliente_cortes(cliente_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS cliente_cortes_historico_idx
  ON public.cliente_cortes(barbearia_id,cliente_id,criado_em DESC);

ALTER TABLE public.cliente_cortes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cliente_cortes_leitura_autorizada ON public.cliente_cortes;
CREATE POLICY cliente_cortes_leitura_autorizada ON public.cliente_cortes
FOR SELECT TO authenticated USING (
  barbearia_id=public.get_my_barbearia_id()
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=cliente_cortes.barbearia_id
        AND a.cliente_id=cliente_cortes.cliente_id
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

REVOKE ALL ON TABLE public.cliente_cortes FROM anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('cortes-clientes','cortes-clientes',false,1048576,ARRAY['image/webp','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET
  public=false,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS cortes_clientes_ler ON storage.objects;
DROP POLICY IF EXISTS cortes_clientes_enviar ON storage.objects;
DROP POLICY IF EXISTS cortes_clientes_remover ON storage.objects;

CREATE POLICY cortes_clientes_ler ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='cortes-clientes'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=public.get_my_barbearia_id()
        AND a.cliente_id::text=(storage.foldername(name))[2]
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

CREATE POLICY cortes_clientes_enviar ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='cortes-clientes'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=public.get_my_barbearia_id()
        AND a.cliente_id::text=(storage.foldername(name))[2]
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

CREATE POLICY cortes_clientes_remover ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='cortes-clientes'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=public.get_my_barbearia_id()
        AND a.cliente_id::text=(storage.foldername(name))[2]
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

CREATE OR REPLACE FUNCTION public.cliente_corte_json(p_corte public.cliente_cortes)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.cliente_corte_ultimo(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_atendimento_concluir(
  p_agendamento_id uuid,
  p_estilo text,
  p_pentes text DEFAULT NULL,
  p_acabamento text DEFAULT NULL,
  p_barba text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_preferencias_cliente text DEFAULT NULL,
  p_foto_path text DEFAULT NULL,
  p_foto_mime text DEFAULT NULL,
  p_foto_bytes integer DEFAULT NULL,
  p_foto_largura integer DEFAULT NULL,
  p_foto_altura integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_agenda_listar_memoria(p_data date)
RETURNS TABLE (
  id uuid,profissional_id uuid,cliente_id uuid,cliente_nome text,cliente_telefone text,
  cliente_preferencias text,servico_id uuid,servico_nome text,duracao_minutos integer,
  data_hora timestamptz,status text,valor_final numeric,ultimo_corte jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.cliente_corte_json(public.cliente_cortes) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cliente_corte_ultimo(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_atendimento_concluir(uuid,text,text,text,text,text,text,text,text,integer,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_agenda_listar_memoria(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cliente_corte_ultimo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_atendimento_concluir(uuid,text,text,text,text,text,text,text,text,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_agenda_listar_memoria(date) TO authenticated;
