BEGIN;

DO $$
DECLARE
  v_a uuid:=extensions.uuid_generate_v4(); v_b uuid:=extensions.uuid_generate_v4();
  v_admin uuid:=extensions.uuid_generate_v4(); v_nao_admin uuid:=extensions.uuid_generate_v4();
  v_conta1 jsonb; v_conta1_retry jsonb; v_conta2 jsonb; v_categoria jsonb; v_categoria2 jsonb; v_lista jsonb;
  v_conta_b uuid; v_categoria_b uuid; v_updated timestamptz; v_stale timestamptz; v_qtd integer; v_rejeitou boolean; v_audit integer; v_erro text;
BEGIN
  INSERT INTO public.barbearias(id,nome,slug) VALUES(v_a,'Tenant 2C A','tenant-2c-a'),(v_b,'Tenant 2C B','tenant-2c-b');
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES
    (v_admin,'authenticated','authenticated','admin-2c@local.test',now(),now()),
    (v_nao_admin,'authenticated','authenticated','user-2c@local.test',now(),now());
  INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES
    (v_admin,v_a,'admin','Admin 2C','admin-2c@local.test'),
    (v_nao_admin,v_a,'barbeiro','Usuário 2C','user-2c@local.test');
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,conta_principal)
    VALUES(v_b,'Conta secreta B','corrente',true) RETURNING id INTO v_conta_b;
  INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre)
    VALUES(v_b,'Categoria secreta B','saida','outros') RETURNING id INTO v_categoria_b;

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_definir_conta_principal(v_conta_b,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'CONTA_DE_OUTRO_TENANT_ACEITA'; END IF;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_definir_categoria_ativa(v_categoria_b,false,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'CATEGORIA_DE_OUTRO_TENANT_ACEITA'; END IF;
  v_conta1:=public.financeiro_criar_conta_bancaria('  Conta Um  ','  Banco A  ','corrente',-10.129,'conta-2c-chave-01','corr-2c');
  IF v_conta1->>'nome'<>'Conta Um' OR (v_conta1->>'saldo_inicial')::numeric<>-10.13 OR NOT (v_conta1->>'conta_principal')::boolean THEN
    RAISE EXCEPTION 'CRIACAO_CONTA_INVALIDA: %',v_conta1;
  END IF;
  v_conta1_retry:=public.financeiro_criar_conta_bancaria('Conta Um','Banco A','corrente',-10.129,'conta-2c-chave-01','corr-2c');
  IF v_conta1_retry->>'id'<>v_conta1->>'id' OR NOT (v_conta1_retry->>'idempotente')::boolean THEN RAISE EXCEPTION 'IDEMPOTENCIA_CONTA_INVALIDA'; END IF;
  SELECT count(*) INTO v_qtd FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_a;
  IF v_qtd<>1 THEN RAISE EXCEPTION 'IDEMPOTENCIA_DUPLICOU_CONTA'; END IF;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_criar_conta_bancaria('Outra','Banco','corrente',1,'conta-2c-chave-01',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'PAYLOAD_DIVERGENTE_ACEITO'; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_criar_conta_bancaria(' conta um ',NULL,'caixa',0,'conta-2c-chave-02',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_NOME_ATIVO_EM_USO' THEN RAISE EXCEPTION 'ERRO_NOME_CONTA_NAO_ESTAVEL: %',v_erro; END IF;

  v_conta2:=public.financeiro_criar_conta_bancaria('Conta Dois',NULL,'caixa',0,'conta-2c-chave-03',NULL);
  IF (v_conta2->>'conta_principal')::boolean THEN RAISE EXCEPTION 'SEGUNDA_CONTA_VIROU_PRINCIPAL'; END IF;
  SELECT updated_at INTO v_updated FROM public.financeiro_contas_bancarias WHERE id=(v_conta2->>'id')::uuid;
  PERFORM public.financeiro_editar_conta_bancaria((v_conta2->>'id')::uuid,'Conta Dois Editada','Instituição','poupanca',v_updated,'edicao-2c');
  v_stale:=v_updated;
  SELECT updated_at INTO v_updated FROM public.financeiro_contas_bancarias WHERE id=(v_conta2->>'id')::uuid;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_editar_conta_bancaria((v_conta2->>'id')::uuid,' conta um ',NULL,'caixa',v_updated,NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_NOME_ATIVO_EM_USO' THEN RAISE EXCEPTION 'ERRO_EDICAO_CONTA_NAO_ESTAVEL: %',v_erro; END IF;
  SELECT updated_at INTO v_updated FROM public.financeiro_contas_bancarias WHERE id=(v_conta2->>'id')::uuid;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_editar_conta_bancaria((v_conta2->>'id')::uuid,'Outra',NULL,'caixa',v_stale,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'VERSAO_DESATUALIZADA_ACEITA'; END IF;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_editar_conta_bancaria(extensions.uuid_generate_v4(),'Outra',NULL,'caixa',now(),NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'UUID_TENANT_OU_INEXISTENTE_ACEITO'; END IF;

  PERFORM public.financeiro_definir_conta_principal((v_conta2->>'id')::uuid,'principal-2c');
  SELECT count(*) INTO v_qtd FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_a AND ativa AND conta_principal;
  IF v_qtd<>1 THEN RAISE EXCEPTION 'QUANTIDADE_PRINCIPAL_INVALIDA'; END IF;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_definir_conta_ativa((v_conta2->>'id')::uuid,false,NULL,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'PRINCIPAL_DESATIVADA_SEM_SUBSTITUTA'; END IF;
  PERFORM public.financeiro_definir_conta_ativa((v_conta2->>'id')::uuid,false,(v_conta1->>'id')::uuid,'substituta-2c');
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_definir_conta_ativa((v_conta1->>'id')::uuid,false,NULL,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'ULTIMA_CONTA_ATIVA_DESATIVADA'; END IF;
  PERFORM public.financeiro_criar_conta_bancaria('conta dois editada',NULL,'caixa',0,'conta-2c-chave-04',NULL);
  v_erro:=NULL; BEGIN PERFORM public.financeiro_definir_conta_ativa((v_conta2->>'id')::uuid,true,NULL,NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_NOME_ATIVO_EM_USO' THEN RAISE EXCEPTION 'ERRO_REATIVACAO_CONTA_NAO_ESTAVEL: %',v_erro; END IF;

  v_categoria:=public.financeiro_criar_categoria('  Materiais  ','saida','cmv','categoria-2c-chave-01','cat-2c');
  PERFORM public.financeiro_criar_categoria('Materiais','saida','cmv','categoria-2c-chave-01','cat-2c');
  v_erro:=NULL; BEGIN PERFORM public.financeiro_criar_categoria(' materiais ','saida','outros','categoria-2c-chave-02',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_NOME_ATIVO_EM_USO' THEN RAISE EXCEPTION 'ERRO_NOME_CATEGORIA_NAO_ESTAVEL: %',v_erro; END IF;
  v_categoria2:=public.financeiro_criar_categoria('Categoria Dois','entrada','outros','categoria-2c-chave-04',NULL);
  SELECT updated_at INTO v_updated FROM public.financeiro_categorias WHERE id=(v_categoria2->>'id')::uuid;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_editar_categoria((v_categoria2->>'id')::uuid,' materiais ','entrada','outros',v_updated,NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_NOME_ATIVO_EM_USO' THEN RAISE EXCEPTION 'ERRO_EDICAO_CATEGORIA_NAO_ESTAVEL: %',v_erro; END IF;
  INSERT INTO public.financeiro_contas_pagar(barbearia_id,descricao,valor,data_vencimento,data_competencia,categoria_id)
    VALUES(v_a,'Histórico',10,current_date,current_date,(v_categoria->>'id')::uuid);
  SELECT updated_at INTO v_updated FROM public.financeiro_categorias WHERE id=(v_categoria->>'id')::uuid;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_editar_categoria((v_categoria->>'id')::uuid,'Materiais novos','saida','cmv',v_updated,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'CATEGORIA_COM_HISTORICO_EDITADA'; END IF;
  PERFORM public.financeiro_definir_categoria_ativa((v_categoria->>'id')::uuid,false,'desativa-cat-2c');
  PERFORM public.financeiro_criar_categoria('materiais','saida','cmv','categoria-2c-chave-03',NULL);
  v_erro:=NULL; BEGIN PERFORM public.financeiro_definir_categoria_ativa((v_categoria->>'id')::uuid,true,NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_NOME_ATIVO_EM_USO' THEN RAISE EXCEPTION 'ERRO_REATIVACAO_CATEGORIA_NAO_ESTAVEL: %',v_erro; END IF;

  SELECT jsonb_agg(to_jsonb(x)) INTO v_lista FROM public.financeiro_listar_contas_bancarias_cadastro(false) x;
  IF jsonb_array_length(v_lista)<>2 OR v_lista::text LIKE '%Conta secreta B%' OR NOT (v_lista->0 ? 'updated_at') OR (v_lista->0 ? 'barbearia_id') THEN
    RAISE EXCEPTION 'LEITURA_CONTAS_ATIVAS_INVALIDA: %',v_lista;
  END IF;
  SELECT jsonb_agg(to_jsonb(x)) INTO v_lista FROM public.financeiro_listar_contas_bancarias_cadastro(true) x;
  IF jsonb_array_length(v_lista)<>3 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_lista) e WHERE NOT (e->>'ativa')::boolean) THEN RAISE EXCEPTION 'LEITURA_CONTAS_INATIVAS_INVALIDA: %',v_lista; END IF;
  SELECT jsonb_agg(to_jsonb(x)) INTO v_lista FROM public.financeiro_listar_categorias_cadastro(false) x;
  IF jsonb_array_length(v_lista)<>2 OR v_lista::text LIKE '%Categoria secreta B%' OR NOT (v_lista->0 ? 'updated_at') OR (v_lista->0 ? 'barbearia_id') THEN
    RAISE EXCEPTION 'LEITURA_CATEGORIAS_ATIVAS_INVALIDA: %',v_lista;
  END IF;
  SELECT jsonb_agg(to_jsonb(x)) INTO v_lista FROM public.financeiro_listar_categorias_cadastro(true) x;
  IF jsonb_array_length(v_lista)<>3 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_lista) e WHERE NOT (e->>'ativa')::boolean) THEN RAISE EXCEPTION 'LEITURA_CATEGORIAS_INATIVAS_INVALIDA: %',v_lista; END IF;

  SELECT count(*) INTO v_audit FROM public.financeiro_audit_log WHERE barbearia_id=v_a AND correlation_id IN ('corr-2c','edicao-2c','principal-2c','substituta-2c','cat-2c','desativa-cat-2c');
  IF v_audit<6 THEN RAISE EXCEPTION 'AUDITORIA_INCOMPLETA: %',v_audit; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_nao_admin::text,true);
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_criar_categoria('Negada','saida','outros','categoria-negada-01',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'NAO_ADMIN_EXECUTOU_RPC'; END IF;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_listar_contas_bancarias_cadastro(false); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'NAO_ADMIN_LISTOU_CONTAS'; END IF;
  v_rejeitou:=false; BEGIN PERFORM public.financeiro_listar_categorias_cadastro(false); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END;
  IF NOT v_rejeitou THEN RAISE EXCEPTION 'NAO_ADMIN_LISTOU_CATEGORIAS'; END IF;
END $$;

DO $$
DECLARE v_funcao text; v_auth integer; v_anon integer; v_public integer;
BEGIN
  FOREACH v_funcao IN ARRAY ARRAY[
    'public.financeiro_pagar_conta(uuid,uuid,date,text,text)','public.financeiro_receber_conta(uuid,uuid,date,text,text)',
    'public.financeiro_transferir(uuid,uuid,numeric,date,text,text)','public.financeiro_credito_movimentar(uuid,text,numeric,text,text,text,text)',
    'public.financeiro_listar_categorias()','public.financeiro_listar_contas_bancarias()','public.financeiro_resumo_periodo(date,date)',
    'public.financeiro_listar_titulos(text,date,date,text,text,text,integer,integer)',
    'public.financeiro_criar_conta_bancaria(text,text,text,numeric,text,text)','public.financeiro_editar_conta_bancaria(uuid,text,text,text,timestamptz,text)',
    'public.financeiro_definir_conta_principal(uuid,text)','public.financeiro_definir_conta_ativa(uuid,boolean,uuid,text)',
    'public.financeiro_criar_categoria(text,text,text,text,text)','public.financeiro_editar_categoria(uuid,text,text,text,timestamptz,text)',
    'public.financeiro_definir_categoria_ativa(uuid,boolean,text)',
    'public.financeiro_listar_contas_bancarias_cadastro(boolean)','public.financeiro_listar_categorias_cadastro(boolean)'
  ] LOOP
    IF NOT has_function_privilege('authenticated',v_funcao,'EXECUTE') OR has_function_privilege('anon',v_funcao,'EXECUTE') OR has_function_privilege('public',v_funcao,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL_RPC_INVALIDA: %',v_funcao;
    END IF;
  END LOOP;
  SELECT count(*) FILTER(WHERE has_function_privilege('authenticated',p.oid,'EXECUTE')),
         count(*) FILTER(WHERE has_function_privilege('anon',p.oid,'EXECUTE')),
         count(*) FILTER(WHERE has_function_privilege('public',p.oid,'EXECUTE'))
    INTO v_auth,v_anon,v_public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'financeiro_%';
  IF v_auth<>28 OR v_anon<>0 OR v_public<>0 THEN RAISE EXCEPTION 'CONJUNTO_RPC_INVALIDO auth %, anon %, public %',v_auth,v_anon,v_public; END IF;
  IF has_table_privilege('authenticated','public.financeiro_idempotencia','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon','public.financeiro_idempotencia','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.financeiro_audit_log','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'TABELA_INTERNA_EXPOSTA'; END IF;
END $$;

ROLLBACK;
