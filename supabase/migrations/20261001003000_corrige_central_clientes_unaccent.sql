-- Recupera a busca da Central de Clientes quando o histórico de migrations
-- foi marcado como aplicado sem que a extensão unaccent fosse criada.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.clientes_listar(
  p_busca text DEFAULT NULL,
  p_limite integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  nome text,
  telefone text,
  cpf_cadastrado boolean,
  cpf_final text,
  barbeiro_favorito_id uuid,
  barbeiro_favorito_nome text,
  notas_preferencias text,
  updated_at timestamptz,
  total_atendimentos bigint,
  ultima_visita timestamptz,
  proximo_horario timestamptz,
  ultimo_corte jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.clientes_assert_admin();
  v_busca text:=btrim(COALESCE(p_busca,''));
  v_digits text;
  v_hash text;
BEGIN
  IF p_limite NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'CLIENTES_LIMITE_INVALIDO';
  END IF;

  v_digits:=regexp_replace(v_busca,'\D','','g');
  IF length(v_digits)=11 THEN
    BEGIN
      v_hash:=public.cliente_cpf_hash(v_barbearia,v_digits);
    EXCEPTION WHEN OTHERS THEN
      v_hash:=NULL;
    END;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.nome,
    c.telefone,
    c.cpf_hash IS NOT NULL,
    rtrim(c.cpf_final),
    c.barbeiro_favorito_id,
    COALESCE(p.apelido,p.nome),
    c.notas_preferencias,
    c.updated_at,
    (SELECT count(*) FROM public.agendamentos a
      WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status='concluido'),
    (SELECT max(a.data_hora) FROM public.agendamentos a
      WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status='concluido'),
    (SELECT min(a.data_hora) FROM public.agendamentos a
      WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id
        AND a.status IN ('pendente','confirmado','encaixe') AND a.data_hora>=now()),
    CASE WHEN cut.id IS NULL THEN NULL ELSE public.cliente_corte_json(cut) END
  FROM public.clientes c
  LEFT JOIN public.profissionais p
    ON p.id=c.barbeiro_favorito_id AND p.barbearia_id=c.barbearia_id
  LEFT JOIN LATERAL (
    SELECT cc.*
    FROM public.cliente_cortes cc
    WHERE cc.barbearia_id=v_barbearia AND cc.cliente_id=c.id AND cc.ativo
    ORDER BY cc.criado_em DESC
    LIMIT 1
  ) cut ON true
  WHERE c.barbearia_id=v_barbearia AND (
    v_busca=''
    OR lower(extensions.unaccent(c.nome)) LIKE '%'||lower(extensions.unaccent(v_busca))||'%'
    OR regexp_replace(COALESCE(c.telefone,''),'\D','','g') LIKE '%'||v_digits||'%'
    OR (length(v_digits)=4 AND c.cpf_final=v_digits)
    OR (v_hash IS NOT NULL AND c.cpf_hash=v_hash)
  )
  ORDER BY lower(c.nome),c.id
  LIMIT p_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.clientes_listar(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clientes_listar(text,integer) TO authenticated,service_role;
