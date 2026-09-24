-- Separa a comissão padrão de serviços da comissão padrão de vendas.
-- Um percentual específico no produto continua sendo o override daquele item.

ALTER TABLE public.profissionais
  ADD COLUMN comissao_produtos_percentual numeric(5,2),
  ADD CONSTRAINT profissionais_comissao_produtos_check
    CHECK (comissao_produtos_percentual IS NULL OR comissao_produtos_percentual BETWEEN 0 AND 100);

DROP FUNCTION public.barbeiros_listar(boolean);
CREATE FUNCTION public.barbeiros_listar(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (
  id uuid,nome text,apelido text,telefone text,especialidade text,foto_url text,
  comissao_percentual numeric,comissao_produtos_percentual numeric,ativo boolean,
  user_id uuid,email text,criado_em timestamptz,updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'admin' OR v_barbearia IS NULL THEN RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO'; END IF;
  RETURN QUERY SELECT p.id,p.nome,p.apelido,p.telefone,p.especialidade,p.foto_url,
    p.comissao_percentual,p.comissao_produtos_percentual,p.ativo,p.user_id,pr.email,p.criado_em,p.updated_at
  FROM public.profissionais p
  LEFT JOIN public.profiles pr ON pr.id=p.user_id AND pr.barbearia_id=p.barbearia_id
  WHERE p.barbearia_id=v_barbearia AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC,COALESCE(NULLIF(btrim(p.apelido),''),p.nome),p.nome;
END;
$$;

DROP FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,boolean,timestamptz);
CREATE FUNCTION public.barbeiros_atualizar(
  p_profissional_id uuid,p_nome text,p_apelido text,p_telefone text,p_especialidade text,
  p_comissao_percentual numeric,p_comissao_produtos_percentual numeric,p_ativo boolean,p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_antes public.profissionais%ROWTYPE; v_depois public.profissionais%ROWTYPE;
  v_nome text:=btrim(p_nome); v_apelido text:=NULLIF(btrim(p_apelido),''); v_telefone text:=NULLIF(btrim(p_telefone),''); v_especialidade text:=NULLIF(btrim(p_especialidade),'');
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'admin' OR v_barbearia IS NULL THEN RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO'; END IF;
  IF p_profissional_id IS NULL OR p_expected_updated_at IS NULL OR p_ativo IS NULL THEN RAISE EXCEPTION 'BARBEIROS_DADOS_INVALIDOS'; END IF;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'BARBEIROS_NOME_INVALIDO'; END IF;
  IF v_apelido IS NOT NULL AND length(v_apelido) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'BARBEIROS_APELIDO_INVALIDO'; END IF;
  IF v_telefone IS NOT NULL AND length(v_telefone) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'BARBEIROS_TELEFONE_INVALIDO'; END IF;
  IF v_especialidade IS NOT NULL AND length(v_especialidade)>100 THEN RAISE EXCEPTION 'BARBEIROS_ESPECIALIDADE_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND p_comissao_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'BARBEIROS_COMISSAO_INVALIDA'; END IF;
  IF p_comissao_produtos_percentual IS NOT NULL AND p_comissao_produtos_percentual NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'BARBEIROS_COMISSAO_PRODUTOS_INVALIDA'; END IF;
  SELECT * INTO v_antes FROM public.profissionais WHERE id=p_profissional_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARBEIROS_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'BARBEIROS_CONFLITO_VERSAO'; END IF;
  UPDATE public.profissionais SET nome=v_nome,apelido=v_apelido,telefone=v_telefone,especialidade=v_especialidade,
    comissao_percentual=p_comissao_percentual,comissao_produtos_percentual=p_comissao_produtos_percentual,
    ativo=p_ativo,updated_at=clock_timestamp()
  WHERE id=v_antes.id RETURNING * INTO v_depois;
  RETURN jsonb_build_object('id',v_depois.id,'ativo',v_depois.ativo,'updated_at',v_depois.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_produtos_listar()
RETURNS TABLE(id uuid,nome text,sku text,categoria text,descricao text,preco_venda numeric,estoque_quantidade integer,comissao_percentual numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id(); v_profissional uuid:=public.get_my_profissional_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN RAISE EXCEPTION 'VENDA_PRODUTO_NAO_AUTORIZADA'; END IF;
  RETURN QUERY SELECT p.id,p.nome,p.sku,p.categoria,p.descricao,p.preco_venda,p.estoque_quantidade,
    COALESCE(p.comissao_percentual,prof.comissao_produtos_percentual,0)::numeric
  FROM public.produtos p
  JOIN public.profissionais prof ON prof.id=v_profissional AND prof.barbearia_id=v_barbearia
  WHERE p.barbearia_id=v_barbearia AND p.ativo ORDER BY (p.estoque_quantidade>0) DESC,p.nome,p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendas_produtos_aplicar_comissao_padrao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_produto_percentual numeric; v_profissional_percentual numeric;
BEGIN
  IF NEW.produto_id IS NULL OR NEW.profissional_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.comissao_percentual INTO v_produto_percentual
  FROM public.produtos p WHERE p.id=NEW.produto_id AND p.barbearia_id=NEW.barbearia_id;
  IF v_produto_percentual IS NULL THEN
    SELECT p.comissao_produtos_percentual INTO v_profissional_percentual
    FROM public.profissionais p WHERE p.id=NEW.profissional_id AND p.barbearia_id=NEW.barbearia_id;
    NEW.comissao_percentual_snapshot:=COALESCE(v_profissional_percentual,0);
    NEW.comissao_valor:=round((NEW.valor_venda-COALESCE(NEW.desconto_valor,0))*NEW.comissao_percentual_snapshot/100,2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendas_produtos_comissao_padrao_trg ON public.vendas_produtos;
CREATE TRIGGER vendas_produtos_comissao_padrao_trg
BEFORE INSERT ON public.vendas_produtos FOR EACH ROW EXECUTE FUNCTION public.vendas_produtos_aplicar_comissao_padrao();

REVOKE ALL ON FUNCTION public.barbeiros_listar(boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,numeric,boolean,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_produtos_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.vendas_produtos_aplicar_comissao_padrao() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiros_listar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,numeric,boolean,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_produtos_listar() TO authenticated;

COMMENT ON COLUMN public.profissionais.comissao_percentual IS 'Comissao padrao do profissional sobre servicos.';
COMMENT ON COLUMN public.profissionais.comissao_produtos_percentual IS 'Comissao padrao do profissional sobre vendas de produtos; o percentual do produto pode sobrescrever.';
