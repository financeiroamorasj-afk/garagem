BEGIN;

DO $$
DECLARE
  v_b uuid:=extensions.uuid_generate_v4(); v_outro uuid:=extensions.uuid_generate_v4(); v_admin uuid:=extensions.uuid_generate_v4();
  v_conta uuid; v_conta2 uuid; v_cat_e uuid; v_cat_s uuid; v_env1 jsonb; v_env2 jsonb; v_env_zero jsonb; v_dist jsonb; v_dist_retry jsonb;
  v_cp uuid; v_resgate jsonb; v_estorno jsonb; v_saldo_banco numeric; v_reservado numeric; v_disponivel numeric; v_qtd integer; v_erro text; v_updated timestamptz;
BEGIN
  INSERT INTO public.barbearias(id,nome,slug) VALUES(v_b,'Tenant 2D','tenant-2d'),(v_outro,'Tenant secreto 2D','tenant-secreto-2d');
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(v_admin,'authenticated','authenticated','admin-2d@local.test',now(),now());
  INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES(v_admin,v_b,'admin','Admin 2D','admin-2d@local.test');
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial,conta_principal) VALUES(v_b,'Conta 2D','corrente',500,true) RETURNING id INTO v_conta;
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial) VALUES(v_b,'Outra conta 2D','corrente',0) RETURNING id INTO v_conta2;
  INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES(v_b,'Receita 2D','entrada','receita_servicos') RETURNING id INTO v_cat_e;
  INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES(v_b,'Despesa 2D','saida','despesa_variavel') RETURNING id INTO v_cat_s;
  INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,descricao,status) VALUES
    (v_b,v_conta,'entrada',150,'2026-08-24','2026-08-24',v_cat_e,'conta_receber','Receita bruta','efetivado'),
    (v_b,v_conta,'saida',40,'2026-08-24','2026-08-24',v_cat_s,'conta_pagar','Despesa paga','efetivado'),
    (v_b,v_conta,'saida',10,'2026-08-24','2026-08-24',NULL,'taxa_cartao','Taxa','efetivado'),
    (v_b,v_conta,'entrada',999,'2026-08-24','2026-08-24',NULL,'transferencia','Transferência excluída','efetivado'),
    (v_b,v_conta,'entrada',888,'2026-08-24','2026-08-24',NULL,'credito_cliente','Crédito excluído','efetivado'),
    (v_b,v_conta,'entrada',777,'2026-08-24','2026-08-24',NULL,'ajuste','Ajuste excluído','efetivado'),
    (v_b,v_conta,'entrada',666,'2026-08-24','2026-08-24',NULL,'conta_receber','Estornada','estornado');

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  v_env1:=public.financeiro_criar_envelope(v_conta,'Reserva','reserva',60,'env-create-2d-01','corr-create');
  v_env2:=public.financeiro_criar_envelope(v_conta,'Reinvestimento','reinvestimento',30,'env-create-2d-02',NULL);
  IF NOT (public.financeiro_criar_envelope(v_conta,'Reserva','reserva',60,'env-create-2d-01','corr-create')->>'idempotente')::boolean THEN RAISE EXCEPTION 'RETRY_CRIACAO_NAO_IDEMPOTENTE'; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_criar_envelope(v_conta,'Excesso','outros',11,'env-create-2d-03',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_PERCENTUAL_TOTAL_EXCEDIDO' THEN RAISE EXCEPTION 'PERCENTUAL_EXCEDENTE_ACEITO: %',v_erro; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_criar_envelope(v_conta,'Inválido','outros',-1,'env-create-2d-04',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_PERCENTUAL_INVALIDO' THEN RAISE EXCEPTION 'PERCENTUAL_INVALIDO_ACEITO: %',v_erro; END IF;

  SELECT public.financeiro_envelope_saldo_bancario(v_b,v_conta,NULL) INTO v_saldo_banco;
  IF v_saldo_banco<>3264 THEN RAISE EXCEPTION 'FIXTURE_SALDO_BANCARIO_INVALIDA: %',v_saldo_banco; END IF;
  v_dist:=public.financeiro_distribuir_envelopes_diario('2026-08-24','dist-dia-2d-01','corr-dist');
  IF (v_dist->>'base_distribuivel')::numeric<>100 OR (v_dist->>'valor_distribuido')::numeric<>90 THEN RAISE EXCEPTION 'FORMULA_OU_RESIDUO_INVALIDO: %',v_dist; END IF;
  v_dist_retry:=public.financeiro_distribuir_envelopes_diario('2026-08-24','dist-dia-2d-01','corr-dist');
  IF NOT (v_dist_retry->>'idempotente')::boolean THEN RAISE EXCEPTION 'DISTRIBUICAO_NAO_IDEMPOTENTE'; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_distribuir_envelopes_diario('2026-08-24','dist-dia-2d-02',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_DISTRIBUICAO_JA_REALIZADA' THEN RAISE EXCEPTION 'DIA_REPETIDO_ACEITO: %',v_erro; END IF;
  IF public.financeiro_envelope_saldo_bancario(v_b,v_conta,NULL)<>v_saldo_banco THEN RAISE EXCEPTION 'DISTRIBUICAO_ALTEROU_LEDGER'; END IF;
  SELECT saldo_reservado,saldo_disponivel INTO v_reservado,v_disponivel FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=v_conta;
  IF v_reservado<>90 OR v_disponivel<>v_saldo_banco-90 THEN RAISE EXCEPTION 'DISPONIBILIDADE_INVALIDA %, %',v_reservado,v_disponivel; END IF;

  v_erro:=NULL; BEGIN PERFORM public.financeiro_definir_envelope_ativo((v_env1->>'id')::uuid,false,'env-disable-2d-01',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_ENVELOPE_COM_SALDO' THEN RAISE EXCEPTION 'ENVELOPE_COM_SALDO_DESATIVADO: %',v_erro; END IF;
  SELECT saldo_reservado,saldo_disponivel INTO v_reservado,v_disponivel FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=v_conta;
  IF v_reservado<>90 OR v_disponivel<>v_saldo_banco-90 THEN RAISE EXCEPTION 'FALHA_DESATIVACAO_LIBEROU_RESERVA'; END IF;
  SELECT updated_at INTO v_updated FROM public.financeiro_envelopes WHERE id=(v_env2->>'id')::uuid;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_editar_envelope((v_env2->>'id')::uuid,v_conta2,'Reinvestimento','reinvestimento',30,v_updated,'env-move-2d-01',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_CONTA_ENVELOPE_COM_SALDO' THEN RAISE EXCEPTION 'RESERVA_DESLOCADA_ENTRE_CONTAS: %',v_erro; END IF;
  IF EXISTS(SELECT 1 FROM public.financeiro_envelopes WHERE id=(v_env2->>'id')::uuid AND conta_bancaria_id<>v_conta) THEN RAISE EXCEPTION 'CONTA_ALTERADA_APOS_REJEICAO'; END IF;

  v_env_zero:=public.financeiro_criar_envelope(v_conta,'Envelope vazio','outros',NULL,'env-create-zero-01',NULL);
  PERFORM public.financeiro_definir_envelope_ativo((v_env_zero->>'id')::uuid,false,'env-disable-zero-01',NULL);
  PERFORM public.financeiro_definir_envelope_ativo((v_env_zero->>'id')::uuid,true,'env-enable-zero-01',NULL);
  SELECT updated_at INTO v_updated FROM public.financeiro_envelopes WHERE id=(v_env_zero->>'id')::uuid;
  PERFORM public.financeiro_editar_envelope((v_env_zero->>'id')::uuid,v_conta2,'Envelope vazio','outros',NULL,v_updated,'env-move-zero-01',NULL);
  IF NOT EXISTS(SELECT 1 FROM public.financeiro_envelopes WHERE id=(v_env_zero->>'id')::uuid AND conta_bancaria_id=v_conta2 AND ativa) THEN RAISE EXCEPTION 'ENVELOPE_VAZIO_NAO_MUDOU_DE_CONTA'; END IF;

  INSERT INTO public.financeiro_contas_pagar(barbearia_id,descricao,valor,data_vencimento,data_competencia,status,categoria_id,origem)
    VALUES(v_b,'Título manual 2D',30,'2026-08-25','2026-08-25','pendente',v_cat_s,'manual') RETURNING id INTO v_cp;
  v_resgate:=public.financeiro_resgatar_envelope((v_env1->>'id')::uuid,v_cp,30,'2026-08-25','resgate-2d-01','corr-resgate');
  IF public.financeiro_envelope_saldo_bancario(v_b,v_conta,NULL)<>v_saldo_banco THEN RAISE EXCEPTION 'RESGATE_ALTEROU_LEDGER'; END IF;
  SELECT saldo_reservado INTO v_reservado FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=v_conta;
  IF v_reservado<>60 THEN RAISE EXCEPTION 'RESGATE_NAO_RESTAURou_DISPONIBILIDADE'; END IF;
  v_estorno:=public.financeiro_estornar_resgate_envelope((v_resgate->>'transacao_id')::uuid,'estorno-2d-01','corr-estorno');
  v_erro:=NULL; BEGIN PERFORM public.financeiro_estornar_resgate_envelope((v_resgate->>'transacao_id')::uuid,'estorno-2d-02',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_TRANSACAO_JA_ESTORNADA' THEN RAISE EXCEPTION 'SEGUNDO_ESTORNO_ACEITO: %',v_erro; END IF;
  v_resgate:=public.financeiro_resgatar_envelope((v_env1->>'id')::uuid,v_cp,30,'2026-08-25','resgate-2d-02',NULL);
  v_erro:=NULL; BEGIN PERFORM public.financeiro_pagar_conta(v_cp,v_conta2,'2026-08-25','pagamento-2d-errado',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_CONTA_DIVERGENTE_RESGATE' THEN RAISE EXCEPTION 'PAGAMENTO_CONTA_DIVERGENTE_ACEITO: %',v_erro; END IF;
  PERFORM public.financeiro_pagar_conta(v_cp,v_conta,'2026-08-25','pagamento-2d-certo',NULL);
  SELECT count(*) INTO v_qtd FROM public.financeiro_movimentacoes WHERE barbearia_id=v_b AND conta_pagar_id=v_cp AND status='efetivado';
  IF v_qtd<>1 THEN RAISE EXCEPTION 'PAGAMENTO_GEROU_QUANTIDADE_INVALIDA_DE_SAIDAS: %',v_qtd; END IF;

  SELECT updated_at INTO v_updated FROM public.financeiro_envelopes WHERE id=(v_env2->>'id')::uuid;
  PERFORM public.financeiro_editar_envelope((v_env2->>'id')::uuid,v_conta,'Reinvestimento','reinvestimento',25,v_updated,'env-edit-2d-01',NULL);
  v_erro:=NULL; BEGIN PERFORM public.financeiro_editar_envelope((v_env2->>'id')::uuid,v_conta,'Stale','outros',20,v_updated,'env-edit-2d-02',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_CONFLITO_VERSAO' THEN RAISE EXCEPTION 'VERSAO_OTIMISTA_NAO_APLICADA: %',v_erro; END IF;

  IF public.financeiro_data_brt('2026-08-25 02:59:59+00')<>'2026-08-24' OR public.financeiro_data_brt('2026-08-25 03:00:00+00')<>'2026-08-25' THEN RAISE EXCEPTION 'FRONTEIRA_BRT_INVALIDA'; END IF;
  IF EXISTS(SELECT 1 FROM public.financeiro_envelopes WHERE barbearia_id=v_outro) THEN RAISE EXCEPTION 'TENANT_CRUZADO'; END IF;
  SELECT count(*) INTO v_qtd FROM public.financeiro_audit_log WHERE barbearia_id=v_b AND correlation_id IN ('corr-create','corr-dist','corr-resgate','corr-estorno');
  IF v_qtd<4 THEN RAISE EXCEPTION 'AUDITORIA_INCOMPLETA: %',v_qtd; END IF;
END $$;

DO $$
DECLARE
  v_b uuid:=extensions.uuid_generate_v4(); v_outro uuid:=extensions.uuid_generate_v4(); v_admin uuid:=extensions.uuid_generate_v4(); v_origem uuid; v_destino uuid; v_conta_outro uuid; v_cat uuid;
  v_env_a jsonb; v_env_b jsonb; v_erro text; v_dist jsonb; v_resgate jsonb; v_pagamento jsonb; v_retry jsonb; v_cp_bloqueado uuid; v_cp_resgate uuid; v_qtd integer; v_saldo_origem numeric; v_saldo_destino numeric; v_reservado numeric; v_disponivel numeric;
BEGIN
  INSERT INTO public.barbearias(id,nome,slug) VALUES(v_b,'Tenant agregado 2D','tenant-agregado-2d'),(v_outro,'Outro tenant agregado','outro-tenant-agregado');
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(v_admin,'authenticated','authenticated','admin-agregado-2d@local.test',now(),now());
  INSERT INTO public.profiles(id,barbearia_id,role,nome,email) VALUES(v_admin,v_b,'admin','Admin agregado','admin-agregado-2d@local.test');
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial,conta_principal) VALUES(v_b,'Conta com caixa','corrente',0,true) RETURNING id INTO v_origem;
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial) VALUES(v_b,'Conta dos envelopes','corrente',0) RETURNING id INTO v_destino;
  INSERT INTO public.financeiro_contas_bancarias(barbearia_id,nome,tipo,saldo_inicial,conta_principal) VALUES(v_outro,'Conta outro tenant','corrente',100000,true) RETURNING id INTO v_conta_outro;
  INSERT INTO public.financeiro_envelopes(barbearia_id,conta_bancaria_id,nome,finalidade,saldo_acumulado) VALUES(v_outro,v_conta_outro,'Reserva outro tenant','reserva',100000);
  INSERT INTO public.financeiro_categorias(barbearia_id,nome,tipo,grupo_dre) VALUES(v_b,'Receita agregada','entrada','receita_servicos') RETURNING id INTO v_cat;
  INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,descricao)
    VALUES(v_b,v_origem,'entrada',100,'2026-08-23','2026-08-23',v_cat,'conta_receber','Receita agregada');
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  v_env_a:=public.financeiro_criar_envelope(v_destino,'Agregado A','reserva',25,'env-aggregate-a-01',NULL);
  v_env_b:=public.financeiro_criar_envelope(v_destino,'Agregado B','reinvestimento',25,'env-aggregate-b-01',NULL);
  v_erro:=NULL; BEGIN PERFORM public.financeiro_distribuir_envelopes_diario('2026-08-23','dist-aggregate-fail',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_DISPONIBILIDADE_CONTA_VINCULADA_INSUFICIENTE' THEN RAISE EXCEPTION 'CONTA_SEM_DISPONIBILIDADE_ACEITA: %',v_erro; END IF;
  IF EXISTS(SELECT 1 FROM public.financeiro_envelopes_distribuicoes WHERE barbearia_id=v_b) THEN RAISE EXCEPTION 'FALHA_DE_DISTRIBUICAO_PERSISTIU_CABECALHO'; END IF;
  PERFORM public.financeiro_transferir(v_origem,v_destino,50,'2026-08-23','transfer-aggregate-01',NULL);
  IF public.financeiro_envelope_lucro_diario(v_b,'2026-08-23')<>100 THEN RAISE EXCEPTION 'TRANSFERENCIA_ENTROU_NO_LUCRO'; END IF;
  v_saldo_origem:=public.financeiro_envelope_saldo_bancario(v_b,v_origem,NULL); v_saldo_destino:=public.financeiro_envelope_saldo_bancario(v_b,v_destino,NULL);
  v_dist:=public.financeiro_distribuir_envelopes_diario('2026-08-23','dist-aggregate-ok',NULL);
  IF (v_dist->>'valor_distribuido')::numeric<>50 THEN RAISE EXCEPTION 'AGREGACAO_DISTRIBUIDA_INVALIDA: %',v_dist; END IF;
  SELECT count(*),sum(valor) INTO v_qtd,v_reservado FROM public.financeiro_envelopes_transacoes WHERE barbearia_id=v_b AND tipo='distribuicao';
  IF v_qtd<>2 OR v_reservado<>50 THEN RAISE EXCEPTION 'ITENS_AGREGADOS_INVALIDOS: %, %',v_qtd,v_reservado; END IF;
  SELECT saldo_reservado,saldo_disponivel INTO v_reservado,v_disponivel FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=v_destino;
  IF v_reservado<>50 OR v_disponivel<>0 THEN RAISE EXCEPTION 'DISPONIBILIDADE_AGREGADA_INVALIDA: %, %',v_reservado,v_disponivel; END IF;
  IF public.financeiro_envelope_saldo_bancario(v_b,v_origem,NULL)<>v_saldo_origem OR public.financeiro_envelope_saldo_bancario(v_b,v_destino,NULL)<>v_saldo_destino THEN RAISE EXCEPTION 'DISTRIBUICAO_ALTEROU_SALDO_BANCARIO'; END IF;

  INSERT INTO public.financeiro_contas_pagar(barbearia_id,descricao,valor,data_vencimento,data_competencia,origem)
    VALUES(v_b,'Pagamento sem disponibilidade',1,'2026-08-23','2026-08-23','manual') RETURNING id INTO v_cp_bloqueado;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_pagar_conta(v_cp_bloqueado,v_destino,'2026-08-23','pay-available-fail',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE' THEN RAISE EXCEPTION 'PAGAMENTO_CONSUMIU_RESERVA: %',v_erro; END IF;
  v_erro:=NULL; BEGIN PERFORM public.financeiro_transferir(v_destino,v_origem,1,'2026-08-23','transfer-available-fail',NULL); EXCEPTION WHEN OTHERS THEN v_erro:=SQLERRM; END;
  IF v_erro IS DISTINCT FROM 'FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE' THEN RAISE EXCEPTION 'TRANSFERENCIA_CONSUMIU_RESERVA: %',v_erro; END IF;

  INSERT INTO public.financeiro_contas_pagar(barbearia_id,descricao,valor,data_vencimento,data_competencia,origem)
    VALUES(v_b,'Pagamento com resgate',25,'2026-08-23','2026-08-23','manual') RETURNING id INTO v_cp_resgate;
  v_resgate:=public.financeiro_resgatar_envelope((v_env_a->>'id')::uuid,v_cp_resgate,25,'2026-08-23','resgate-available-ok',NULL);
  v_pagamento:=public.financeiro_pagar_conta(v_cp_resgate,v_destino,'2026-08-23','pay-available-ok',NULL);
  v_retry:=public.financeiro_pagar_conta(v_cp_resgate,v_destino,'2026-08-23','pay-available-ok',NULL);
  IF NOT (v_retry->>'idempotente')::boolean OR v_retry->>'movimentacao_id'<>v_pagamento->>'movimentacao_id' THEN RAISE EXCEPTION 'RETRY_PAGAMENTO_DUPLICOU_SAIDA'; END IF;
  SELECT count(*) INTO v_qtd FROM public.financeiro_movimentacoes WHERE barbearia_id=v_b AND conta_pagar_id=v_cp_resgate;
  IF v_qtd<>1 THEN RAISE EXCEPTION 'PAGAMENTO_RESGATADO_GEROU_SAIDAS_INVALIDAS: %',v_qtd; END IF;
  SELECT saldo_reservado,saldo_disponivel INTO v_reservado,v_disponivel FROM public.financeiro_saldos_disponiveis_contas() WHERE conta_bancaria_id=v_destino;
  IF v_reservado<>25 OR v_disponivel<>0 THEN RAISE EXCEPTION 'DISPONIBILIDADE_APOS_PAGAMENTO_INVALIDA: %, %',v_reservado,v_disponivel; END IF;
END $$;

DO $$
DECLARE v_f text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'public.financeiro_listar_envelopes(boolean)','public.financeiro_criar_envelope(uuid,text,text,numeric,text,text)',
    'public.financeiro_editar_envelope(uuid,uuid,text,text,numeric,timestamptz,text,text)','public.financeiro_definir_envelope_ativo(uuid,boolean,text,text)',
    'public.financeiro_simular_distribuicao_diaria(date)','public.financeiro_distribuir_envelopes_diario(date,text,text)',
    'public.financeiro_resgatar_envelope(uuid,uuid,numeric,date,text,text)','public.financeiro_estornar_resgate_envelope(uuid,text,text)',
    'public.financeiro_listar_transacoes_envelope(uuid,date,date,integer,integer)','public.financeiro_saldos_disponiveis_contas()'
  ] LOOP
    IF NOT has_function_privilege('authenticated',v_f,'EXECUTE') OR has_function_privilege('anon',v_f,'EXECUTE') OR has_function_privilege('public',v_f,'EXECUTE') THEN RAISE EXCEPTION 'ACL_PUBLICA_INVALIDA: %',v_f; END IF;
  END LOOP;
  FOREACH v_f IN ARRAY ARRAY['public.financeiro_data_brt(timestamptz)','public.financeiro_envelope_bloquear_percentuais(uuid,uuid,numeric)','public.financeiro_envelope_saldo_bancario(uuid,uuid,date)','public.financeiro_validar_debito_disponivel(uuid,uuid,numeric)','public.financeiro_envelope_lucro_diario(uuid,date)','public.financeiro_envelope_imutavel()'] LOOP
    IF has_function_privilege('authenticated',v_f,'EXECUTE') OR has_function_privilege('anon',v_f,'EXECUTE') OR has_function_privilege('public',v_f,'EXECUTE') THEN RAISE EXCEPTION 'HELPER_EXPOSTO: %',v_f; END IF;
  END LOOP;
  IF has_table_privilege('authenticated','public.financeiro_envelopes','INSERT,UPDATE,DELETE') OR has_table_privilege('anon','public.financeiro_envelopes_transacoes','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'TABELA_ENVELOPE_EXPOSTA'; END IF;
END $$;

ROLLBACK;
