-- Central de clientes e base segura de identificação para o futuro Portal do Cliente.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

ALTER TABLE public.barbearias ADD COLUMN IF NOT EXISTS portal_segredo uuid NOT NULL DEFAULT extensions.uuid_generate_v4();
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cpf_hash text,
  ADD COLUMN IF NOT EXISTS cpf_final char(4),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_tenant_uidx
  ON public.clientes(barbearia_id,cpf_hash) WHERE cpf_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS clientes_busca_tenant_idx ON public.clientes(barbearia_id,lower(nome));

CREATE OR REPLACE FUNCTION public.cliente_cpf_normalizar(p_cpf text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.cliente_cpf_hash(p_barbearia uuid,p_cpf text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_cpf text:=public.cliente_cpf_normalizar(p_cpf); v_secret uuid;
BEGIN
  SELECT portal_segredo INTO v_secret FROM public.barbearias WHERE id=p_barbearia;
  IF v_secret IS NULL THEN RAISE EXCEPTION 'CLIENTE_BARBEARIA_INVALIDA'; END IF;
  RETURN encode(extensions.hmac(v_cpf,v_secret::text,'sha256'),'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.clientes_assert_admin()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN RAISE EXCEPTION 'CLIENTES_NAO_AUTORIZADO'; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.clientes_listar(p_busca text DEFAULT NULL,p_limite integer DEFAULT 100)
RETURNS TABLE (
  id uuid,nome text,telefone text,cpf_cadastrado boolean,cpf_final text,
  barbeiro_favorito_id uuid,barbeiro_favorito_nome text,notas_preferencias text,updated_at timestamptz,
  total_atendimentos bigint,ultima_visita timestamptz,proximo_horario timestamptz,ultimo_corte jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.cliente_ficha_detalhe(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.cliente_salvar(
  p_cliente_id uuid,p_nome text,p_telefone text,p_cpf text,p_remover_cpf boolean,
  p_barbeiro_favorito_id uuid,p_notas_preferencias text,p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.cliente_cpf_normalizar(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cliente_cpf_hash(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.clientes_assert_admin() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.clientes_listar(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cliente_ficha_detalhe(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cliente_salvar(uuid,text,text,text,boolean,uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clientes_listar(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_ficha_detalhe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_salvar(uuid,text,text,text,boolean,uuid,text,timestamptz) TO authenticated;
