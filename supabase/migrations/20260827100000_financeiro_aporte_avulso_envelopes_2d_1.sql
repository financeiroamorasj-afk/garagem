BEGIN;

ALTER TABLE public.financeiro_envelopes_transacoes
  DROP CONSTRAINT financeiro_envelopes_transacoes_tipo_check,
  DROP CONSTRAINT financeiro_envelopes_transacoes_check;

ALTER TABLE public.financeiro_envelopes_transacoes
  ADD CONSTRAINT financeiro_envelopes_transacoes_tipo_check
    CHECK (tipo IN ('distribuicao','resgate','estorno','aporte_avulso')),
  ADD CONSTRAINT financeiro_envelopes_transacoes_check
    CHECK (
      (tipo='distribuicao' AND direcao='credito' AND distribuicao_id IS NOT NULL AND conta_pagar_id IS NULL AND transacao_estornada_id IS NULL)
      OR (tipo='resgate' AND direcao='debito' AND distribuicao_id IS NULL AND conta_pagar_id IS NOT NULL AND transacao_estornada_id IS NULL)
      OR (tipo='estorno' AND direcao='credito' AND distribuicao_id IS NULL AND conta_pagar_id IS NOT NULL AND transacao_estornada_id IS NOT NULL)
      OR (tipo='aporte_avulso' AND direcao='credito' AND distribuicao_id IS NULL AND conta_pagar_id IS NULL AND transacao_estornada_id IS NULL)
    );

CREATE FUNCTION public.financeiro_aportar_envelope(
  p_envelope_id uuid,
  p_valor numeric,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_b uuid;
  v_key text:=btrim(p_idempotency_key);
  v_valor numeric;
  v_payload jsonb;
  v_hash text;
  v_i public.financeiro_idempotencia%ROWTYPE;
  v_e public.financeiro_envelopes%ROWTYPE;
  v_d public.financeiro_envelopes%ROWTYPE;
  v_conta uuid;
  v_disponivel numeric;
  v_tx uuid;
  v_resp jsonb;
BEGIN
  v_b:=public.financeiro_assert_admin();

  IF p_valor IS NULL OR p_valor::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO';
  END IF;
  v_valor:=round(p_valor,2);
  IF v_valor<=0 THEN RAISE EXCEPTION 'FINANCEIRO_VALOR_INVALIDO'; END IF;
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCY_KEY_INVALIDA';
  END IF;
  IF p_correlation_id IS NOT NULL AND length(p_correlation_id)>200 THEN
    RAISE EXCEPTION 'FINANCEIRO_CORRELATION_ID_INVALIDO';
  END IF;

  v_payload:=jsonb_build_object('envelope_id',p_envelope_id,'valor',v_valor);
  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_b::text||':aportar_envelope:'||v_key,0));
  SELECT * INTO v_i
    FROM public.financeiro_idempotencia
    WHERE barbearia_id=v_b AND operacao='aportar_envelope' AND idempotency_key=v_key
    FOR UPDATE;
  IF FOUND THEN
    IF v_i.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'FINANCEIRO_IDEMPOTENCIA_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN v_i.resposta||jsonb_build_object('idempotente',true);
  END IF;

  SELECT conta_bancaria_id INTO v_conta
    FROM public.financeiro_envelopes
    WHERE barbearia_id=v_b AND id=p_envelope_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  IF NOT (SELECT ativa FROM public.financeiro_envelopes WHERE barbearia_id=v_b AND id=p_envelope_id) THEN
    RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_INATIVO';
  END IF;

  v_disponivel:=public.financeiro_validar_debito_disponivel(v_b,v_conta,v_valor);

  SELECT * INTO v_e
    FROM public.financeiro_envelopes
    WHERE barbearia_id=v_b AND id=p_envelope_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_NAO_ENCONTRADO'; END IF;
  IF NOT v_e.ativa THEN RAISE EXCEPTION 'FINANCEIRO_ENVELOPE_INATIVO'; END IF;
  IF v_e.conta_bancaria_id IS DISTINCT FROM v_conta THEN
    RAISE EXCEPTION 'FINANCEIRO_CONFLITO_VERSAO';
  END IF;

  UPDATE public.financeiro_envelopes
    SET saldo_acumulado=v_e.saldo_acumulado+v_valor, updated_at=clock_timestamp()
    WHERE id=v_e.id
    RETURNING * INTO v_d;

  INSERT INTO public.financeiro_envelopes_transacoes(
    barbearia_id,envelope_id,tipo,direcao,valor,saldo_antes,saldo_depois,data_brt,
    idempotency_key,payload_hash,autor_id,correlation_id
  ) VALUES(
    v_b,v_e.id,'aporte_avulso','credito',v_valor,v_e.saldo_acumulado,v_d.saldo_acumulado,
    public.financeiro_data_brt(),v_key,v_hash,auth.uid(),p_correlation_id
  ) RETURNING id INTO v_tx;

  v_resp:=jsonb_build_object(
    'transacao_id',v_tx,
    'envelope_id',v_e.id,
    'conta_bancaria_id',v_conta,
    'valor',v_valor,
    'saldo_antes',v_e.saldo_acumulado,
    'saldo_depois',v_d.saldo_acumulado,
    'disponivel_antes',v_disponivel
  );
  INSERT INTO public.financeiro_idempotencia(barbearia_id,operacao,idempotency_key,payload_hash,resposta)
    VALUES(v_b,'aportar_envelope',v_key,v_hash,v_resp);
  PERFORM public.financeiro_auditar(v_b,'rpc','financeiro_envelopes',v_e.id,to_jsonb(v_e),to_jsonb(v_d),p_correlation_id);
  RETURN v_resp||jsonb_build_object('idempotente',false);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_aportar_envelope(uuid,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_aportar_envelope(uuid,numeric,text,text) TO authenticated;

COMMIT;
