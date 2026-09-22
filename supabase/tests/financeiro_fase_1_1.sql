BEGIN;

DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid := extensions.uuid_generate_v4();
  v_admin uuid := extensions.uuid_generate_v4();
  v_categoria uuid;
  v_rejeitada boolean := false;
BEGIN
  SELECT id INTO v_tenant_a FROM public.barbearias ORDER BY criado_em NULLS LAST LIMIT 1;
  IF v_tenant_a IS NULL THEN
    v_tenant_a := extensions.uuid_generate_v4();
    INSERT INTO public.barbearias (id, nome, slug) VALUES (v_tenant_a, 'Tenant A teste', 'tenant-a-teste');
  END IF;

  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
    VALUES (v_admin, 'authenticated', 'authenticated', 'admin-fase-1-1@local.test', now(), now());
  INSERT INTO public.profiles (id, barbearia_id, role, nome, email)
    VALUES (v_admin, v_tenant_a, 'admin', 'Admin teste', 'admin-fase-1-1@local.test');
  INSERT INTO public.clientes (barbearia_id, nome, telefone)
    VALUES (v_tenant_a, 'Cliente teste', '00000000000');

  INSERT INTO public.barbearias (id, nome, slug) VALUES (v_tenant_b, 'Tenant FK teste', 'tenant-fk-teste');
  INSERT INTO public.financeiro_categorias (barbearia_id, nome, tipo, grupo_dre)
    VALUES (v_tenant_a, 'Categoria FK teste', 'saida', 'outros') RETURNING id INTO v_categoria;

  BEGIN
    INSERT INTO public.financeiro_contas_pagar
      (barbearia_id, descricao, valor, data_vencimento, data_competencia, categoria_id)
    VALUES
      (v_tenant_b, 'Deve falhar por tenant cruzado', 10, current_date, current_date, v_categoria);
  EXCEPTION WHEN foreign_key_violation THEN
    v_rejeitada := true;
  END;
  IF NOT v_rejeitada THEN RAISE EXCEPTION 'FK_COMPOSTA_NAO_REJEITOU_TENANT_CRUZADO'; END IF;
END $$;

DO $$
DECLARE
  v_admin uuid;
  v_cliente uuid;
  v_chave text := 'teste-fase-1-1-idempotencia';
  v_primeiro jsonb;
  v_segundo jsonb;
  v_qtd integer;
BEGIN
  SELECT p.id INTO v_admin FROM public.profiles p WHERE p.role IN ('admin', 'master') LIMIT 1;
  SELECT c.id INTO v_cliente FROM public.clientes c JOIN public.profiles p ON p.barbearia_id = c.barbearia_id WHERE p.id = v_admin LIMIT 1;
  IF v_admin IS NULL OR v_cliente IS NULL THEN RAISE EXCEPTION 'TESTE_SEM_ADMIN_OU_CLIENTE'; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  v_primeiro := public.financeiro_credito_movimentar(v_cliente, 'emissao', 10, 'teste_local', v_chave, NULL, 'teste-local');
  v_segundo := public.financeiro_credito_movimentar(v_cliente, 'emissao', 10, 'teste_local', v_chave, NULL, 'teste-local');
  IF v_primeiro <> v_segundo THEN RAISE EXCEPTION 'RPC_IDEMPOTENTE_RETORNO_DIVERGENTE'; END IF;

  SELECT count(*) INTO v_qtd FROM public.financeiro_creditos_movimentacoes WHERE idempotency_key = v_chave;
  IF v_qtd <> 1 THEN RAISE EXCEPTION 'RPC_IDEMPOTENTE_DUPLICOU_RAZAO: %', v_qtd; END IF;
END $$;

DO $$
DECLARE
  v_funcoes text[] := ARRAY[
    'public.financeiro_pagar_conta(uuid,uuid,date,text,text)',
    'public.financeiro_receber_conta(uuid,uuid,date,text,text)',
    'public.financeiro_transferir(uuid,uuid,numeric,date,text,text)',
    'public.financeiro_credito_movimentar(uuid,text,numeric,text,text,text,text)',
    'public.financeiro_listar_categorias()',
    'public.financeiro_listar_contas_bancarias()'
  ];
  v_funcao text;
BEGIN
  FOREACH v_funcao IN ARRAY v_funcoes LOOP
    IF NOT has_function_privilege('authenticated', v_funcao, 'EXECUTE') THEN
      RAISE EXCEPTION 'AUTHENTICATED_SEM_EXECUTE: %', v_funcao;
    END IF;
    -- anon tambem herda privilegios concedidos a PUBLIC.
    IF has_function_privilege('anon', v_funcao, 'EXECUTE') THEN
      RAISE EXCEPTION 'RPC_EXPOSTA: %', v_funcao;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.financeiro_assert_admin()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.financeiro_auditar(uuid,text,text,uuid,jsonb,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'HELPER_INTERNO_EXPOSTO';
  END IF;
END $$;

DO $$
DECLARE
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY[
    'financeiro_categorias','financeiro_contas_bancarias','financeiro_contas_pagar',
    'financeiro_contas_receber','financeiro_movimentacoes','financeiro_creditos_clientes',
    'financeiro_creditos_movimentacoes','financeiro_audit_log'
  ] LOOP
    IF has_table_privilege('authenticated', 'public.' || v_tabela, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.' || v_tabela, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'TABELA_FINANCEIRA_EXPOSTA: %', v_tabela;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
