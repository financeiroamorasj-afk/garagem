BEGIN;

DO $$
DECLARE
  v_tenant_a uuid := extensions.uuid_generate_v4();
  v_tenant_b uuid := extensions.uuid_generate_v4();
  v_admin_a uuid := extensions.uuid_generate_v4();
  v_admin_b uuid := extensions.uuid_generate_v4();
  v_conta_a1 uuid; v_conta_a2 uuid; v_categoria_a uuid;
  v_lista jsonb; v_resumo jsonb; v_rejeitou boolean;
BEGIN
  INSERT INTO public.barbearias(id,nome,slug) VALUES
    (v_tenant_a,'Tenant 2B A','tenant-2b-a'),(v_tenant_b,'Tenant 2B B','tenant-2b-b');
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES
    (v_admin_a,'authenticated','authenticated','admin-2b-a@local.test',now(),now()),
    (v_admin_b,'authenticated','authenticated','admin-2b-b@local.test',now(),now());
  INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES
    (v_admin_a,v_tenant_a,'admin','Admin A','admin-2b-a@local.test'),
    (v_admin_b,v_tenant_b,'admin','Admin B','admin-2b-b@local.test');
  INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre)
    VALUES(v_tenant_a,'Categoria A','ambos','outros') RETURNING id INTO v_categoria_a;
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial,conta_principal)
    VALUES(v_tenant_a,'Conta A1','corrente',100,true) RETURNING id INTO v_conta_a1;
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial)
    VALUES(v_tenant_a,'Conta A2','caixa',0) RETURNING id INTO v_conta_a2;
  INSERT INTO public.financeiro_contas_pagar(barbearia_id,descricao,valor,data_vencimento,data_competencia,status,categoria_id)
    VALUES
      (v_tenant_a,'Título A 1',10,current_date,current_date,'pendente',v_categoria_a),
      (v_tenant_a,'Título A 2',20,current_date+1,current_date,'pendente',v_categoria_a),
      (v_tenant_b,'Título secreto B',999,current_date,current_date,'pendente',NULL);

  PERFORM set_config('request.jwt.claim.sub',v_admin_a::text,true);
  v_lista := public.financeiro_listar_titulos('pagar',current_date,current_date+10,'pendente','valor','desc',1,1);
  IF (v_lista->>'total_itens')::integer <> 2 OR jsonb_array_length(v_lista->'items') <> 1 OR
     v_lista->'items'->0->>'descricao' <> 'Título A 2' OR v_lista::text LIKE '%Título secreto B%' THEN
    RAISE EXCEPTION 'LISTAGEM_PAGINACAO_OU_TENANT_INVALIDO: %',v_lista;
  END IF;
  v_lista := public.financeiro_listar_titulos('pagar',current_date,current_date+10,'pendente','data','asc',1,25);
  IF v_lista->'items'->0->>'descricao' <> 'Título A 1' OR v_lista->'items'->1->>'descricao' <> 'Título A 2' THEN RAISE EXCEPTION 'ORDEM_DETERMINISTICA_INVALIDA: %',v_lista; END IF;
  v_resumo := public.financeiro_resumo_periodo(current_date,current_date+10);
  IF jsonb_array_length(v_resumo->'contas') <> 2 OR jsonb_array_length(v_resumo->'serie') <> 11 OR
     v_resumo::text LIKE '%Título secreto B%' OR jsonb_typeof(v_resumo->'proximos_vencimentos') <> 'array' THEN
    RAISE EXCEPTION 'RESUMO_TENANT_OU_FORMATO_INVALIDO: %',v_resumo;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_admin_b::text,true);
  v_lista := public.financeiro_listar_titulos('pagar',current_date,current_date+10,NULL,'data','asc',1,25);
  IF (v_lista->>'total_itens')::integer <> 1 OR v_lista::text LIKE '%Título A%' THEN RAISE EXCEPTION 'ISOLAMENTO_TENANT_INVALIDO'; END IF;
  v_resumo := public.financeiro_resumo_periodo(current_date,current_date+10);
  IF jsonb_array_length(v_resumo->'contas') <> 0 OR v_resumo::text LIKE '%Título A%' THEN RAISE EXCEPTION 'RESUMO_VAZOU_TENANT'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_admin_a::text,true);
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos('outro',current_date,current_date,NULL,'data','asc',1,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'TIPO_INVALIDO_ACEITO'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos(NULL,current_date,current_date,NULL,'data','asc',1,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'TIPO_NULO_ACEITO'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos('pagar',current_date,current_date,'previsto','data','asc',1,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'STATUS_INVALIDO_ACEITO'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos('pagar',current_date,current_date,NULL,'sql','asc',1,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'ORDENACAO_INVALIDA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos('pagar',current_date,current_date,NULL,NULL,'asc',1,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'ORDENACAO_NULA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos('pagar',current_date,current_date,NULL,'data',NULL,1,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'DIRECAO_NULA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_listar_titulos('pagar',current_date,current_date,NULL,'data','asc',0,25); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'PAGINACAO_INVALIDA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_resumo_periodo(current_date,current_date+366); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'PERIODO_INVALIDO_ACEITO'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,0,current_date,'teste-zero-2b',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'TRANSFERENCIA_ZERO_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,-1,current_date,'teste-negativo-2b',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'TRANSFERENCIA_NEGATIVA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,1,NULL,'teste-data-nula',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'TRANSFERENCIA_DATA_NULA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,1,current_date,NULL,NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'CHAVE_NULA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,1,current_date,'   ',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'CHAVE_VAZIA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,1,current_date,'curta',NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'CHAVE_CURTA_ACEITA'; END IF;
  v_rejeitou := false; BEGIN PERFORM public.financeiro_transferir(v_conta_a1,v_conta_a2,1,current_date,repeat('x',201),NULL); EXCEPTION WHEN OTHERS THEN v_rejeitou:=true; END; IF NOT v_rejeitou THEN RAISE EXCEPTION 'CHAVE_LONGA_ACEITA'; END IF;
END $$;

DO $$
DECLARE v_funcao text; v_tabela text; v_auth_count integer; v_anon_count integer;
BEGIN
  FOREACH v_funcao IN ARRAY ARRAY[
    'public.financeiro_pagar_conta(uuid,uuid,date,text,text)',
    'public.financeiro_receber_conta(uuid,uuid,date,text,text)',
    'public.financeiro_transferir(uuid,uuid,numeric,date,text,text)',
    'public.financeiro_credito_movimentar(uuid,text,numeric,text,text,text,text)',
    'public.financeiro_listar_categorias()','public.financeiro_listar_contas_bancarias()',
    'public.financeiro_resumo_periodo(date,date)',
    'public.financeiro_listar_titulos(text,date,date,text,text,text,integer,integer)'
  ] LOOP
    IF NOT has_function_privilege('authenticated',v_funcao,'EXECUTE') OR has_function_privilege('anon',v_funcao,'EXECUTE') THEN RAISE EXCEPTION 'ACL_RPC_INVALIDA: %',v_funcao; END IF;
  END LOOP;
  SELECT count(*) FILTER (WHERE has_function_privilege('authenticated',p.oid,'EXECUTE')),
         count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE'))
    INTO v_auth_count,v_anon_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'financeiro_%';
  IF v_auth_count<>8 OR v_anon_count<>0 THEN RAISE EXCEPTION 'CONJUNTO_RPC_EXPOSTO_INVALIDO: auth %, anon %',v_auth_count,v_anon_count; END IF;
  IF has_function_privilege('authenticated','public.financeiro_assert_admin()','EXECUTE') OR has_function_privilege('authenticated','public.financeiro_auditar(uuid,text,text,uuid,jsonb,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'HELPER_INTERNO_EXPOSTO'; END IF;
  FOREACH v_tabela IN ARRAY ARRAY['financeiro_categorias','financeiro_contas_bancarias','financeiro_contas_pagar','financeiro_contas_receber','financeiro_movimentacoes','financeiro_creditos_clientes','financeiro_creditos_movimentacoes','financeiro_audit_log'] LOOP
    IF has_table_privilege('authenticated','public.'||v_tabela,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon','public.'||v_tabela,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'TABELA_EXPOSTA: %',v_tabela; END IF;
  END LOOP;
END $$;

ROLLBACK;
