BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.notificacoes_push_assinaturas (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_push_endpoint_tamanho CHECK (length(endpoint) BETWEEN 20 AND 2048),
  CONSTRAINT notificacoes_push_p256dh_tamanho CHECK (length(p256dh) BETWEEN 20 AND 512),
  CONSTRAINT notificacoes_push_auth_tamanho CHECK (length(auth) BETWEEN 8 AND 256)
);

CREATE INDEX IF NOT EXISTS notificacoes_push_destinatarios_idx
  ON public.notificacoes_push_assinaturas (barbearia_id, usuario_id)
  WHERE ativo;

CREATE TABLE IF NOT EXISTS public.notificacoes_push_entregas (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  assinatura_id uuid NOT NULL REFERENCES public.notificacoes_push_assinaturas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processando',
  tentativas integer NOT NULL DEFAULT 1,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_push_entregas_status_check CHECK (status IN ('processando','enviado','falhou')),
  CONSTRAINT notificacoes_push_entrega_unica UNIQUE (agendamento_id, assinatura_id)
);

ALTER TABLE public.notificacoes_push_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_push_entregas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notificacoes_push_assinaturas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notificacoes_push_entregas FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.notificacoes_push_assinaturas TO service_role;
GRANT ALL ON TABLE public.notificacoes_push_entregas TO service_role;

CREATE OR REPLACE FUNCTION public.notificacao_push_salvar(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_usuario uuid:=auth.uid();
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_role text:=public.get_my_role();
  v_id uuid;
BEGIN
  IF v_usuario IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'PUSH_NAO_AUTORIZADO';
  END IF;
  IF p_endpoint IS NULL OR length(p_endpoint) NOT BETWEEN 20 AND 2048
    OR p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 20 AND 512
    OR p_auth IS NULL OR length(p_auth) NOT BETWEEN 8 AND 256
    OR (p_user_agent IS NOT NULL AND length(p_user_agent)>500) THEN
    RAISE EXCEPTION 'PUSH_ASSINATURA_INVALIDA';
  END IF;

  INSERT INTO public.notificacoes_push_assinaturas(
    usuario_id,barbearia_id,endpoint,p256dh,auth,user_agent,ativo
  ) VALUES (
    v_usuario,v_barbearia,p_endpoint,p_p256dh,p_auth,NULLIF(btrim(p_user_agent),''),true
  )
  ON CONFLICT(endpoint) DO UPDATE SET
    usuario_id=EXCLUDED.usuario_id,
    barbearia_id=EXCLUDED.barbearia_id,
    p256dh=EXCLUDED.p256dh,
    auth=EXCLUDED.auth,
    user_agent=EXCLUDED.user_agent,
    ativo=true,
    atualizado_em=clock_timestamp()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id',v_id,'ativo',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.notificacao_push_remover(p_endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_endpoint IS NULL THEN RAISE EXCEPTION 'PUSH_NAO_AUTORIZADO'; END IF;
  UPDATE public.notificacoes_push_assinaturas
  SET ativo=false,atualizado_em=clock_timestamp()
  WHERE usuario_id=auth.uid() AND endpoint=p_endpoint;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_atendimento_ativo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_profissional uuid:=public.get_my_profissional_id();
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' OR v_profissional IS NULL OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;

  SELECT jsonb_build_object(
    'id',a.id,
    'profissional_id',a.profissional_id,
    'cliente_nome',COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),
    'servico_nome',COALESCE(s.nome,'Serviço não informado'),
    'data_hora',a.data_hora,
    'iniciado_em',a.iniciado_em,
    'status',a.status
  ) INTO v_result
  FROM public.agendamentos a
  LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
  LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
  WHERE a.barbearia_id=v_barbearia
    AND a.profissional_id=v_profissional
    AND a.status='em_atendimento'
  ORDER BY a.iniciado_em NULLS LAST,a.data_hora,a.id
  LIMIT 1;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiro_agendamento_mudar_status(
  p_agendamento_id uuid,p_status_esperado text,p_novo_status text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_profissional uuid:=public.get_my_profissional_id();
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_agendamento public.agendamentos%ROWTYPE;
  v_transicao_permitida boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'barbeiro' THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  IF v_profissional IS NULL OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO';
  END IF;
  IF p_agendamento_id IS NULL OR p_status_esperado IS NULL OR p_novo_status IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DADOS_INVALIDOS';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_profissional::text||':atendimento-ativo',0));
  SELECT * INTO v_agendamento FROM public.agendamentos
  WHERE id=p_agendamento_id AND barbearia_id=v_barbearia AND profissional_id=v_profissional
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_AGENDAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_agendamento.status IS DISTINCT FROM p_status_esperado THEN RAISE EXCEPTION 'AGENDA_STATUS_ALTERADO'; END IF;

  v_transicao_permitida:=CASE
    WHEN v_agendamento.status IN ('pendente','confirmado','encaixe')
      AND p_novo_status IN ('em_atendimento','cancelado','nao_compareceu') THEN true
    WHEN v_agendamento.status='em_atendimento' AND p_novo_status='concluido' THEN true
    ELSE false
  END;
  IF NOT v_transicao_permitida THEN RAISE EXCEPTION 'AGENDA_TRANSICAO_INVALIDA'; END IF;
  IF p_novo_status='em_atendimento' AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional
      AND a.id<>v_agendamento.id AND a.status='em_atendimento'
  ) THEN RAISE EXCEPTION 'AGENDA_ATENDIMENTO_EM_ANDAMENTO'; END IF;
  IF p_novo_status='nao_compareceu' AND clock_timestamp()<v_agendamento.data_hora+interval '10 minutes' THEN
    RAISE EXCEPTION 'AGENDA_AUSENCIA_ANTES_DO_PRAZO';
  END IF;

  UPDATE public.agendamentos SET status=p_novo_status WHERE id=v_agendamento.id
  RETURNING * INTO v_agendamento;

  RETURN jsonb_build_object(
    'id',v_agendamento.id,'status',v_agendamento.status,
    'iniciado_em',v_agendamento.iniciado_em,'concluido_em',v_agendamento.concluido_em,
    'nao_compareceu_em',v_agendamento.nao_compareceu_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notificacao_push_salvar(text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.notificacao_push_remover(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_atendimento_ativo() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notificacao_push_salvar(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacao_push_remover(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_atendimento_ativo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notificacao_push_agendamento_portal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,net,pg_temp
AS $$
BEGIN
  PERFORM net.http_post(
    url:='https://wzgtqduivvdfeskpmopq.supabase.co/functions/v1/push-appointment',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object(
      'type','INSERT',
      'table',TG_TABLE_NAME,
      'schema',TG_TABLE_SCHEMA,
      'record',to_jsonb(NEW),
      'old_record',NULL
    ),
    timeout_milliseconds:=3000
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notificacao_push_agendamento_portal() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS agendamento_portal_notificacao_push_trg ON public.agendamentos;
CREATE TRIGGER agendamento_portal_notificacao_push_trg
AFTER INSERT ON public.agendamentos
FOR EACH ROW
WHEN (NEW.origem='portal_cliente')
EXECUTE FUNCTION public.notificacao_push_agendamento_portal();

COMMIT;
