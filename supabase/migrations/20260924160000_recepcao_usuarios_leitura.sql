-- Recepção R2: usuários individuais e consultas operacionais sem acesso gerencial.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS profiles_recepcao_tenant_idx
  ON public.profiles(barbearia_id, ativo, nome)
  WHERE role = 'recepcao';

-- Perfis nunca devem ser promovidos ou alterados diretamente pelo cliente.
-- Convites usam service_role e as alterações permitidas passam pelas RPCs abaixo.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.modulo_acesso_verificar(p_modulo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid;
  v_perfil_ativo boolean := false;
  v_liberado boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_modulo IS NULL THEN RETURN false; END IF;

  SELECT p.barbearia_id, p.ativo
    INTO v_barbearia, v_perfil_ativo
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_barbearia IS NULL OR NOT COALESCE(v_perfil_ativo, false) THEN RETURN false; END IF;

  SELECT bm.ativo_na_unidade
         AND public.modulo_contratado_e_vigente(bm.status_contrato, bm.trial_ate, bm.vigente_ate)
    INTO v_liberado
  FROM public.barbearia_modulos bm
  WHERE bm.barbearia_id = v_barbearia AND bm.modulo = p_modulo;

  RETURN COALESCE(v_liberado, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_assert_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'RECEPCAO_ADMIN_NAO_AUTORIZADO';
  END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  RETURN v_barbearia;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_assert_operador()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() <> 'recepcao' THEN
    RAISE EXCEPTION 'RECEPCAO_NAO_AUTORIZADA';
  END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  RETURN v_barbearia;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_usuarios_listar(p_incluir_inativos boolean DEFAULT true)
RETURNS TABLE (
  id uuid, nome text, email text, telefone text, ativo boolean,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_barbearia uuid := public.recepcao_assert_admin();
BEGIN
  RETURN QUERY
  SELECT p.id, p.nome, p.email, p.telefone, p.ativo, p.created_at, p.updated_at
  FROM public.profiles p
  WHERE p.barbearia_id = v_barbearia
    AND p.role = 'recepcao'
    AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC, lower(p.nome), p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_usuario_atualizar(
  p_usuario_id uuid,
  p_nome text,
  p_telefone text,
  p_ativo boolean,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.recepcao_assert_admin();
  v_updated timestamptz := clock_timestamp();
  v_result public.profiles%ROWTYPE;
BEGIN
  IF p_usuario_id IS NULL OR p_ativo IS NULL OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'RECEPCAO_NOME_INVALIDO'; END IF;
  IF p_telefone IS NOT NULL AND btrim(p_telefone) <> '' AND length(btrim(p_telefone)) NOT BETWEEN 8 AND 30 THEN RAISE EXCEPTION 'RECEPCAO_TELEFONE_INVALIDO'; END IF;

  UPDATE public.profiles
  SET nome = btrim(p_nome), telefone = NULLIF(btrim(p_telefone), ''), ativo = p_ativo, updated_at = v_updated
  WHERE id = p_usuario_id AND barbearia_id = v_barbearia AND role = 'recepcao' AND updated_at = p_expected_updated_at
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_usuario_id AND barbearia_id = v_barbearia AND role = 'recepcao') THEN
      RAISE EXCEPTION 'RECEPCAO_USUARIO_NAO_ENCONTRADO';
    END IF;
    RAISE EXCEPTION 'RECEPCAO_CONFLITO_VERSAO';
  END IF;

  RETURN jsonb_build_object('id', v_result.id, 'ativo', v_result.ativo, 'updated_at', v_result.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_agenda_listar_periodo(p_data_inicial date, p_data_final date)
RETURNS TABLE (
  id uuid, profissional_id uuid, profissional_nome text, profissional_apelido text,
  cliente_id uuid, cliente_nome text, cliente_telefone text,
  servico_id uuid, servico_nome text, duracao_minutos integer,
  data_hora timestamptz, status text, valor_final numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final < p_data_inicial OR p_data_final - p_data_inicial > 13 THEN
    RAISE EXCEPTION 'RECEPCAO_PERIODO_INVALIDO';
  END IF;
  v_inicio := p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_data_final + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT a.id, a.profissional_id, p.nome, p.apelido, a.cliente_id,
    COALESCE(c.nome, NULLIF(btrim(a.cliente_nome_manual), ''), 'Cliente'), c.telefone,
    a.servico_id, COALESCE(s.nome, 'Serviço não informado'), COALESCE(s.duracao_minutos, 30),
    a.data_hora, a.status, a.valor_final
  FROM public.agendamentos a
  JOIN public.profissionais p ON p.id = a.profissional_id AND p.barbearia_id = a.barbearia_id
  LEFT JOIN public.clientes c ON c.id = a.cliente_id AND c.barbearia_id = a.barbearia_id
  LEFT JOIN public.servicos s ON s.id = a.servico_id AND s.barbearia_id = a.barbearia_id
  WHERE a.barbearia_id = v_barbearia AND a.data_hora >= v_inicio AND a.data_hora < v_fim
  ORDER BY a.data_hora, lower(COALESCE(p.apelido, p.nome)), a.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_clientes_buscar(p_busca text, p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, nome text, telefone text, proximo_horario timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.recepcao_assert_operador();
  v_busca text := btrim(COALESCE(p_busca, ''));
  v_digits text := regexp_replace(COALESCE(p_busca, ''), '\D', '', 'g');
BEGIN
  IF length(v_busca) < 2 OR p_limite NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'RECEPCAO_BUSCA_INVALIDA'; END IF;
  RETURN QUERY
  SELECT c.id, c.nome, c.telefone,
    (SELECT min(a.data_hora) FROM public.agendamentos a
      WHERE a.barbearia_id = v_barbearia AND a.cliente_id = c.id
        AND a.status IN ('pendente','confirmado','encaixe') AND a.data_hora >= now())
  FROM public.clientes c
  WHERE c.barbearia_id = v_barbearia AND (
    lower(extensions.unaccent(c.nome)) LIKE '%' || lower(extensions.unaccent(v_busca)) || '%'
    OR (length(v_digits) >= 3 AND regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%')
  )
  ORDER BY lower(c.nome), c.id LIMIT p_limite;
END;
$$;

-- A disponibilidade existente passa a aceitar a recepção somente quando o módulo está ativo.
CREATE OR REPLACE FUNCTION public.agenda_disponibilidade_periodo(p_data_inicial date,p_data_final date)
RETURNS TABLE (
  data date,profissional_id uuid,profissional_nome text,profissional_apelido text,
  jornada_ativa boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time,
  horarios_extras jsonb,bloqueios jsonb,conflitos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_role text:=public.get_my_role();
  v_profissional uuid:=public.get_my_profissional_id(); v_fuso text;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro','recepcao') THEN RAISE EXCEPTION 'DISPONIBILIDADE_VISUALIZACAO_NAO_AUTORIZADA'; END IF;
  IF v_role='recepcao' AND NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  IF v_role='barbeiro' AND v_profissional IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>31 THEN RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO'; END IF;
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo') INTO v_fuso FROM public.barbearias b WHERE b.id=v_barbearia;

  RETURN QUERY WITH datas AS (
    SELECT d::date dia FROM generate_series(p_data_inicial,p_data_final,interval '1 day') d
  ), equipe AS (
    SELECT p.id,p.nome,p.apelido FROM public.profissionais p WHERE p.barbearia_id=v_barbearia AND p.ativo
      AND (v_role IN ('admin','master','recepcao') OR p.id=v_profissional)
  ), base AS (
    SELECT d.dia,p.id,p.nome,p.apelido,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,
      d.dia::timestamp AT TIME ZONE v_fuso dia_inicio,(d.dia+1)::timestamp AT TIME ZONE v_fuso dia_fim
    FROM datas d CROSS JOIN equipe p LEFT JOIN public.profissionais_jornadas j ON j.barbearia_id=v_barbearia AND j.profissional_id=p.id AND j.dia_semana=extract(dow FROM d.dia)::smallint
  )
  SELECT b.dia,b.id,b.nome,b.apelido,COALESCE(b.ativo,false),b.hora_inicio,b.hora_fim,b.intervalo_inicio,b.intervalo_fim,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'inicio',h.hora_inicio,'fim',h.hora_fim,'motivo',h.motivo) ORDER BY h.hora_inicio,h.id) FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id)),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pb.id,'inicio',pb.inicio,'fim',pb.fim,'motivo',pb.motivo) ORDER BY pb.inicio,pb.id) FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<b.dia_fim AND pb.fim>b.dia_inicio),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('agendamento_id',a.id,'inicio',a.data_hora,'fim',a.data_fim,'cliente',COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),'motivos',to_jsonb(array_remove(ARRAY[
      CASE WHEN EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora) THEN 'Sobrepõe bloqueio' END,
      CASE WHEN NOT ((COALESCE(b.ativo,false) AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso)) OR EXISTS (SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id) AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso)) THEN 'Fora da disponibilidade' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.agendamentos oa WHERE oa.id<>a.id AND oa.barbearia_id=v_barbearia AND oa.profissional_id=b.id AND oa.status IN ('pendente','confirmado','encaixe','em_atendimento') AND oa.data_hora<a.data_fim AND oa.data_fim>a.data_hora) THEN 'Choque entre atendimentos' END
    ]::text[],NULL))) ORDER BY a.data_hora,a.id) FROM public.agendamentos a LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_barbearia AND a.profissional_id=b.id AND a.status IN ('pendente','confirmado','encaixe','em_atendimento') AND a.data_hora<b.dia_fim AND a.data_fim>b.dia_inicio AND (
        EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora)
        OR NOT ((COALESCE(b.ativo,false) AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso)) OR EXISTS (SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id) AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso))
        OR EXISTS (SELECT 1 FROM public.agendamentos oa WHERE oa.id<>a.id AND oa.barbearia_id=v_barbearia AND oa.profissional_id=b.id AND oa.status IN ('pendente','confirmado','encaixe','em_atendimento') AND oa.data_hora<a.data_fim AND oa.data_fim>a.data_hora)
      )),'[]'::jsonb)
  FROM base b ORDER BY b.dia,lower(COALESCE(b.apelido,b.nome)),b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.recepcao_assert_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recepcao_assert_operador() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recepcao_usuarios_listar(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recepcao_usuario_atualizar(uuid,text,text,boolean,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recepcao_agenda_listar_periodo(date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recepcao_clientes_buscar(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recepcao_usuarios_listar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_usuario_atualizar(uuid,text,text,boolean,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_agenda_listar_periodo(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_clientes_buscar(text,integer) TO authenticated;

