-- Une perfis duplicados preservando todas as referências e uma trilha de auditoria.

CREATE TABLE IF NOT EXISTS public.clientes_unioes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  destino_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  origem_cliente_id uuid NOT NULL,
  origem_snapshot jsonb NOT NULL,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clientes_unioes_barbearia_idx ON public.clientes_unioes(barbearia_id,criada_em DESC);
ALTER TABLE public.clientes_unioes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clientes_unioes FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.clientes_unir(p_origem_id uuid,p_destino_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.clientes_assert_admin();
  v_origem public.clientes%ROWTYPE;
  v_destino public.clientes%ROWTYPE;
  v_corte_ativo uuid;
  v_ref record;
  v_audit_id uuid;
BEGIN
  IF p_origem_id IS NULL OR p_destino_id IS NULL OR p_origem_id=p_destino_id THEN RAISE EXCEPTION 'CLIENTE_UNIAO_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text||':clientes-unir',0));

  SELECT * INTO v_origem FROM public.clientes WHERE id=p_origem_id AND barbearia_id=v_barbearia FOR UPDATE;
  SELECT * INTO v_destino FROM public.clientes WHERE id=p_destino_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF v_origem.id IS NULL OR v_destino.id IS NULL THEN RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO'; END IF;
  IF v_origem.cpf_hash IS NOT NULL AND v_destino.cpf_hash IS NOT NULL AND v_origem.cpf_hash<>v_destino.cpf_hash THEN
    RAISE EXCEPTION 'CLIENTE_UNIAO_CPFS_DIFERENTES';
  END IF;

  SELECT cc.id INTO v_corte_ativo FROM public.cliente_cortes cc
  WHERE cc.barbearia_id=v_barbearia AND cc.cliente_id IN (p_origem_id,p_destino_id)
  ORDER BY cc.criado_em DESC,cc.id DESC LIMIT 1;
  UPDATE public.cliente_cortes SET ativo=false,arquivado_em=COALESCE(arquivado_em,now())
  WHERE barbearia_id=v_barbearia AND cliente_id IN (p_origem_id,p_destino_id) AND ativo;
  UPDATE public.portal_sessoes SET revogada_em=COALESCE(revogada_em,now())
  WHERE barbearia_id=v_barbearia AND cliente_id IN (p_origem_id,p_destino_id);

  IF v_destino.cpf_hash IS NULL AND v_origem.cpf_hash IS NOT NULL THEN
    UPDATE public.clientes SET cpf_hash=NULL,cpf_final=NULL WHERE id=p_origem_id;
    UPDATE public.clientes SET cpf_hash=v_origem.cpf_hash,cpf_final=v_origem.cpf_final WHERE id=p_destino_id;
  END IF;

  FOR v_ref IN
    SELECT con.conrelid::regclass AS tabela,child_att.attname AS coluna
    FROM pg_constraint con
    JOIN LATERAL generate_subscripts(con.conkey,1) position ON true
    JOIN pg_attribute child_att ON child_att.attrelid=con.conrelid AND child_att.attnum=con.conkey[position]
    JOIN pg_attribute parent_att ON parent_att.attrelid=con.confrelid AND parent_att.attnum=con.confkey[position]
    WHERE con.contype='f' AND con.confrelid='public.clientes'::regclass AND parent_att.attname='id'
    ORDER BY con.conrelid::regclass::text,child_att.attname
  LOOP
    EXECUTE format('UPDATE %s SET %I=$1 WHERE %I=$2',v_ref.tabela,v_ref.coluna,v_ref.coluna) USING p_destino_id,p_origem_id;
  END LOOP;

  IF v_corte_ativo IS NOT NULL THEN UPDATE public.cliente_cortes SET ativo=true,arquivado_em=NULL WHERE id=v_corte_ativo; END IF;

  UPDATE public.clientes SET
    telefone=COALESCE(NULLIF(btrim(telefone),''),NULLIF(btrim(v_origem.telefone),'')),
    barbeiro_favorito_id=COALESCE(barbeiro_favorito_id,v_origem.barbeiro_favorito_id),
    notas_preferencias=COALESCE(NULLIF(btrim(notas_preferencias),''),NULLIF(btrim(v_origem.notas_preferencias),'')),
    updated_at=clock_timestamp()
  WHERE id=p_destino_id AND barbearia_id=v_barbearia;

  DELETE FROM public.clientes WHERE id=p_origem_id AND barbearia_id=v_barbearia;
  INSERT INTO public.clientes_unioes(barbearia_id,destino_cliente_id,origem_cliente_id,origem_snapshot,autor_id)
  VALUES (v_barbearia,p_destino_id,p_origem_id,to_jsonb(v_origem)-'cpf_hash',auth.uid()) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('id',p_destino_id,'nome',v_destino.nome,'uniao_id',v_audit_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'CLIENTE_UNIAO_CONFLITO_REGISTROS';
END;
$$;

REVOKE ALL ON FUNCTION public.clientes_unir(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clientes_unir(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.clientes_unir(uuid,uuid) IS
  'Move referencias da ficha origem para a ficha destino, revoga sessoes e registra auditoria sem expor CPF hash.';
