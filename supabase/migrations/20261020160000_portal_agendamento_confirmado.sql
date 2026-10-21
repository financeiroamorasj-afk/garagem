-- Agendamentos escolhidos e confirmados pelo próprio cliente no portal não
-- dependem de aceite posterior da barbearia. O horário já foi validado como
-- livre pela função e passa a entrar na agenda como confirmado.

CREATE OR REPLACE FUNCTION public.portal_agendamento_criar(
  p_token text,p_servico_id uuid,p_profissional_id uuid,p_inicio timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_preco numeric; v_duracao integer; v_id uuid; v_fuso text; v_data date;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  IF p_inicio IS NULL OR p_inicio<=now() THEN RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL'; END IF;
  SELECT s.preco,s.duracao_minutos INTO v_preco,v_duracao FROM public.servicos s
  WHERE s.id=p_servico_id AND s.barbearia_id=v_sessao.barbearia_id AND s.ativo;
  IF v_duracao IS NULL THEN RAISE EXCEPTION 'PORTAL_SERVICO_INVALIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id
    AND p.barbearia_id=v_sessao.barbearia_id AND p.ativo) THEN RAISE EXCEPTION 'PORTAL_PROFISSIONAL_INVALIDO'; END IF;
  SELECT fuso_horario INTO v_fuso FROM public.barbearias WHERE id=v_sessao.barbearia_id;
  v_data:=(p_inicio AT TIME ZONE COALESCE(v_fuso,'America/Sao_Paulo'))::date;
  IF NOT EXISTS (SELECT 1 FROM public.portal_horarios_livres(
    p_token,p_servico_id,v_data,p_profissional_id,1,100
  ) h WHERE h.profissional_id=p_profissional_id AND h.inicio=p_inicio) THEN
    RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL';
  END IF;
  INSERT INTO public.agendamentos(
    barbearia_id,profissional_id,cliente_id,servico_id,data_hora,duracao_minutos_snapshot,
    data_fim,valor_final,status,origem,pagamento_status
  ) VALUES (
    v_sessao.barbearia_id,p_profissional_id,v_sessao.cliente_id,p_servico_id,p_inicio,v_duracao,
    p_inicio+make_interval(mins=>v_duracao),v_preco,'confirmado','portal_cliente','nao_solicitado'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','confirmado','inicio',p_inicio,'valor_final',v_preco);
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL'; END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_agendamento_criar(text,uuid,uuid,timestamptz) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_agendamento_criar(text,uuid,uuid,timestamptz) TO anon;

-- Normaliza apenas reservas futuras feitas pelo portal. Outros agendamentos
-- pendentes continuam preservando o fluxo operacional que os criou.
UPDATE public.agendamentos
SET status = 'confirmado'
WHERE origem = 'portal_cliente'
  AND status = 'pendente'
  AND data_hora > now();
