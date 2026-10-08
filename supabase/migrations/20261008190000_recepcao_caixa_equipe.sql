-- O módulo muda o fluxo de cobrança, não exige um recepcionista exclusivo.
-- Um barbeiro autorizado pode cobrar somente um atendimento já entregue à fila.
CREATE OR REPLACE FUNCTION public.checkout_bloquear_barbeiro_com_recepcao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.get_my_role()='barbeiro'
     AND public.modulo_acesso_verificar('recepcao') THEN
    IF NOT (
      NEW.criado_por=auth.uid()
      AND NEW.barbearia_id=public.get_my_barbearia_id()
      AND public.recepcao_acesso_operador_verificar()
      AND EXISTS (
        SELECT 1 FROM public.atendimento_pendencias ap
        WHERE ap.barbearia_id=NEW.barbearia_id
          AND ap.agendamento_id=NEW.agendamento_id
          AND ap.status='aguardando_pagamento'
      )
    ) THEN RAISE EXCEPTION 'CHECKOUT_USAR_RECEPCAO'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A gestão dos acessos pode ser preparada antes de ativar a operação na unidade.
CREATE OR REPLACE FUNCTION public.recepcao_assert_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo)
  THEN RAISE EXCEPTION 'RECEPCAO_ADMIN_NAO_AUTORIZADO'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.barbearia_modulos bm
    WHERE bm.barbearia_id=v_barbearia AND bm.modulo='recepcao'
      AND public.modulo_contratado_e_vigente(bm.status_contrato,bm.trial_ate,bm.vigente_ate)
  ) THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  RETURN v_barbearia;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_operador_disponivel(p_barbearia uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.barbearia_id=p_barbearia AND p.role='recepcao' AND p.ativo
  ) OR EXISTS (
    SELECT 1 FROM public.recepcao_acessos_barbeiro a
    JOIN public.profiles p ON p.id=a.usuario_id AND p.barbearia_id=a.barbearia_id
    JOIN public.profissionais pr ON pr.user_id=p.id AND pr.barbearia_id=p.barbearia_id
    WHERE a.barbearia_id=p_barbearia AND a.permitido
      AND p.role='barbeiro' AND p.ativo AND pr.ativo
  );
$$;
REVOKE ALL ON FUNCTION public.recepcao_operador_disponivel(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.configuracoes_modulo_definir_ativo(
  p_modulo text,p_ativo boolean,p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_role text:=public.get_my_role();
  v_modulo public.barbearia_modulos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'MODULO_SEM_PERMISSAO';
  END IF;
  IF p_modulo IS NULL OR p_modulo<>'recepcao' OR p_ativo IS NULL THEN
    RAISE EXCEPTION 'MODULO_INVALIDO';
  END IF;
  SELECT * INTO v_modulo FROM public.barbearia_modulos
  WHERE barbearia_id=v_barbearia AND modulo=p_modulo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MODULO_NAO_CONTRATADO'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_modulo.updated_at<>p_expected_updated_at THEN
    RAISE EXCEPTION 'MODULO_CONFLITO_VERSAO';
  END IF;
  IF p_ativo AND NOT public.modulo_contratado_e_vigente(
    v_modulo.status_contrato,v_modulo.trial_ate,v_modulo.vigente_ate
  ) THEN RAISE EXCEPTION 'MODULO_NAO_CONTRATADO'; END IF;
  IF p_ativo AND NOT public.recepcao_operador_disponivel(v_barbearia) THEN
    RAISE EXCEPTION 'RECEPCAO_SEM_OPERADOR';
  END IF;
  UPDATE public.barbearia_modulos
  SET ativo_na_unidade=p_ativo,updated_at=clock_timestamp()
  WHERE id=v_modulo.id RETURNING * INTO v_modulo;
  RETURN jsonb_build_object('chave',v_modulo.modulo,'ativo',v_modulo.ativo_na_unidade,
    'status_contrato',v_modulo.status_contrato,'updated_at',v_modulo.updated_at);
END;
$$;

-- Não deixar o último acesso ser removido enquanto a recepção estiver ativa.
CREATE OR REPLACE FUNCTION public.recepcao_barbeiro_acesso_definir(p_usuario_id uuid,p_permitir boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_admin();
  v_perfil public.profiles%ROWTYPE;
  v_modulo_ativo boolean;
  v_updated timestamptz:=clock_timestamp();
BEGIN
  IF p_usuario_id IS NULL OR p_permitir IS NULL THEN RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO'; END IF;
  SELECT ativo_na_unidade INTO v_modulo_ativo FROM public.barbearia_modulos
  WHERE barbearia_id=v_barbearia AND modulo='recepcao' FOR UPDATE;
  SELECT * INTO v_perfil FROM public.profiles
  WHERE id=p_usuario_id AND barbearia_id=v_barbearia AND role='barbeiro' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_BARBEIRO_NAO_ENCONTRADO'; END IF;
  IF p_permitir AND (NOT coalesce(v_perfil.ativo,false) OR NOT EXISTS (
    SELECT 1 FROM public.profissionais pr
    WHERE pr.user_id=p_usuario_id AND pr.barbearia_id=v_barbearia AND pr.ativo
  )) THEN RAISE EXCEPTION 'RECEPCAO_BARBEIRO_INATIVO'; END IF;
  INSERT INTO public.recepcao_acessos_barbeiro(usuario_id,barbearia_id,permitido,atualizado_por,atualizado_em)
  VALUES(p_usuario_id,v_barbearia,p_permitir,auth.uid(),v_updated)
  ON CONFLICT(usuario_id) DO UPDATE
  SET permitido=EXCLUDED.permitido,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=EXCLUDED.atualizado_em
  WHERE public.recepcao_acessos_barbeiro.barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO'; END IF;
  IF NOT p_permitir AND coalesce(v_modulo_ativo,false)
     AND NOT public.recepcao_operador_disponivel(v_barbearia) THEN
    RAISE EXCEPTION 'RECEPCAO_ULTIMO_OPERADOR';
  END IF;
  RETURN jsonb_build_object('id',p_usuario_id,'acesso_recepcao',p_permitir,'atualizado_em',v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_usuario_atualizar(
  p_usuario_id uuid,p_nome text,p_telefone text,p_ativo boolean,p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_admin();
  v_modulo_ativo boolean;
  v_updated timestamptz:=clock_timestamp();
  v_result public.profiles%ROWTYPE;
BEGIN
  IF p_usuario_id IS NULL OR p_ativo IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO';
  END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'RECEPCAO_NOME_INVALIDO';
  END IF;
  IF p_telefone IS NOT NULL AND btrim(p_telefone)<>''
     AND length(btrim(p_telefone)) NOT BETWEEN 8 AND 30 THEN
    RAISE EXCEPTION 'RECEPCAO_TELEFONE_INVALIDO';
  END IF;
  SELECT ativo_na_unidade INTO v_modulo_ativo FROM public.barbearia_modulos
  WHERE barbearia_id=v_barbearia AND modulo='recepcao' FOR UPDATE;
  UPDATE public.profiles
  SET nome=btrim(p_nome),telefone=NULLIF(btrim(p_telefone),''),ativo=p_ativo,updated_at=v_updated
  WHERE id=p_usuario_id AND barbearia_id=v_barbearia AND role='recepcao'
    AND updated_at=p_expected_updated_at RETURNING * INTO v_result;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles
      WHERE id=p_usuario_id AND barbearia_id=v_barbearia AND role='recepcao') THEN
      RAISE EXCEPTION 'RECEPCAO_USUARIO_NAO_ENCONTRADO';
    END IF;
    RAISE EXCEPTION 'RECEPCAO_CONFLITO_VERSAO';
  END IF;
  IF NOT p_ativo AND coalesce(v_modulo_ativo,false)
     AND NOT public.recepcao_operador_disponivel(v_barbearia) THEN
    RAISE EXCEPTION 'RECEPCAO_ULTIMO_OPERADOR';
  END IF;
  RETURN jsonb_build_object('id',v_result.id,'ativo',v_result.ativo,'updated_at',v_result.updated_at);
END;
$$;

-- Desativar o profissional também retiraria sua capacidade de operar o balcão.
CREATE OR REPLACE FUNCTION public.barbeiros_atualizar(
  p_profissional_id uuid,p_nome text,p_apelido text,p_telefone text,p_especialidade text,
  p_comissao_percentual numeric,p_ativo boolean,p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_antes public.profissionais%ROWTYPE;
  v_depois public.profissionais%ROWTYPE;
  v_nome text:=btrim(p_nome);
  v_apelido text:=NULLIF(btrim(p_apelido),'');
  v_telefone text:=NULLIF(btrim(p_telefone),'');
  v_especialidade text:=NULLIF(btrim(p_especialidade),'');
  v_recepcao_ativa boolean;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role()<>'admin' OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO';
  END IF;
  IF p_profissional_id IS NULL OR p_expected_updated_at IS NULL OR p_ativo IS NULL THEN
    RAISE EXCEPTION 'BARBEIROS_DADOS_INVALIDOS';
  END IF;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'BARBEIROS_NOME_INVALIDO'; END IF;
  IF v_apelido IS NOT NULL AND length(v_apelido) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'BARBEIROS_APELIDO_INVALIDO'; END IF;
  IF v_telefone IS NOT NULL AND length(v_telefone) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'BARBEIROS_TELEFONE_INVALIDO'; END IF;
  IF v_especialidade IS NOT NULL AND length(v_especialidade)>100 THEN RAISE EXCEPTION 'BARBEIROS_ESPECIALIDADE_INVALIDA'; END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual<0 OR p_comissao_percentual>100) THEN
    RAISE EXCEPTION 'BARBEIROS_COMISSAO_INVALIDA';
  END IF;
  IF NOT p_ativo THEN
    SELECT ativo_na_unidade INTO v_recepcao_ativa FROM public.barbearia_modulos
    WHERE barbearia_id=v_barbearia AND modulo='recepcao' FOR UPDATE;
  END IF;
  SELECT * INTO v_antes FROM public.profissionais
  WHERE id=p_profissional_id AND barbearia_id=v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARBEIROS_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'BARBEIROS_CONFLITO_VERSAO'; END IF;
  UPDATE public.profissionais
  SET nome=v_nome,apelido=v_apelido,telefone=v_telefone,especialidade=v_especialidade,
    comissao_percentual=p_comissao_percentual,ativo=p_ativo,updated_at=clock_timestamp()
  WHERE id=v_antes.id RETURNING * INTO v_depois;
  IF NOT p_ativo AND coalesce(v_recepcao_ativa,false)
     AND NOT public.recepcao_operador_disponivel(v_barbearia) THEN
    RAISE EXCEPTION 'RECEPCAO_ULTIMO_OPERADOR';
  END IF;
  RETURN jsonb_build_object('id',v_depois.id,'ativo',v_depois.ativo,'updated_at',v_depois.updated_at);
END;
$$;
