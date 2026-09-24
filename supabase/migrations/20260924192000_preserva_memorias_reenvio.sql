-- Um atendimento devolvido pode ter mais de uma versão de memória; somente a mais recente permanece ativa.

ALTER TABLE public.cliente_cortes
  DROP CONSTRAINT cliente_cortes_agendamento_id_key;

CREATE INDEX cliente_cortes_agendamento_idx
  ON public.cliente_cortes(barbearia_id,agendamento_id,criado_em DESC);

CREATE OR REPLACE FUNCTION public.recepcao_fila_devolver(
  p_pendencia_id uuid,
  p_motivo text,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_operador();
  v_pendencia public.atendimento_pendencias%ROWTYPE;
  v_motivo text:=btrim(COALESCE(p_motivo,''));
BEGIN
  IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_MOTIVO_INVALIDO'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_VERSAO_INVALIDA'; END IF;
  SELECT * INTO v_pendencia
  FROM public.atendimento_pendencias
  WHERE id=p_pendencia_id AND barbearia_id=v_barbearia
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_NAO_ENCONTRADA'; END IF;
  IF v_pendencia.status<>'aguardando_pagamento' THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_STATUS_INVALIDO'; END IF;
  IF v_pendencia.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_CONFLITO_VERSAO'; END IF;

  UPDATE public.atendimento_pendencias
  SET status='cancelado',updated_at=clock_timestamp()
  WHERE id=v_pendencia.id
  RETURNING * INTO v_pendencia;
  UPDATE public.agendamentos
  SET status='em_atendimento'
  WHERE id=v_pendencia.agendamento_id AND barbearia_id=v_barbearia AND status='aguardando_pagamento';
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_DEVOLUCAO_STATUS_INVALIDO'; END IF;

  INSERT INTO public.atendimento_operacao_log(
    barbearia_id,agendamento_id,pendencia_id,evento,ator_id,ator_papel,detalhes
  ) VALUES (
    v_barbearia,v_pendencia.agendamento_id,v_pendencia.id,'cancelado',auth.uid(),'recepcao',
    jsonb_build_object('acao','devolvido_ao_barbeiro','motivo',v_motivo,'memoria_preservada',true)
  );
  RETURN jsonb_build_object('pendencia_id',v_pendencia.id,'status','cancelado','agendamento_status','em_atendimento');
END;
$$;

REVOKE ALL ON FUNCTION public.recepcao_fila_devolver(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recepcao_fila_devolver(uuid,text,timestamptz) TO authenticated;

