-- Operação real do atendimento: atraso, ausência, horários efetivos e gestão
-- segura das fotos privadas da memória do corte.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS nao_compareceu_em timestamptz;

ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_status_check;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN (
    'pendente','confirmado','encaixe','em_atendimento','aguardando_pagamento',
    'concluido','cancelado','nao_compareceu'
  ));

CREATE OR REPLACE FUNCTION public.agendamentos_registrar_momentos_status()
RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status='em_atendimento' THEN
    NEW.iniciado_em:=clock_timestamp();
    NEW.concluido_em:=NULL;
  ELSIF NEW.status IN ('aguardando_pagamento','concluido') THEN
    NEW.concluido_em:=COALESCE(NEW.concluido_em,clock_timestamp());
  ELSIF NEW.status='cancelado' THEN
    NEW.cancelado_em:=COALESCE(NEW.cancelado_em,clock_timestamp());
  ELSIF NEW.status='nao_compareceu' THEN
    NEW.nao_compareceu_em:=COALESCE(NEW.nao_compareceu_em,clock_timestamp());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agendamentos_registrar_momentos_status_trg ON public.agendamentos;
CREATE TRIGGER agendamentos_registrar_momentos_status_trg
BEFORE UPDATE OF status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.agendamentos_registrar_momentos_status();

-- Uma troca puramente operacional de status não cria uma nova reserva. Revalidar
-- o choque nesse momento bloqueava atendimentos antigos após a adoção da margem
-- de cinco minutos. Novos horários e alterações de duração/data continuam
-- protegidos contra sobreposição.
CREATE OR REPLACE FUNCTION public.agendamentos_preparar_e_proteger_horario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_duracao integer;
  v_validar_conflito boolean;
BEGIN
  IF NEW.barbearia_id IS NULL OR NEW.profissional_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_DADOS_INVALIDOS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id=NEW.profissional_id AND p.barbearia_id=NEW.barbearia_id
  ) THEN RAISE EXCEPTION 'AGENDA_PROFISSIONAL_INVALIDO'; END IF;
  IF NEW.cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=NEW.cliente_id AND c.barbearia_id=NEW.barbearia_id
  ) THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;

  IF TG_OP='INSERT' OR NEW.servico_id IS DISTINCT FROM OLD.servico_id THEN
    IF NEW.servico_id IS NULL THEN
      v_duracao:=COALESCE(NEW.duracao_minutos_snapshot,30);
    ELSE
      SELECT s.duracao_minutos INTO v_duracao
      FROM public.servicos s
      WHERE s.id=NEW.servico_id AND s.barbearia_id=NEW.barbearia_id AND s.ativo;
      IF v_duracao IS NULL THEN RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO'; END IF;
    END IF;
    NEW.duracao_minutos_snapshot:=v_duracao;
  END IF;

  NEW.duracao_minutos_snapshot:=COALESCE(NEW.duracao_minutos_snapshot,30);
  NEW.margem_minutos_snapshot:=COALESCE(NEW.margem_minutos_snapshot,5);
  NEW.data_fim:=NEW.data_hora+make_interval(mins=>NEW.duracao_minutos_snapshot);
  NEW.ocupacao_fim:=NEW.data_fim+make_interval(mins=>NEW.margem_minutos_snapshot);

  v_validar_conflito:=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN
    v_validar_conflito:=
      NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
      OR NEW.servico_id IS DISTINCT FROM OLD.servico_id
      OR NEW.data_hora IS DISTINCT FROM OLD.data_hora
      OR NEW.duracao_minutos_snapshot IS DISTINCT FROM OLD.duracao_minutos_snapshot
      OR NEW.margem_minutos_snapshot IS DISTINCT FROM OLD.margem_minutos_snapshot;
  END IF;

  IF v_validar_conflito AND NEW.status IN ('pendente','confirmado','encaixe','em_atendimento') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.profissional_id::text||':agenda',0));
    IF EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.profissional_id=NEW.profissional_id
        AND a.id IS DISTINCT FROM NEW.id
        AND a.status IN ('pendente','confirmado','encaixe','em_atendimento')
        AND a.data_hora<NEW.ocupacao_fim AND a.ocupacao_fim>NEW.data_hora
    ) THEN RAISE EXCEPTION 'AGENDA_HORARIO_OCUPADO'; END IF;
  END IF;
  RETURN NEW;
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

REVOKE ALL ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) TO authenticated;

-- Confirma em produção a configuração privada e os limites do bucket já criado
-- pela fundação da memória de cortes.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('cortes-clientes','cortes-clientes',false,1048576,ARRAY['image/webp','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS cortes_clientes_ler ON storage.objects;
DROP POLICY IF EXISTS cortes_clientes_enviar ON storage.objects;
DROP POLICY IF EXISTS cortes_clientes_remover ON storage.objects;

CREATE POLICY cortes_clientes_ler ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='cortes-clientes'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=public.get_my_barbearia_id()
        AND a.cliente_id::text=(storage.foldername(name))[2]
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

CREATE POLICY cortes_clientes_enviar ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='cortes-clientes'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=public.get_my_barbearia_id()
        AND a.cliente_id::text=(storage.foldername(name))[2]
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

CREATE POLICY cortes_clientes_remover ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='cortes-clientes'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND (
    public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbearia_id=public.get_my_barbearia_id()
        AND a.cliente_id::text=(storage.foldername(name))[2]
        AND a.profissional_id=public.get_my_profissional_id()
    ))
  )
);

CREATE OR REPLACE FUNCTION public.cliente_corte_foto_atualizar(
  p_corte_id uuid,p_foto_path text,p_foto_mime text,p_foto_bytes integer,
  p_foto_largura integer,p_foto_altura integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_profissional uuid:=public.get_my_profissional_id();
  v_role text:=public.get_my_role();
  v_corte public.cliente_cortes%ROWTYPE;
  v_anterior text;
  v_prefixo text;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'CORTE_FOTO_NAO_AUTORIZADA';
  END IF;
  SELECT * INTO v_corte FROM public.cliente_cortes
  WHERE id=p_corte_id AND barbearia_id=v_barbearia AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CORTE_FOTO_NAO_ENCONTRADA'; END IF;
  IF v_role='barbeiro' AND (v_profissional IS NULL OR v_corte.profissional_id<>v_profissional) THEN
    RAISE EXCEPTION 'CORTE_FOTO_NAO_AUTORIZADA';
  END IF;

  v_prefixo:=v_barbearia::text||'/'||v_corte.cliente_id::text||'/';
  IF p_foto_path IS NULL OR p_foto_path NOT LIKE v_prefixo||'%'
    OR p_foto_mime NOT IN ('image/webp','image/jpeg')
    OR p_foto_bytes NOT BETWEEN 1 AND 1048576
    OR p_foto_largura NOT BETWEEN 1 AND 1600 OR p_foto_altura NOT BETWEEN 1 AND 1600 THEN
    RAISE EXCEPTION 'CORTE_FOTO_INVALIDA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='cortes-clientes' AND o.name=p_foto_path) THEN
    RAISE EXCEPTION 'CORTE_FOTO_ARQUIVO_NAO_ENCONTRADO';
  END IF;

  v_anterior:=v_corte.foto_path;
  UPDATE public.cliente_cortes SET
    foto_path=p_foto_path,foto_mime=p_foto_mime,foto_bytes=p_foto_bytes,
    foto_largura=p_foto_largura,foto_altura=p_foto_altura,foto_excluida_em=NULL
  WHERE id=v_corte.id RETURNING * INTO v_corte;

  RETURN jsonb_build_object('corte',public.cliente_corte_json(v_corte),'foto_anterior_path',v_anterior);
END;
$$;

CREATE OR REPLACE FUNCTION public.cliente_corte_foto_remover(p_corte_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_profissional uuid:=public.get_my_profissional_id();
  v_role text:=public.get_my_role();
  v_corte public.cliente_cortes%ROWTYPE;
  v_anterior text;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'CORTE_FOTO_NAO_AUTORIZADA';
  END IF;
  SELECT * INTO v_corte FROM public.cliente_cortes
  WHERE id=p_corte_id AND barbearia_id=v_barbearia AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CORTE_FOTO_NAO_ENCONTRADA'; END IF;
  IF v_role='barbeiro' AND (v_profissional IS NULL OR v_corte.profissional_id<>v_profissional) THEN
    RAISE EXCEPTION 'CORTE_FOTO_NAO_AUTORIZADA';
  END IF;

  v_anterior:=v_corte.foto_path;
  UPDATE public.cliente_cortes SET
    foto_path=NULL,foto_mime=NULL,foto_bytes=NULL,foto_largura=NULL,foto_altura=NULL,
    foto_excluida_em=CASE WHEN v_anterior IS NULL THEN foto_excluida_em ELSE clock_timestamp() END
  WHERE id=v_corte.id RETURNING * INTO v_corte;

  RETURN jsonb_build_object('corte',public.cliente_corte_json(v_corte),'foto_removida_path',v_anterior);
END;
$$;

REVOKE ALL ON FUNCTION public.cliente_corte_foto_atualizar(uuid,text,text,integer,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cliente_corte_foto_remover(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cliente_corte_foto_atualizar(uuid,text,text,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_corte_foto_remover(uuid) TO authenticated;
