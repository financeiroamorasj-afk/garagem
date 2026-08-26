BEGIN;

CREATE FUNCTION public.financeiro_data_brt(p_instante timestamptz DEFAULT now())
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public, auth
AS $$ SELECT (p_instante AT TIME ZONE 'America/Sao_Paulo')::date $$;

CREATE TABLE public.financeiro_envelopes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 100),
  finalidade text NOT NULL CHECK (finalidade IN ('reserva','reinvestimento','socios','impostos','outros')),
  percentual_distribuicao numeric(5,2) CHECK (percentual_distribuicao BETWEEN 0 AND 100),
  saldo_acumulado numeric(15,2) NOT NULL DEFAULT 0 CHECK (saldo_acumulado >= 0),
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id,id),
  CONSTRAINT financeiro_envelope_conta_tenant_fkey FOREIGN KEY (barbearia_id,conta_bancaria_id)
    REFERENCES public.financeiro_contas_bancarias(barbearia_id,id)
);
CREATE UNIQUE INDEX financeiro_envelope_nome_ativo_unico
  ON public.financeiro_envelopes(barbearia_id,lower(btrim(nome))) WHERE ativa;
CREATE INDEX financeiro_envelope_conta_idx ON public.financeiro_envelopes(barbearia_id,conta_bancaria_id) WHERE ativa;

CREATE TABLE public.financeiro_envelopes_distribuicoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  data_brt date NOT NULL,
  formula_versao text NOT NULL DEFAULT 'caixa_operacional_liquido_v1',
  base_distribuivel numeric(15,2) NOT NULL CHECK (base_distribuivel >= 0),
  percentual_total numeric(5,2) NOT NULL CHECK (percentual_total > 0 AND percentual_total <= 100),
  valor_distribuido numeric(15,2) NOT NULL CHECK (valor_distribuido > 0 AND valor_distribuido <= base_distribuivel),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  payload_hash text NOT NULL CHECK (length(payload_hash)=64),
  autor_id uuid NOT NULL REFERENCES auth.users(id),
  correlation_id text CHECK (correlation_id IS NULL OR length(correlation_id) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id,id),
  UNIQUE (barbearia_id,formula_versao,data_brt),
  UNIQUE (barbearia_id,idempotency_key)
);

CREATE TABLE public.financeiro_envelopes_transacoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  envelope_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('distribuicao','resgate','estorno')),
  direcao text NOT NULL CHECK (direcao IN ('credito','debito')),
  valor numeric(15,2) NOT NULL CHECK (valor > 0),
  saldo_antes numeric(15,2) NOT NULL CHECK (saldo_antes >= 0),
  saldo_depois numeric(15,2) NOT NULL CHECK (saldo_depois >= 0),
  data_brt date NOT NULL,
  distribuicao_id uuid,
  conta_pagar_id uuid,
  transacao_estornada_id uuid,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  payload_hash text NOT NULL CHECK (length(payload_hash)=64),
  autor_id uuid NOT NULL REFERENCES auth.users(id),
  correlation_id text CHECK (correlation_id IS NULL OR length(correlation_id) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id,id),
  UNIQUE (barbearia_id,idempotency_key),
  UNIQUE (barbearia_id,transacao_estornada_id),
  CONSTRAINT financeiro_env_tx_envelope_tenant_fkey FOREIGN KEY (barbearia_id,envelope_id)
    REFERENCES public.financeiro_envelopes(barbearia_id,id),
  CONSTRAINT financeiro_env_tx_distribuicao_tenant_fkey FOREIGN KEY (barbearia_id,distribuicao_id)
    REFERENCES public.financeiro_envelopes_distribuicoes(barbearia_id,id),
  CONSTRAINT financeiro_env_tx_cp_tenant_fkey FOREIGN KEY (barbearia_id,conta_pagar_id)
    REFERENCES public.financeiro_contas_pagar(barbearia_id,id),
  CONSTRAINT financeiro_env_tx_estorno_tenant_fkey FOREIGN KEY (barbearia_id,transacao_estornada_id)
    REFERENCES public.financeiro_envelopes_transacoes(barbearia_id,id),
  CHECK ((tipo='distribuicao' AND direcao='credito' AND distribuicao_id IS NOT NULL AND conta_pagar_id IS NULL AND transacao_estornada_id IS NULL)
      OR (tipo='resgate' AND direcao='debito' AND distribuicao_id IS NULL AND conta_pagar_id IS NOT NULL AND transacao_estornada_id IS NULL)
      OR (tipo='estorno' AND direcao='credito' AND distribuicao_id IS NULL AND conta_pagar_id IS NOT NULL AND transacao_estornada_id IS NOT NULL)),
  CHECK ((direcao='credito' AND saldo_depois=saldo_antes+valor) OR (direcao='debito' AND saldo_depois=saldo_antes-valor))
);
CREATE INDEX financeiro_env_tx_lista_idx ON public.financeiro_envelopes_transacoes(barbearia_id,envelope_id,created_at DESC,id DESC);

ALTER TABLE public.financeiro_contas_pagar ADD COLUMN envelope_resgate_transacao_id uuid;
ALTER TABLE public.financeiro_contas_pagar ADD CONSTRAINT financeiro_cp_env_resgate_tenant_fkey
  FOREIGN KEY (barbearia_id,envelope_resgate_transacao_id)
  REFERENCES public.financeiro_envelopes_transacoes(barbearia_id,id);
CREATE UNIQUE INDEX financeiro_cp_env_resgate_unico
  ON public.financeiro_contas_pagar(barbearia_id,envelope_resgate_transacao_id)
  WHERE envelope_resgate_transacao_id IS NOT NULL;

ALTER TABLE public.financeiro_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_envelopes_distribuicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_envelopes_transacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY financeiro_envelopes_leitura_admin ON public.financeiro_envelopes FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY financeiro_env_dist_leitura_admin ON public.financeiro_envelopes_distribuicoes FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
CREATE POLICY financeiro_env_tx_leitura_admin ON public.financeiro_envelopes_transacoes FOR SELECT
  USING (barbearia_id=public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'));
REVOKE ALL PRIVILEGES ON TABLE public.financeiro_envelopes,public.financeiro_envelopes_distribuicoes,public.financeiro_envelopes_transacoes FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.financeiro_envelope_bloquear_percentuais(p_barbearia uuid, p_envelope uuid DEFAULT NULL, p_percentual numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_total numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_barbearia::text||':envelopes:config',0));
  SELECT COALESCE(sum(CASE WHEN id=p_envelope THEN p_percentual ELSE percentual_distribuicao END),0)
    INTO v_total FROM public.financeiro_envelopes WHERE barbearia_id=p_barbearia AND ativa AND (id<>p_envelope OR p_percentual IS NOT NULL);
  IF v_total>100 THEN RAISE EXCEPTION 'FINANCEIRO_PERCENTUAL_TOTAL_EXCEDIDO'; END IF;
END; $$;

CREATE FUNCTION public.financeiro_envelope_saldo_bancario(p_barbearia uuid,p_conta uuid,p_ate date DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT round(c.saldo_inicial+COALESCE(sum(CASE WHEN m.direcao='entrada' THEN m.valor ELSE -m.valor END)
    FILTER(WHERE m.status='efetivado' AND (p_ate IS NULL OR m.data_liquidacao<=p_ate)),0),2)
  FROM public.financeiro_contas_bancarias c LEFT JOIN public.financeiro_movimentacoes m
    ON m.barbearia_id=c.barbearia_id AND m.conta_bancaria_id=c.id
  WHERE c.barbearia_id=p_barbearia AND c.id=p_conta GROUP BY c.id,c.saldo_inicial
$$;

CREATE FUNCTION public.financeiro_validar_debito_disponivel(p_barbearia uuid,p_conta uuid,p_valor numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_saldo numeric; v_reservado numeric; v_disponivel numeric;
BEGIN
  IF p_valor IS NULL OR p_valor<0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=p_barbearia AND id=p_conta AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  PERFORM 1 FROM public.financeiro_envelopes WHERE barbearia_id=p_barbearia AND conta_bancaria_id=p_conta ORDER BY id FOR UPDATE;
  v_saldo:=public.financeiro_envelope_saldo_bancario(p_barbearia,p_conta,NULL);
  SELECT COALESCE(sum(saldo_acumulado),0) INTO v_reservado FROM public.financeiro_envelopes WHERE barbearia_id=p_barbearia AND conta_bancaria_id=p_conta;
  v_disponivel:=v_saldo-v_reservado;
  IF v_disponivel<p_valor THEN RAISE EXCEPTION 'FINANCEIRO_SALDO_DISPONIVEL_INSUFICIENTE'; END IF;
  RETURN v_disponivel;
END; $$;

CREATE FUNCTION public.financeiro_envelope_lucro_diario(p_barbearia uuid,p_data date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT greatest(round(COALESCE(sum(CASE WHEN direcao='entrada' AND origem='conta_receber' THEN valor
    WHEN direcao='saida' AND origem IN ('conta_pagar','taxa_cartao') THEN -valor ELSE 0 END),0),2),0)
  FROM public.financeiro_movimentacoes
  WHERE barbearia_id=p_barbearia AND status='efetivado' AND data_liquidacao=p_data
    AND origem NOT IN ('transferencia','credito_cliente','estorno','ajuste','envelope')
$$;

CREATE FUNCTION public.financeiro_envelope_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,auth AS $$ BEGIN RAISE EXCEPTION 'FINANCEIRO_RAZAO_IMUTAVEL'; END; $$;
CREATE TRIGGER financeiro_env_tx_imutavel BEFORE UPDATE OR DELETE ON public.financeiro_envelopes_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.financeiro_envelope_imutavel();
CREATE TRIGGER financeiro_env_dist_imutavel BEFORE UPDATE OR DELETE ON public.financeiro_envelopes_distribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.financeiro_envelope_imutavel();

CREATE FUNCTION public.financeiro_listar_envelopes(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE(id uuid,conta_bancaria_id uuid,conta_nome text,nome text,finalidade text,percentual_distribuicao numeric,saldo_acumulado numeric,ativa boolean,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_barbearia uuid;
BEGIN
  IF p_incluir_inativos IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_FLAG_INVALIDA'; END IF;
  v_barbearia:=public.financeiro_assert_admin();
  RETURN QUERY SELECT e.id,e.conta_bancaria_id,c.nome,e.nome,e.finalidade,e.percentual_distribuicao,e.saldo_acumulado,e.ativa,e.updated_at
    FROM public.financeiro_envelopes e JOIN public.financeiro_contas_bancarias c ON c.barbearia_id=e.barbearia_id AND c.id=e.conta_bancaria_id
    WHERE e.barbearia_id=v_barbearia AND (p_incluir_inativos OR e.ativa) ORDER BY e.ativa DESC,lower(e.nome),e.id;
END; $$;

CREATE FUNCTION public.financeiro_criar_envelope(p_conta_bancaria_id uuid,p_nome text,p_finalidade text,p_percentual numeric,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_nome text:=btrim(p_nome); v_key text:=btrim(p_idempotency_key); v_pct numeric; v_payload jsonb; v_hash text; v_i public.financeiro_idempotencia%ROWTYPE; v_e public.financeiro_envelopes%ROWTYPE; v_resp jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin(); v_pct:=CASE WHEN p_percentual IS NULL THEN NULL ELSE round(p_percentual,2) END;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'FINANCEIRO_NOME_INVALIDO'; END IF;
  IF p_finalidade NOT IN ('reserva','reinvestimento','socios','impostos','outros') THEN RAISE EXCEPTION 'FINANCEIRO_FINALIDADE_INVALIDA'; END IF;
  IF v_pct IS NOT NULL AND (v_pct<0 OR v_pct>100) THEN RAISE EXCEPTION 'FINANCEIRO_PERCENTUAL_INVALIDO'; END IF;
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_b AND id=p_conta_bancaria_id AND ativa; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  v_payload:=jsonb_build_object('conta',p_conta_bancaria_id,'nome',v_nome,'finalidade',p_finalidade,'percentual',v_pct); v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':criar_envelope:'||v_key,0));
  SELECT * INTO v_i FROM public.financeiro_idempotencia WHERE barbearia_id=v_b AND operacao='criar_envelope' AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN IF v_i.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF; RETURN v_i.resposta||jsonb_build_object('idempotente',true); END IF;
  PERFORM public.financeiro_envelope_bloquear_percentuais(v_b,NULL,NULL);
  IF COALESCE((SELECT sum(percentual_distribuicao) FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND ativa),0)+COALESCE(v_pct,0)>100 THEN RAISE EXCEPTION 'FINANCEIRO_PERCENTUAL_TOTAL_EXCEDIDO'; END IF;
  BEGIN INSERT INTO public.financeiro_envelopes(barbearia_id,conta_bancaria_id,nome,finalidade,percentual_distribuicao) VALUES(v_b,p_conta_bancaria_id,v_nome,p_finalidade,v_pct) RETURNING * INTO v_e;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; END;
  v_resp:=jsonb_build_object('id',v_e.id,'saldo_acumulado',v_e.saldo_acumulado,'updated_at',v_e.updated_at);
  INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta) VALUES(v_b,'criar_envelope',v_key,v_hash,v_resp);
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes',v_e.id,NULL,to_jsonb(v_e),p_correlation_id); RETURN v_resp||jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_editar_envelope(p_envelope_id uuid,p_conta_bancaria_id uuid,p_nome text,p_finalidade text,p_percentual numeric,p_expected_updated_at timestamptz,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_e public.financeiro_envelopes%ROWTYPE; v_d public.financeiro_envelopes%ROWTYPE; v_nome text:=btrim(p_nome); v_pct numeric; v_payload jsonb; v_hash text; v_i public.financeiro_idempotencia%ROWTYPE; v_resp jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin(); v_pct:=CASE WHEN p_percentual IS NULL THEN NULL ELSE round(p_percentual,2) END;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 100 OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_INVALIDO'; END IF;
  IF p_finalidade NOT IN ('reserva','reinvestimento','socios','impostos','outros') OR (v_pct IS NOT NULL AND (v_pct<0 OR v_pct>100)) THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_INVALIDO'; END IF;
  IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  v_payload:=jsonb_build_object('id',p_envelope_id,'conta',p_conta_bancaria_id,'nome',v_nome,'finalidade',p_finalidade,'percentual',v_pct,'versao',p_expected_updated_at); v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':editar_envelope:'||btrim(p_idempotency_key),0)); SELECT * INTO v_i FROM public.financeiro_idempotencia WHERE barbearia_id=v_b AND operacao='editar_envelope' AND idempotency_key=btrim(p_idempotency_key) FOR UPDATE;
  IF FOUND THEN IF v_i.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF; RETURN v_i.resposta||jsonb_build_object('idempotente',true); END IF;
  SELECT * INTO v_e FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=p_envelope_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  IF v_e.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_b AND id=p_conta_bancaria_id AND ativa; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  IF v_e.saldo_acumulado>0 AND v_e.conta_bancaria_id IS DISTINCT FROM p_conta_bancaria_id THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_ENVELOPE_COM_SALDO'; END IF;
  PERFORM public.financeiro_envelope_bloquear_percentuais(v_b,p_envelope_id,v_pct);
  BEGIN UPDATE public.financeiro_envelopes SET conta_bancaria_id=p_conta_bancaria_id,nome=v_nome,finalidade=p_finalidade,percentual_distribuicao=v_pct,updated_at=clock_timestamp() WHERE id=v_e.id RETURNING * INTO v_d;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; END;
  v_resp:=jsonb_build_object('id',v_d.id,'updated_at',v_d.updated_at); INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta) VALUES(v_b,'editar_envelope',btrim(p_idempotency_key),v_hash,v_resp);
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes',v_e.id,to_jsonb(v_e),to_jsonb(v_d),p_correlation_id); RETURN v_resp||jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_definir_envelope_ativo(p_envelope_id uuid,p_ativo boolean,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_e public.financeiro_envelopes%ROWTYPE; v_d public.financeiro_envelopes%ROWTYPE; v_payload jsonb; v_hash text; v_i public.financeiro_idempotencia%ROWTYPE; v_resp jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin(); IF p_ativo IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_INVALIDO'; END IF;
  v_payload:=jsonb_build_object('id',p_envelope_id,'ativo',p_ativo); v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':ativar_envelope:'||btrim(p_idempotency_key),0)); SELECT * INTO v_i FROM public.financeiro_idempotencia WHERE barbearia_id=v_b AND operacao='definir_envelope_ativo' AND idempotency_key=btrim(p_idempotency_key) FOR UPDATE;
  IF FOUND THEN IF v_i.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF; RETURN v_i.resposta||jsonb_build_object('idempotente',true); END IF;
  SELECT * INTO v_e FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=p_envelope_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  IF NOT p_ativo AND v_e.saldo_acumulado>0 THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_COM_SALDO'; END IF;
  IF p_ativo THEN PERFORM public.financeiro_envelope_bloquear_percentuais(v_b,NULL,NULL); IF COALESCE((SELECT sum(percentual_distribuicao) FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND ativa),0)+COALESCE(v_e.percentual_distribuicao,0)>100 THEN RAISE EXCEPTION 'FINANCEIRO_PERCENTUAL_TOTAL_EXCEDIDO'; END IF; END IF;
  BEGIN UPDATE public.financeiro_envelopes SET ativa=p_ativo,updated_at=clock_timestamp() WHERE id=v_e.id RETURNING * INTO v_d; EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'FINANCEIRO_NOME_ATIVO_EM_USO'; END;
  v_resp:=jsonb_build_object('id',v_d.id,'ativa',v_d.ativa,'updated_at',v_d.updated_at); INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta) VALUES(v_b,'definir_envelope_ativo',btrim(p_idempotency_key),v_hash,v_resp);
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes',v_e.id,to_jsonb(v_e),to_jsonb(v_d),p_correlation_id); RETURN v_resp||jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_simular_distribuicao_diaria(p_data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_base numeric; v_total numeric; v_itens jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin(); IF p_data IS NULL OR p_data>public.financeiro_data_brt(now()) THEN RAISE EXCEPTION 'FINANCEIRO_DATA_INVALIDA'; END IF;
  v_base:=public.financeiro_envelope_lucro_diario(v_b,p_data); SELECT COALESCE(sum(percentual_distribuicao),0) INTO v_total FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND ativa;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('envelope_id',id,'conta_bancaria_id',conta_bancaria_id,'percentual',percentual_distribuicao,'valor',round(v_base*percentual_distribuicao/100,2)) ORDER BY id),'[]') INTO v_itens FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND ativa AND percentual_distribuicao>0;
  RETURN jsonb_build_object('data_brt',p_data,'formula_versao','caixa_operacional_liquido_v1','base_distribuivel',v_base,'percentual_total',v_total,'valor_distribuido',COALESCE((SELECT sum((x->>'valor')::numeric) FROM jsonb_array_elements(v_itens)x),0),'itens',v_itens);
END; $$;

CREATE FUNCTION public.financeiro_distribuir_envelopes_diario(p_data date,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_sim jsonb; v_payload jsonb; v_hash text; v_i public.financeiro_idempotencia%ROWTYPE; v_dist uuid; v_e public.financeiro_envelopes%ROWTYPE; v_item jsonb; v_valor numeric; v_tx uuid; v_resp jsonb; v_conta record;
BEGIN
  v_b:=public.financeiro_assert_admin(); IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  v_payload:=jsonb_build_object('data',p_data,'formula','caixa_operacional_liquido_v1'); v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':distribuir:'||btrim(p_idempotency_key),0)); SELECT * INTO v_i FROM public.financeiro_idempotencia WHERE barbearia_id=v_b AND operacao='distribuir_envelopes_diario' AND idempotency_key=btrim(p_idempotency_key) FOR UPDATE;
  IF FOUND THEN IF v_i.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF; RETURN v_i.resposta||jsonb_build_object('idempotente',true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':distribuicao:'||p_data::text,0)); IF EXISTS(SELECT 1 FROM public.financeiro_envelopes_distribuicoes WHERE barbearia_id=v_b AND formula_versao='caixa_operacional_liquido_v1' AND data_brt=p_data) THEN RAISE EXCEPTION 'FINANCEIRO_DISTRIBUICAO_JA_REALIZADA'; END IF;
  v_sim:=public.financeiro_simular_distribuicao_diaria(p_data); IF (v_sim->>'valor_distribuido')::numeric<=0 THEN RAISE EXCEPTION 'FINANCEIRO_SEM_LUCRO_DISTRIBUIVEL'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_b AND id IN (SELECT DISTINCT (x->>'conta_bancaria_id')::uuid FROM jsonb_array_elements(v_sim->'itens')x) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND ativa AND percentual_distribuicao>0 ORDER BY id FOR UPDATE;
  FOR v_conta IN
    SELECT (x->>'conta_bancaria_id')::uuid conta_bancaria_id,sum((x->>'valor')::numeric) valor_necessario
    FROM jsonb_array_elements(v_sim->'itens') x GROUP BY (x->>'conta_bancaria_id')::uuid ORDER BY (x->>'conta_bancaria_id')::uuid
  LOOP
    IF public.financeiro_envelope_saldo_bancario(v_b,v_conta.conta_bancaria_id,NULL)
       -COALESCE((SELECT sum(saldo_acumulado) FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND conta_bancaria_id=v_conta.conta_bancaria_id),0)
       < v_conta.valor_necessario THEN
      RAISE EXCEPTION 'FINANCEIRO_DISPONIBILIDADE_CONTA_VINCULADA_INSUFICIENTE';
    END IF;
  END LOOP;
  INSERT INTO public.financeiro_envelopes_distribuicoes(barbearia_id,data_brt,base_distribuivel,percentual_total,valor_distribuido,idempotency_key,payload_hash,autor_id,correlation_id)
    VALUES(v_b,p_data,(v_sim->>'base_distribuivel')::numeric,(v_sim->>'percentual_total')::numeric,(v_sim->>'valor_distribuido')::numeric,btrim(p_idempotency_key),v_hash,auth.uid(),p_correlation_id) RETURNING id INTO v_dist;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_sim->'itens') LOOP
    v_valor:=(v_item->>'valor')::numeric; IF v_valor<=0 THEN CONTINUE; END IF; SELECT * INTO v_e FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=(v_item->>'envelope_id')::uuid FOR UPDATE;
    UPDATE public.financeiro_envelopes SET saldo_acumulado=saldo_acumulado+v_valor,updated_at=clock_timestamp() WHERE id=v_e.id;
    INSERT INTO public.financeiro_envelopes_transacoes(barbearia_id,envelope_id,tipo,direcao,valor,saldo_antes,saldo_depois,data_brt,distribuicao_id,idempotency_key,payload_hash,autor_id,correlation_id)
      VALUES(v_b,v_e.id,'distribuicao','credito',v_valor,v_e.saldo_acumulado,v_e.saldo_acumulado+v_valor,p_data,v_dist,btrim(p_idempotency_key)||':'||v_e.id,v_hash,auth.uid(),p_correlation_id) RETURNING id INTO v_tx;
  END LOOP;
  v_resp:=jsonb_build_object('distribuicao_id',v_dist,'base_distribuivel',v_sim->'base_distribuivel','valor_distribuido',v_sim->'valor_distribuido'); INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta) VALUES(v_b,'distribuir_envelopes_diario',btrim(p_idempotency_key),v_hash,v_resp);
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes_distribuicoes',v_dist,NULL,v_resp,p_correlation_id); RETURN v_resp||jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_resgatar_envelope(p_envelope_id uuid,p_conta_pagar_id uuid,p_valor numeric,p_data date,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_e public.financeiro_envelopes%ROWTYPE; v_cp public.financeiro_contas_pagar%ROWTYPE; v_valor numeric:=round(p_valor,2); v_payload jsonb; v_hash text; v_i public.financeiro_idempotencia%ROWTYPE; v_tx uuid; v_resp jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin(); IF v_valor<=0 OR p_data IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_RESGATE_INVALIDO'; END IF;
  v_payload:=jsonb_build_object('envelope',p_envelope_id,'titulo',p_conta_pagar_id,'valor',v_valor,'data',p_data); v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex'); PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':resgate:'||btrim(p_idempotency_key),0));
  SELECT * INTO v_i FROM public.financeiro_idempotencia WHERE barbearia_id=v_b AND operacao='resgatar_envelope' AND idempotency_key=btrim(p_idempotency_key) FOR UPDATE; IF FOUND THEN IF v_i.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF; RETURN v_i.resposta||jsonb_build_object('idempotente',true); END IF;
  SELECT * INTO v_e FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=p_envelope_id AND ativa; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  PERFORM public.financeiro_validar_debito_disponivel(v_b,v_e.conta_bancaria_id,0);
  SELECT * INTO v_e FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=p_envelope_id AND ativa FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  SELECT * INTO v_cp FROM public.financeiro_contas_pagar WHERE barbearia_id=v_b AND id=p_conta_pagar_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_cp.status<>'pendente' OR v_cp.origem<>'manual' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_PENDENTE_OU_MANUAL'; END IF; IF v_cp.envelope_resgate_transacao_id IS NOT NULL THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_JA_VINCULADO'; END IF; IF v_valor<>v_cp.valor THEN RAISE EXCEPTION 'FINANCEIRO_RESGATE_VALOR_DIVERGENTE'; END IF; IF v_e.saldo_acumulado<v_valor THEN RAISE EXCEPTION 'FINANCEIRO_SALDO_INSUFICIENTE'; END IF;
  UPDATE public.financeiro_envelopes SET saldo_acumulado=saldo_acumulado-v_valor,updated_at=clock_timestamp() WHERE id=v_e.id;
  INSERT INTO public.financeiro_envelopes_transacoes(barbearia_id,envelope_id,tipo,direcao,valor,saldo_antes,saldo_depois,data_brt,conta_pagar_id,idempotency_key,payload_hash,autor_id,correlation_id)
    VALUES(v_b,v_e.id,'resgate','debito',v_valor,v_e.saldo_acumulado,v_e.saldo_acumulado-v_valor,p_data,p_conta_pagar_id,btrim(p_idempotency_key),v_hash,auth.uid(),p_correlation_id) RETURNING id INTO v_tx;
  UPDATE public.financeiro_contas_pagar SET envelope_resgate_transacao_id=v_tx,updated_at=clock_timestamp() WHERE id=v_cp.id;
  v_resp:=jsonb_build_object('transacao_id',v_tx,'saldo_antes',v_e.saldo_acumulado,'saldo_depois',v_e.saldo_acumulado-v_valor,'conta_bancaria_id',v_e.conta_bancaria_id); INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta) VALUES(v_b,'resgatar_envelope',btrim(p_idempotency_key),v_hash,v_resp);
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes_transacoes',v_tx,NULL,v_resp,p_correlation_id); RETURN v_resp||jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_estornar_resgate_envelope(p_transacao_id uuid,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_orig public.financeiro_envelopes_transacoes%ROWTYPE; v_e public.financeiro_envelopes%ROWTYPE; v_cp public.financeiro_contas_pagar%ROWTYPE; v_payload jsonb; v_hash text; v_i public.financeiro_idempotencia%ROWTYPE; v_tx uuid; v_resp jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin(); IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF; v_payload:=jsonb_build_object('transacao',p_transacao_id); v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex'); PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':estorno_resgate:'||btrim(p_idempotency_key),0));
  SELECT * INTO v_i FROM public.financeiro_idempotencia WHERE barbearia_id=v_b AND operacao='estornar_resgate_envelope' AND idempotency_key=btrim(p_idempotency_key) FOR UPDATE; IF FOUND THEN IF v_i.payload_hash<>v_hash THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE'; END IF; RETURN v_i.resposta||jsonb_build_object('idempotente',true); END IF;
  SELECT * INTO v_orig FROM public.financeiro_envelopes_transacoes WHERE barbearia_id=v_b AND id=p_transacao_id AND tipo='resgate'; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_RESGATE_NAO_ENCONTRADO'; END IF; IF EXISTS(SELECT 1 FROM public.financeiro_envelopes_transacoes WHERE barbearia_id=v_b AND transacao_estornada_id=v_orig.id) THEN RAISE EXCEPTION 'FINANCEIRO_TRANSACAO_JA_ESTORNADA'; END IF;
  SELECT * INTO v_e FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=v_orig.envelope_id FOR UPDATE; SELECT * INTO v_cp FROM public.financeiro_contas_pagar WHERE barbearia_id=v_b AND id=v_orig.conta_pagar_id FOR UPDATE;
  IF v_cp.status<>'pendente' OR v_cp.envelope_resgate_transacao_id IS DISTINCT FROM v_orig.id THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_PERMITE_ESTORNO'; END IF;
  UPDATE public.financeiro_envelopes SET saldo_acumulado=saldo_acumulado+v_orig.valor,updated_at=clock_timestamp() WHERE id=v_e.id;
  INSERT INTO public.financeiro_envelopes_transacoes(barbearia_id,envelope_id,tipo,direcao,valor,saldo_antes,saldo_depois,data_brt,conta_pagar_id,transacao_estornada_id,idempotency_key,payload_hash,autor_id,correlation_id)
    VALUES(v_b,v_e.id,'estorno','credito',v_orig.valor,v_e.saldo_acumulado,v_e.saldo_acumulado+v_orig.valor,public.financeiro_data_brt(now()),v_cp.id,v_orig.id,btrim(p_idempotency_key),v_hash,auth.uid(),p_correlation_id) RETURNING id INTO v_tx;
  UPDATE public.financeiro_contas_pagar SET envelope_resgate_transacao_id=NULL,updated_at=clock_timestamp() WHERE id=v_cp.id;
  v_resp:=jsonb_build_object('transacao_id',v_tx,'saldo_depois',v_e.saldo_acumulado+v_orig.valor); INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta) VALUES(v_b,'estornar_resgate_envelope',btrim(p_idempotency_key),v_hash,v_resp); PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes_transacoes',v_tx,NULL,v_resp,p_correlation_id); RETURN v_resp||jsonb_build_object('idempotente',false);
END; $$;

CREATE FUNCTION public.financeiro_listar_transacoes_envelope(p_envelope_id uuid,p_data_inicio date,p_data_fim date,p_pagina integer DEFAULT 1,p_por_pagina integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_items jsonb; v_total bigint;
BEGIN
  v_b:=public.financeiro_assert_admin(); IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio>p_data_fim OR p_pagina<1 OR p_por_pagina NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'FINANCEIRO_FILTRO_INVALIDO'; END IF;
  PERFORM 1 FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=p_envelope_id; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  SELECT count(*) INTO v_total FROM public.financeiro_envelopes_transacoes WHERE barbearia_id=v_b AND envelope_id=p_envelope_id AND data_brt BETWEEN p_data_inicio AND p_data_fim;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO v_items FROM (SELECT id,tipo,direcao,valor,saldo_antes,saldo_depois,data_brt,conta_pagar_id,transacao_estornada_id,correlation_id,created_at FROM public.financeiro_envelopes_transacoes WHERE barbearia_id=v_b AND envelope_id=p_envelope_id AND data_brt BETWEEN p_data_inicio AND p_data_fim ORDER BY created_at DESC,id DESC LIMIT p_por_pagina OFFSET (p_pagina-1)*p_por_pagina)x;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'pagina',p_pagina,'por_pagina',p_por_pagina);
END; $$;

CREATE FUNCTION public.financeiro_saldos_disponiveis_contas()
RETURNS TABLE(conta_bancaria_id uuid,nome text,saldo_bancario numeric,saldo_reservado numeric,saldo_disponivel numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid;
BEGIN v_b:=public.financeiro_assert_admin(); RETURN QUERY SELECT c.id,c.nome,public.financeiro_envelope_saldo_bancario(v_b,c.id,NULL),COALESCE(sum(e.saldo_acumulado),0),public.financeiro_envelope_saldo_bancario(v_b,c.id,NULL)-COALESCE(sum(e.saldo_acumulado),0) FROM public.financeiro_contas_bancarias c LEFT JOIN public.financeiro_envelopes e ON e.barbearia_id=c.barbearia_id AND e.conta_bancaria_id=c.id WHERE c.barbearia_id=v_b AND c.ativa GROUP BY c.id,c.nome ORDER BY c.nome,c.id; END; $$;

CREATE OR REPLACE FUNCTION public.financeiro_transferir(p_origem_id uuid,p_destino_id uuid,p_valor numeric,p_data date,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_transferencia uuid:=extensions.uuid_generate_v4(); v_saida uuid; v_entrada uuid;
BEGIN
  v_b:=public.financeiro_assert_admin();
  IF p_valor IS NULL OR p_valor<=0 OR p_data IS NULL OR p_origem_id=p_destino_id THEN RAISE EXCEPTION 'FINANCEIRO_TRANSFERENCIA_INVALIDA'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key))<8 OR length(p_idempotency_key)>200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':'||p_idempotency_key,0));
  SELECT id INTO v_saida FROM public.financeiro_movimentacoes WHERE barbearia_id=v_b AND idempotency_key=p_idempotency_key;
  IF v_saida IS NOT NULL THEN RETURN jsonb_build_object('idempotente',true,'movimentacao_id',v_saida); END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_b AND id IN (p_origem_id,p_destino_id) AND ativa ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.financeiro_contas_bancarias WHERE barbearia_id=v_b AND id IN (p_origem_id,p_destino_id) AND ativa)<>2 THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  PERFORM public.financeiro_validar_debito_disponivel(v_b,p_origem_id,p_valor);
  INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,transferencia_id,idempotency_key,descricao)
    VALUES(v_b,p_origem_id,'saida',p_valor,p_data,p_data,'transferencia',v_transferencia,p_idempotency_key,'Transferência entre contas') RETURNING id INTO v_saida;
  INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,origem,transferencia_id,idempotency_key,descricao)
    VALUES(v_b,p_destino_id,'entrada',p_valor,p_data,p_data,'transferencia',v_transferencia,p_idempotency_key||':entrada','Transferência entre contas') RETURNING id INTO v_entrada;
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_movimentacoes',v_saida,NULL,jsonb_build_object('transferencia_id',v_transferencia,'entrada_id',v_entrada),p_correlation_id);
  RETURN jsonb_build_object('idempotente',false,'transferencia_id',v_transferencia,'saida_id',v_saida,'entrada_id',v_entrada);
END; $$;

CREATE OR REPLACE FUNCTION public.financeiro_pagar_conta(p_conta_pagar_id uuid,p_conta_bancaria_id uuid,p_data date,p_idempotency_key text,p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_b uuid; v_t public.financeiro_contas_pagar%ROWTYPE; v_mov uuid; v_conta_resgate uuid;
BEGIN
  v_b:=public.financeiro_assert_admin();
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key))<8 OR length(p_idempotency_key)>200 THEN RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':'||p_idempotency_key,0)); SELECT id INTO v_mov FROM public.financeiro_movimentacoes WHERE barbearia_id=v_b AND idempotency_key=p_idempotency_key; IF v_mov IS NOT NULL THEN RETURN jsonb_build_object('idempotente',true,'movimentacao_id',v_mov); END IF;
  SELECT * INTO v_t FROM public.financeiro_contas_pagar WHERE id=p_conta_pagar_id AND barbearia_id=v_b; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_PAGAR_NAO_ENCONTRADA'; END IF;
  IF v_t.envelope_resgate_transacao_id IS NOT NULL THEN SELECT e.conta_bancaria_id INTO v_conta_resgate FROM public.financeiro_envelopes_transacoes tx JOIN public.financeiro_envelopes e ON e.barbearia_id=tx.barbearia_id AND e.id=tx.envelope_id WHERE tx.barbearia_id=v_b AND tx.id=v_t.envelope_resgate_transacao_id; IF v_conta_resgate IS DISTINCT FROM p_conta_bancaria_id THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_DIVERGENTE_RESGATE'; END IF; END IF;
  PERFORM public.financeiro_validar_debito_disponivel(v_b,p_conta_bancaria_id,v_t.valor);
  SELECT * INTO v_t FROM public.financeiro_contas_pagar WHERE id=p_conta_pagar_id AND barbearia_id=v_b FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_PAGAR_NAO_ENCONTRADA'; END IF; IF v_t.status<>'pendente' THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_PAGAR_NAO_PENDENTE'; END IF;
  IF v_t.envelope_resgate_transacao_id IS NOT NULL THEN SELECT e.conta_bancaria_id INTO v_conta_resgate FROM public.financeiro_envelopes_transacoes tx JOIN public.financeiro_envelopes e ON e.barbearia_id=tx.barbearia_id AND e.id=tx.envelope_id WHERE tx.barbearia_id=v_b AND tx.id=v_t.envelope_resgate_transacao_id; IF v_conta_resgate IS DISTINCT FROM p_conta_bancaria_id THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_DIVERGENTE_RESGATE'; END IF; END IF;
  UPDATE public.financeiro_contas_pagar SET status='pago',data_liquidacao=p_data,conta_bancaria_id=p_conta_bancaria_id,updated_at=now() WHERE id=v_t.id;
  INSERT INTO public.financeiro_movimentacoes(barbearia_id,conta_bancaria_id,direcao,valor,data_competencia,data_liquidacao,categoria_id,origem,idempotency_key,conta_pagar_id,descricao) VALUES(v_b,p_conta_bancaria_id,'saida',v_t.valor,v_t.data_competencia,p_data,v_t.categoria_id,'conta_pagar',p_idempotency_key,v_t.id,v_t.descricao) RETURNING id INTO v_mov;
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_contas_pagar',v_t.id,to_jsonb(v_t),jsonb_build_object('status','pago','movimentacao_id',v_mov),p_correlation_id); RETURN jsonb_build_object('idempotente',false,'movimentacao_id',v_mov);
END; $$;

REVOKE ALL ON FUNCTION public.financeiro_data_brt(timestamptz),public.financeiro_envelope_bloquear_percentuais(uuid,uuid,numeric),public.financeiro_envelope_saldo_bancario(uuid,uuid,date),public.financeiro_validar_debito_disponivel(uuid,uuid,numeric),public.financeiro_envelope_lucro_diario(uuid,date),public.financeiro_envelope_imutavel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.financeiro_listar_envelopes(boolean),public.financeiro_criar_envelope(uuid,text,text,numeric,text,text),public.financeiro_editar_envelope(uuid,uuid,text,text,numeric,timestamptz,text,text),public.financeiro_definir_envelope_ativo(uuid,boolean,text,text),public.financeiro_simular_distribuicao_diaria(date),public.financeiro_distribuir_envelopes_diario(date,text,text),public.financeiro_resgatar_envelope(uuid,uuid,numeric,date,text,text),public.financeiro_estornar_resgate_envelope(uuid,text,text),public.financeiro_listar_transacoes_envelope(uuid,date,date,integer,integer),public.financeiro_saldos_disponiveis_contas() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_listar_envelopes(boolean),public.financeiro_criar_envelope(uuid,text,text,numeric,text,text),public.financeiro_editar_envelope(uuid,uuid,text,text,numeric,timestamptz,text,text),public.financeiro_definir_envelope_ativo(uuid,boolean,text,text),public.financeiro_simular_distribuicao_diaria(date),public.financeiro_distribuir_envelopes_diario(date,text,text),public.financeiro_resgatar_envelope(uuid,uuid,numeric,date,text,text),public.financeiro_estornar_resgate_envelope(uuid,text,text),public.financeiro_listar_transacoes_envelope(uuid,date,date,integer,integer),public.financeiro_saldos_disponiveis_contas() TO authenticated;

COMMIT;
