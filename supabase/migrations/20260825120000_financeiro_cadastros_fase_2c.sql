BEGIN;

CREATE TABLE public.financeiro_idempotencia (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  operacao text NOT NULL CHECK (length(btrim(operacao)) BETWEEN 1 AND 100),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  resposta jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, operacao, idempotency_key)
);

ALTER TABLE public.financeiro_idempotencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.financeiro_idempotencia FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_conflito record;
BEGIN
  SELECT barbearia_id, lower(btrim(nome)) nome_normalizado, count(*) quantidade
    INTO v_conflito
  FROM public.financeiro_contas_bancarias
  WHERE ativa
  GROUP BY barbearia_id, lower(btrim(nome))
  HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'FINANCEIRO_CONFLITO_NOME_CONTA_ATIVA: barbearia %, nome %, quantidade %',
      v_conflito.barbearia_id, v_conflito.nome_normalizado, v_conflito.quantidade;
  END IF;

  SELECT barbearia_id, lower(btrim(nome)) nome_normalizado, count(*) quantidade
    INTO v_conflito
  FROM public.financeiro_categorias
  WHERE ativa
  GROUP BY barbearia_id, lower(btrim(nome))
  HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'FINANCEIRO_CONFLITO_NOME_CATEGORIA_ATIVA: barbearia %, nome %, quantidade %',
      v_conflito.barbearia_id, v_conflito.nome_normalizado, v_conflito.quantidade;
  END IF;
END $$;

ALTER TABLE public.financeiro_categorias
  DROP CONSTRAINT financeiro_categorias_barbearia_id_nome_key;

CREATE UNIQUE INDEX financeiro_conta_nome_ativo_normalizado_unico
  ON public.financeiro_contas_bancarias (barbearia_id, lower(btrim(nome))) WHERE ativa;
CREATE UNIQUE INDEX financeiro_categoria_nome_ativo_normalizado_unico
  ON public.financeiro_categorias (barbearia_id, lower(btrim(nome))) WHERE ativa;

CREATE FUNCTION public.financeiro_criar_conta_bancaria(
  p_nome text, p_instituicao text, p_tipo text, p_saldo_inicial numeric,
  p_idempotency_key text, p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid; v_nome text; v_instituicao text; v_chave text; v_correlation text;
  v_saldo numeric(15,2); v_principal boolean; v_payload jsonb; v_hash text;
  v_intencao public.financeiro_idempotencia%ROWTYPE; v_conta public.financeiro_contas_bancarias%ROWTYPE; v_resposta jsonb; v_constraint text;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  v_nome := btrim(p_nome); v_instituicao := nullif(btrim(p_instituicao), '');
  v_chave := btrim(p_idempotency_key); v_correlation := nullif(btrim(p_correlation_id), '');
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'FINANCEIRO_NOME_INVALIDO'; END IF;
  IF v_instituicao IS NOT NULL AND length(v_instituicao) > 100 THEN RAISE EXCEPTION 'FINANCEIRO_INSTITUICAO_INVALIDA'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('corrente','poupanca','caixa','carteira_digital','cartao') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_CONTA_INVALIDO'; END IF;
  IF p_saldo_inicial IS NULL OR p_saldo_inicial::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'FINANCEIRO_SALDO_INICIAL_INVALIDO'; END IF;
  IF v_chave IS NULL OR length(v_chave) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation) > 200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  v_saldo := round(p_saldo_inicial, 2);
  v_payload := jsonb_build_object('nome',v_nome,'instituicao',v_instituicao,'tipo',p_tipo,'saldo_inicial',v_saldo);
  v_hash := encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':criar_conta:' || v_chave, 0));
  SELECT * INTO v_intencao FROM public.financeiro_idempotencia
   WHERE barbearia_id=v_barbearia AND operacao='criar_conta_bancaria' AND idempotency_key=v_chave FOR UPDATE;
  IF FOUND THEN
    IF v_intencao.payload_hash <> v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF;
    RETURN v_intencao.resposta || jsonb_build_object('idempotente',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':contas', 0));
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia ORDER BY id FOR UPDATE;
  v_principal := NOT EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia AND ativa);
  BEGIN
    INSERT INTO public.financeiro_contas_bancarias
      (barbearia_id,nome,instituicao,tipo,saldo_inicial,conta_principal)
    VALUES (v_barbearia,v_nome,v_instituicao,p_tipo,v_saldo,v_principal) RETURNING * INTO v_conta;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint='financeiro_conta_nome_ativo_normalizado_unico' THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; ELSE RAISE; END IF;
  END;
  v_resposta := jsonb_build_object('id',v_conta.id,'nome',v_conta.nome,'instituicao',v_conta.instituicao,
    'tipo',v_conta.tipo,'saldo_inicial',v_conta.saldo_inicial,'conta_principal',v_conta.conta_principal,'ativa',v_conta.ativa);
  INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta)
    VALUES(v_barbearia,'criar_conta_bancaria',v_chave,v_hash,v_resposta);
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_contas_bancarias',v_conta.id,NULL,to_jsonb(v_conta),v_correlation);
  RETURN v_resposta || jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_editar_conta_bancaria(
  p_conta_id uuid, p_nome text, p_instituicao text, p_tipo text,
  p_expected_updated_at timestamptz, p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_nome text; v_instituicao text; v_correlation text; v_constraint text;
  v_antes public.financeiro_contas_bancarias%ROWTYPE; v_depois public.financeiro_contas_bancarias%ROWTYPE;
BEGIN
  v_barbearia:=public.financeiro_assert_admin(); v_nome:=btrim(p_nome); v_instituicao:=nullif(btrim(p_instituicao),''); v_correlation:=nullif(btrim(p_correlation_id),'');
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'FINANCEIRO_NOME_INVALIDO'; END IF;
  IF v_instituicao IS NOT NULL AND length(v_instituicao)>100 THEN RAISE EXCEPTION 'FINANCEIRO_INSTITUICAO_INVALIDA'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('corrente','poupanca','caixa','carteira_digital','cartao') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_CONTA_INVALIDO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_VERSAO_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation)>200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  SELECT * INTO v_antes FROM public.financeiro_contas_bancarias WHERE id=p_conta_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CADASTRO_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;
  BEGIN
    UPDATE public.financeiro_contas_bancarias SET nome=v_nome,instituicao=v_instituicao,tipo=p_tipo,updated_at=clock_timestamp()
     WHERE id=v_antes.id RETURNING * INTO v_depois;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint='financeiro_conta_nome_ativo_normalizado_unico' THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; ELSE RAISE; END IF;
  END;
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_contas_bancarias',v_depois.id,to_jsonb(v_antes),to_jsonb(v_depois),v_correlation);
  RETURN jsonb_build_object('id',v_depois.id,'nome',v_depois.nome,'instituicao',v_depois.instituicao,'tipo',v_depois.tipo,
    'saldo_inicial',v_depois.saldo_inicial,'conta_principal',v_depois.conta_principal,'ativa',v_depois.ativa,'updated_at',v_depois.updated_at);
END; $$;

CREATE FUNCTION public.financeiro_definir_conta_principal(p_conta_id uuid, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_correlation text; v_alvo public.financeiro_contas_bancarias%ROWTYPE; v_anterior uuid;
BEGIN
  v_barbearia:=public.financeiro_assert_admin(); v_correlation:=nullif(btrim(p_correlation_id),'');
  IF v_correlation IS NOT NULL AND length(v_correlation)>200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':contas',0));
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia ORDER BY id FOR UPDATE;
  SELECT * INTO v_alvo FROM public.financeiro_contas_bancarias WHERE id=p_conta_id AND barbearia_id=v_barbearia AND ativa;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CADASTRO_NAO_ENCONTRADO'; END IF;
  SELECT id INTO v_anterior FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia AND ativa AND conta_principal;
  IF v_alvo.conta_principal THEN
    PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_contas_bancarias',v_alvo.id,to_jsonb(v_alvo),to_jsonb(v_alvo),v_correlation);
    RETURN jsonb_build_object('conta_principal_id',v_alvo.id,'conta_anterior_id',v_anterior,'alterada',false);
  END IF;
  UPDATE public.financeiro_contas_bancarias SET conta_principal=false,updated_at=clock_timestamp()
   WHERE barbearia_id=v_barbearia AND ativa AND conta_principal;
  UPDATE public.financeiro_contas_bancarias SET conta_principal=true,updated_at=clock_timestamp() WHERE id=v_alvo.id;
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_contas_bancarias',v_alvo.id,to_jsonb(v_alvo),
    jsonb_build_object('conta_principal',true,'conta_anterior_id',v_anterior),v_correlation);
  RETURN jsonb_build_object('conta_principal_id',v_alvo.id,'conta_anterior_id',v_anterior,'alterada',true);
END; $$;

CREATE FUNCTION public.financeiro_definir_conta_ativa(
  p_conta_id uuid, p_ativa boolean, p_conta_substituta_id uuid DEFAULT NULL, p_correlation_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_correlation text; v_antes public.financeiro_contas_bancarias%ROWTYPE;
  v_substituta public.financeiro_contas_bancarias%ROWTYPE; v_principal boolean; v_ativas integer; v_depois public.financeiro_contas_bancarias%ROWTYPE; v_constraint text;
BEGIN
  v_barbearia:=public.financeiro_assert_admin(); v_correlation:=nullif(btrim(p_correlation_id),'');
  IF p_ativa IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_FLAG_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation)>200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':contas',0));
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia ORDER BY id FOR UPDATE;
  SELECT * INTO v_antes FROM public.financeiro_contas_bancarias WHERE id=p_conta_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CADASTRO_NAO_ENCONTRADO'; END IF;
  IF v_antes.ativa=p_ativa THEN
    PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_contas_bancarias',v_antes.id,to_jsonb(v_antes),to_jsonb(v_antes),v_correlation);
    RETURN jsonb_build_object('id',v_antes.id,'ativa',v_antes.ativa,'conta_principal',v_antes.conta_principal,'alterada',false);
  END IF;
  IF NOT p_ativa THEN
    SELECT count(*) INTO v_ativas FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia AND ativa;
    IF v_ativas<=1 THEN RAISE EXCEPTION 'FINANCEIRO_ULTIMA_CONTA_ATIVA'; END IF;
    IF v_antes.conta_principal THEN
      SELECT * INTO v_substituta FROM public.financeiro_contas_bancarias
       WHERE id=p_conta_substituta_id AND barbearia_id=v_barbearia AND ativa AND id<>v_antes.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_SUBSTITUTA_INVALIDA'; END IF;
      UPDATE public.financeiro_contas_bancarias SET conta_principal=false,updated_at=clock_timestamp() WHERE id=v_antes.id;
      UPDATE public.financeiro_contas_bancarias SET conta_principal=true,updated_at=clock_timestamp() WHERE id=v_substituta.id;
    END IF;
    UPDATE public.financeiro_contas_bancarias SET ativa=false,conta_principal=false,updated_at=clock_timestamp() WHERE id=v_antes.id RETURNING * INTO v_depois;
  ELSE
    v_principal:=NOT EXISTS(SELECT 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_barbearia AND ativa AND conta_principal);
    BEGIN
      UPDATE public.financeiro_contas_bancarias SET ativa=true,conta_principal=v_principal,updated_at=clock_timestamp() WHERE id=v_antes.id RETURNING * INTO v_depois;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint='financeiro_conta_nome_ativo_normalizado_unico' THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; ELSE RAISE; END IF;
    END;
  END IF;
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_contas_bancarias',v_depois.id,to_jsonb(v_antes),to_jsonb(v_depois),v_correlation);
  RETURN jsonb_build_object('id',v_depois.id,'ativa',v_depois.ativa,'conta_principal',v_depois.conta_principal,
    'conta_substituta_id',CASE WHEN v_antes.conta_principal AND NOT p_ativa THEN v_substituta.id ELSE NULL END,'alterada',true);
END; $$;

CREATE FUNCTION public.financeiro_criar_categoria(
  p_nome text, p_tipo text, p_grupo_dre text, p_idempotency_key text, p_correlation_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_nome text; v_chave text; v_correlation text; v_payload jsonb; v_hash text;
  v_intencao public.financeiro_idempotencia%ROWTYPE; v_categoria public.financeiro_categorias%ROWTYPE; v_resposta jsonb; v_constraint text;
BEGIN
  v_barbearia:=public.financeiro_assert_admin(); v_nome:=btrim(p_nome); v_chave:=btrim(p_idempotency_key); v_correlation:=nullif(btrim(p_correlation_id),'');
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'FINANCEIRO_NOME_INVALIDO'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada','saida','ambos') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_CATEGORIA_INVALIDO'; END IF;
  IF p_grupo_dre IS NULL OR p_grupo_dre NOT IN ('receita_servicos','receita_produtos','cmv','despesa_fixa','despesa_variavel','despesa_financeira','pro_labore','impostos','outros') THEN RAISE EXCEPTION 'FINANCEIRO_GRUPO_DRE_INVALIDO'; END IF;
  IF v_chave IS NULL OR length(v_chave) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation)>200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  v_payload:=jsonb_build_object('nome',v_nome,'tipo',p_tipo,'grupo_dre',p_grupo_dre);
  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barbearia::text || ':criar_categoria:' || v_chave,0));
  SELECT * INTO v_intencao FROM public.financeiro_idempotencia
   WHERE barbearia_id=v_barbearia AND operacao='criar_categoria' AND idempotency_key=v_chave FOR UPDATE;
  IF FOUND THEN
    IF v_intencao.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF;
    RETURN v_intencao.resposta || jsonb_build_object('idempotente',true);
  END IF;
  BEGIN
    INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre)
     VALUES(v_barbearia,v_nome,p_tipo,p_grupo_dre) RETURNING * INTO v_categoria;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint='financeiro_categoria_nome_ativo_normalizado_unico' THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; ELSE RAISE; END IF;
  END;
  v_resposta:=jsonb_build_object('id',v_categoria.id,'nome',v_categoria.nome,'tipo',v_categoria.tipo,'grupo_dre',v_categoria.grupo_dre,'ativa',v_categoria.ativa);
  INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta)
   VALUES(v_barbearia,'criar_categoria',v_chave,v_hash,v_resposta);
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_categorias',v_categoria.id,NULL,to_jsonb(v_categoria),v_correlation);
  RETURN v_resposta || jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_editar_categoria(
  p_categoria_id uuid, p_nome text, p_tipo text, p_grupo_dre text,
  p_expected_updated_at timestamptz, p_correlation_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_nome text; v_correlation text; v_referenciada boolean; v_constraint text;
  v_antes public.financeiro_categorias%ROWTYPE; v_depois public.financeiro_categorias%ROWTYPE;
BEGIN
  v_barbearia:=public.financeiro_assert_admin(); v_nome:=btrim(p_nome); v_correlation:=nullif(btrim(p_correlation_id),'');
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'FINANCEIRO_NOME_INVALIDO'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada','saida','ambos') THEN RAISE EXCEPTION 'FINANCEIRO_TIPO_CATEGORIA_INVALIDO'; END IF;
  IF p_grupo_dre IS NULL OR p_grupo_dre NOT IN ('receita_servicos','receita_produtos','cmv','despesa_fixa','despesa_variavel','despesa_financeira','pro_labore','impostos','outros') THEN RAISE EXCEPTION 'FINANCEIRO_GRUPO_DRE_INVALIDO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_VERSAO_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation)>200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  SELECT * INTO v_antes FROM public.financeiro_categorias WHERE id=p_categoria_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CADASTRO_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.financeiro_contas_pagar WHERE barbearia_id=v_barbearia AND categoria_id=v_antes.id)
      OR EXISTS(SELECT 1 FROM public.financeiro_contas_receber WHERE barbearia_id=v_barbearia AND categoria_id=v_antes.id)
      OR EXISTS(SELECT 1 FROM public.financeiro_movimentacoes WHERE barbearia_id=v_barbearia AND categoria_id=v_antes.id)
    INTO v_referenciada;
  IF v_referenciada AND (v_nome<>v_antes.nome OR p_tipo<>v_antes.tipo OR p_grupo_dre<>v_antes.grupo_dre) THEN
    RAISE EXCEPTION 'FINANCEIRO_CATEGORIA_COM_HISTORICO';
  END IF;
  BEGIN
    UPDATE public.financeiro_categorias SET nome=v_nome,tipo=p_tipo,grupo_dre=p_grupo_dre,updated_at=clock_timestamp()
     WHERE id=v_antes.id RETURNING * INTO v_depois;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint='financeiro_categoria_nome_ativo_normalizado_unico' THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; ELSE RAISE; END IF;
  END;
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_categorias',v_depois.id,to_jsonb(v_antes),to_jsonb(v_depois),v_correlation);
  RETURN jsonb_build_object('id',v_depois.id,'nome',v_depois.nome,'tipo',v_depois.tipo,'grupo_dre',v_depois.grupo_dre,'ativa',v_depois.ativa,'updated_at',v_depois.updated_at);
END; $$;

CREATE FUNCTION public.financeiro_definir_categoria_ativa(
  p_categoria_id uuid, p_ativa boolean, p_correlation_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_correlation text; v_antes public.financeiro_categorias%ROWTYPE; v_depois public.financeiro_categorias%ROWTYPE; v_constraint text;
BEGIN
  v_barbearia:=public.financeiro_assert_admin(); v_correlation:=nullif(btrim(p_correlation_id),'');
  IF p_ativa IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_FLAG_INVALIDA'; END IF;
  IF v_correlation IS NOT NULL AND length(v_correlation)>200 THEN RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO'; END IF;
  SELECT * INTO v_antes FROM public.financeiro_categorias WHERE id=p_categoria_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CADASTRO_NAO_ENCONTRADO'; END IF;
  IF v_antes.ativa=p_ativa THEN
    PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_categorias',v_antes.id,to_jsonb(v_antes),to_jsonb(v_antes),v_correlation);
    RETURN jsonb_build_object('id',v_antes.id,'ativa',v_antes.ativa,'alterada',false);
  END IF;
  BEGIN
    UPDATE public.financeiro_categorias SET ativa=p_ativa,updated_at=clock_timestamp() WHERE id=v_antes.id RETURNING * INTO v_depois;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint='financeiro_categoria_nome_ativo_normalizado_unico' THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; ELSE RAISE; END IF;
  END;
  PERFORM public.financeiro_auditar(v_barbearia,'rpc','financeiro_categorias',v_depois.id,to_jsonb(v_antes),to_jsonb(v_depois),v_correlation);
  RETURN jsonb_build_object('id',v_depois.id,'ativa',v_depois.ativa,'alterada',true);
END; $$;

CREATE FUNCTION public.financeiro_listar_contas_bancarias_cadastro(p_incluir_inativas boolean DEFAULT false)
RETURNS TABLE (
  id uuid, nome text, instituicao text, tipo text, saldo_inicial numeric,
  conta_principal boolean, ativa boolean, updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid;
BEGIN
  IF p_incluir_inativas IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_FLAG_INVALIDA'; END IF;
  v_barbearia:=public.financeiro_assert_admin();
  RETURN QUERY
    SELECT c.id,c.nome,c.instituicao,c.tipo,c.saldo_inicial,c.conta_principal,c.ativa,c.updated_at
    FROM public.financeiro_contas_bancarias c
    WHERE c.barbearia_id=v_barbearia AND (p_incluir_inativas OR c.ativa)
    ORDER BY c.ativa DESC,lower(btrim(c.nome)),c.id;
END; $$;

CREATE FUNCTION public.financeiro_listar_categorias_cadastro(p_incluir_inativas boolean DEFAULT false)
RETURNS TABLE (id uuid, nome text, tipo text, grupo_dre text, ativa boolean, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid;
BEGIN
  IF p_incluir_inativas IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_FLAG_INVALIDA'; END IF;
  v_barbearia:=public.financeiro_assert_admin();
  RETURN QUERY
    SELECT c.id,c.nome,c.tipo,c.grupo_dre,c.ativa,c.updated_at
    FROM public.financeiro_categorias c
    WHERE c.barbearia_id=v_barbearia AND (p_incluir_inativas OR c.ativa)
    ORDER BY c.ativa DESC,lower(btrim(c.nome)),c.id;
END; $$;

REVOKE ALL ON FUNCTION public.financeiro_criar_conta_bancaria(text,text,text,numeric,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_editar_conta_bancaria(uuid,text,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_definir_conta_principal(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_definir_conta_ativa(uuid,boolean,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_criar_categoria(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_editar_categoria(uuid,text,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_definir_categoria_ativa(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_listar_contas_bancarias_cadastro(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_listar_categorias_cadastro(boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.financeiro_pagar_conta(uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_receber_conta(uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_transferir(uuid,uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_credito_movimentar(uuid,text,numeric,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_categorias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_contas_bancarias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_resumo_periodo(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_titulos(text,date,date,text,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_criar_conta_bancaria(text,text,text,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_editar_conta_bancaria(uuid,text,text,text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_definir_conta_principal(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_definir_conta_ativa(uuid,boolean,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_criar_categoria(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_editar_categoria(uuid,text,text,text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_definir_categoria_ativa(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_contas_bancarias_cadastro(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_categorias_cadastro(boolean) TO authenticated;

COMMIT;
