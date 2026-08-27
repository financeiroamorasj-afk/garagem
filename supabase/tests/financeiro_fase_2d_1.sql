BEGIN;

DO $$
DECLARE
  v_b uuid:=extensions.uuid_generate_v4();
  v_outro uuid:=extensions.uuid_generate_v4();
  v_admin uuid:=extensions.uuid_generate_v4();
  v_conta uuid;
  v_conta_outro uuid;
  v_env uuid;
  v_env_inativo uuid;
  v_env_outro uuid;
  v_resp jsonb;
  v_retry jsonb;
  v_extrato jsonb;
  v_saldo_banco numeric;
  v_movimentos bigint;
  v_reservado numeric;
  v_disponivel numeric;
  v_erro text;
  v_qtd bigint;
BEGIN
  INSERT INTO public.barbearias(id,nome,slug) VALUES
    (v_b,'Tenant aporte 2D1','tenant-aporte-2d1'),
    (v_outro,'Tenant externo 2D1','tenant-externo-2d1');
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
    VALUES(v_admin,'authenticated','authenticated','admin-aporte-2d1@local.test',now(),now());
  INSERT INTO public.profiles(id,barbearia_id,role,nome,email)
    VALUES(v_admin,v_b,'admin','Admin aporte 2D1','admin-aporte-2d1@local.test');
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial,conta_principal)
    VALUES(v_b,'Conta aporte','corrente',100,true) RETURNING id INTO v_conta;
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial,conta_principal)
    VALUES(v_outro,'Conta externa','corrente',100,true) RETURNING id INTO v_conta_outro;
  INSERT INTO public.financeiro_envelopes(barbearia_id,conta_bancaria_id,nome,finalidade,saldo_acumulado)
    VALUES(v_b,v_conta,'Reserva aporte','reserva',20) RETURNING id INTO v_env;
  INSERT INTO public.financeiro_envelopes(barbearia_id,conta_bancaria_id,nome,finalidade,ativa)
    VALUES(v_b,v_conta,'Reserva inativa','outros',false) RETURNING id INTO v_env_inativo;
  INSERT INTO public.financeiro_envelopes(barbearia_id,conta_bancaria_id,nome,finalidade)
    VALUES(v_outro,v_conta_outro,'Reserva externa','reserva') RETURNING id INTO v_env_outro;

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  v_saldo_banco:=public.financeiro_envelope_saldo_bancario(v_b,v_conta,NULL);
  SELECT count(*) INTO v_movimentos FROM public.financeiro_movimentacoes WHERE barbearia_id=v_b;

  v_resp:=public.financeiro_aportar_envelope(v_env,30,'aporte-avulso-01','corr-aporte-01');
  IF (v_resp->>'valor')::numeric<>30 OR (v_resp->>'saldo_antes')::numeric<>20
     OR (v_resp->>'saldo_depois')::numeric<>50 OR (v_resp->>'disponivel_antes')::numeric<>80
     OR (v_resp->>'idempotente')::boolean THEN RAISE EXCEPTION 'RESPOSTA_APORTE_INVALIDA: %',v_resp; END IF;
  SELECT saldo_reservado,saldo_disponivel INTO v_reservado,v_disponivel
    FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=v_conta;
  IF v_reservado<>50 OR v_disponivel<>50 THEN RAISE EXCEPTION 'DISPONIBILIDADE_APORTE_INVALIDA: %, %',v_reservado,v_disponivel; END IF;
  IF public.financeiro_envelope_saldo_bancario(v_b,v_conta,NULL)<>v_saldo_banco THEN RAISE EXCEPTION 'APORTE_ALTEROU_SALDO_BANCARIO'; END IF;
  IF (SELECT count(*) FROM public.financeiro_movimentacoes WHERE barbearia_id=v_b)<>v_movimentos THEN RAISE EXCEPTION 'APORTE_CRIou_MOVIMENTACAO'; END IF;

  v_extrato:=public.financeiro_listar_transacoes_envelope(v_env,public.financeiro_data_brt(),public.financeiro_data_brt(),1,25);
  IF v_extrato#>>'{items,0,tipo}'<>'aporte_avulso' OR v_extrato#>>'{items,0,direcao}'<>'credito'
     OR (v_extrato#>>'{items,0,valor}')::numeric<>30 OR (v_extrato#>>'{items,0,saldo_depois}')::numeric<>50
     THEN RAISE EXCEPTION 'EXTRATO_APORTE_INVALIDO: %',v_extrato; END IF;

  v_retry:=public.financeiro_aportar_envelope(v_env,30,' aporte-avulso-01 ','corr-ignorada');
  IF NOT (v_retry->>'idempotente')::boolean OR v_retry->>'transacao_id'<>v_resp->>'transacao_id' THEN RAISE EXCEPTION 'RETRY_NAO_IDEMPOTENTE: %',v_retry; END IF;
  SELECT count(*) INTO v_qtd FROM public.financeiro_envelopes_transacoes WHERE envelope_id=v_env AND tipo='aporte_avulso';
  IF v_qtd<>1 OR (SELECT saldo_acumulado FROM public.financeiro_envelopes WHERE id=v_env)<>50 THEN RAISE EXCEPTION 'RETRY_DUPLICOU_APORTE'; END IF;

  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env,31,'aporte-avulso-01',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE' THEN RAISE EXCEPTION 'PAYLOAD_DIVERGENTE_ACEITO: %',v_erro; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env,51,'aporte-excesso-01',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE' THEN RAISE EXCEPTION 'APORTE_EXCESSIVO_ACEITO: %',v_erro; END IF;
  IF (SELECT saldo_acumulado FROM public.financeiro_envelopes WHERE id=v_env)<>50 OR (SELECT count(*) FROM public.financeiro_envelopes_transacoes WHERE envelope_id=v_env)<>1 THEN RAISE EXCEPTION 'FALHA_PARCIAL_APORTE_EXCESSIVO'; END IF;

  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env_inativo,1,'aporte-inativo-01',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_ENVELOPE_INATIVO' THEN RAISE EXCEPTION 'ENVELOPE_INATIVO_ACEITO: %',v_erro; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env_outro,1,'aporte-tenant-01',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO' THEN RAISE EXCEPTION 'TENANT_CRUZADO_ACEITO: %',v_erro; END IF;

  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env,0,'aporte-zero-001',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_VALOR_INVALIDO' THEN RAISE EXCEPTION 'ZERO_ACEITO: %',v_erro; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env,-1,'aporte-negativo',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_VALOR_INVALIDO' THEN RAISE EXCEPTION 'NEGATIVO_ACEITO: %',v_erro; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_aportar_envelope(v_env,0.004,'aporte-arredonda',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_VALOR_INVALIDO' THEN RAISE EXCEPTION 'ARREDONDADO_ZERO_ACEITO: %',v_erro; END IF;
  FOREACH v_erro IN ARRAY ARRAY['NaN','Infinity','-Infinity'] LOOP
    BEGIN PERFORM public.financeiro_aportar_envelope(v_env,v_erro::numeric,'aporte-finito-'||lower(replace(v_erro,'-','n')),NULL); RAISE EXCEPTION 'NAO_FINITO_ACEITO';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'FINANCEIRO_VALOR_INVALIDO' THEN RAISE; END IF; END;
  END LOOP;

  IF NOT EXISTS(
    SELECT 1 FROM public.financeiro_audit_log
    WHERE barbearia_id=v_b AND entidade='financeiro_envelopes' AND entidade_id=v_env
      AND correlation_id='corr-aporte-01' AND antes->>'saldo_acumulado'='20.00' AND depois->>'saldo_acumulado'='50.00'
  ) THEN RAISE EXCEPTION 'AUDITORIA_APORTE_INVALIDA'; END IF;
END $$;

DO $$
DECLARE v_auth bigint; v_anon bigint; v_public bigint;
BEGIN
  IF NOT has_function_privilege('authenticated','public.financeiro_aportar_envelope(uuid,numeric,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.financeiro_aportar_envelope(uuid,numeric,text,text)','EXECUTE')
     OR has_function_privilege('public','public.financeiro_aportar_envelope(uuid,numeric,text,text)','EXECUTE')
     THEN RAISE EXCEPTION 'ACL_APORTE_INVALIDA'; END IF;
  SELECT count(*) FILTER(WHERE has_function_privilege('authenticated',p.oid,'EXECUTE')),
         count(*) FILTER(WHERE has_function_privilege('anon',p.oid,'EXECUTE')),
         count(*) FILTER(WHERE has_function_privilege('public',p.oid,'EXECUTE'))
    INTO v_auth,v_anon,v_public
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'financeiro_%';
  IF v_auth<>28 OR v_anon<>0 OR v_public<>0 THEN RAISE EXCEPTION 'CONJUNTO_RPC_INVALIDO auth %, anon %, public %',v_auth,v_anon,v_public; END IF;
  IF has_function_privilege('authenticated','public.financeiro_validar_debito_disponivel(uuid,uuid,numeric)','EXECUTE')
     OR has_table_privilege('authenticated','public.financeiro_idempotencia','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.financeiro_envelopes_transacoes','INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon','public.financeiro_audit_log','SELECT,INSERT,UPDATE,DELETE')
     THEN RAISE EXCEPTION 'INTERNO_EXPOSTO_APOS_APORTE'; END IF;
END $$;

ROLLBACK;
