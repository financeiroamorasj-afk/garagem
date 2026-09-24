-- Fundação de módulos opcionais da assinatura.
-- O estado comercial é administrado somente pela plataforma; a barbearia pode
-- apenas ativar ou desativar na unidade um módulo que esteja vigente.

CREATE TABLE public.barbearia_modulos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  modulo text NOT NULL CHECK (modulo IN ('recepcao')),
  status_contrato text NOT NULL DEFAULT 'nao_contratado'
    CHECK (status_contrato IN ('nao_contratado', 'trial', 'ativo', 'suspenso', 'cancelado')),
  ativo_na_unidade boolean NOT NULL DEFAULT false,
  trial_ate timestamptz,
  vigente_ate timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, modulo),
  CHECK (status_contrato <> 'trial' OR trial_ate IS NOT NULL)
);

ALTER TABLE public.barbearia_modulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY barbearia_modulos_leitura_admin
ON public.barbearia_modulos
FOR SELECT TO authenticated
USING (
  barbearia_id = public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin', 'master')
);

REVOKE ALL ON TABLE public.barbearia_modulos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.barbearia_modulos TO authenticated;

COMMENT ON TABLE public.barbearia_modulos IS
  'Entitlements comerciais e ativação por unidade. status_contrato é alterado somente pela plataforma.';
COMMENT ON COLUMN public.barbearia_modulos.status_contrato IS
  'Estado comercial controlado pelo Garagem System; nunca editável pelo tenant.';

CREATE OR REPLACE FUNCTION public.modulo_contratado_e_vigente(
  p_status text,
  p_trial_ate timestamptz,
  p_vigente_ate timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_status = 'trial' THEN p_trial_ate IS NOT NULL AND p_trial_ate >= now()
    WHEN p_status = 'ativo' THEN p_vigente_ate IS NULL OR p_vigente_ate >= now()
    ELSE false
  END;
$$;

-- A função usa auth.uid() apenas por meio dos helpers existentes e retorna um
-- booleano mínimo para proteger qualquer rota/ação de módulo no backend.
CREATE OR REPLACE FUNCTION public.modulo_acesso_verificar(p_modulo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_liberado boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR p_modulo IS NULL THEN
    RETURN false;
  END IF;

  SELECT bm.ativo_na_unidade
         AND public.modulo_contratado_e_vigente(bm.status_contrato, bm.trial_ate, bm.vigente_ate)
    INTO v_liberado
  FROM public.barbearia_modulos bm
  WHERE bm.barbearia_id = v_barbearia
    AND bm.modulo = p_modulo;

  RETURN COALESCE(v_liberado, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.configuracoes_modulos_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_role text := public.get_my_role();
  v_modulo public.barbearia_modulos%ROWTYPE;
  v_vigente boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'MODULO_SEM_PERMISSAO';
  END IF;

  SELECT * INTO v_modulo
  FROM public.barbearia_modulos
  WHERE barbearia_id = v_barbearia AND modulo = 'recepcao';

  IF FOUND THEN
    v_vigente := public.modulo_contratado_e_vigente(
      v_modulo.status_contrato,
      v_modulo.trial_ate,
      v_modulo.vigente_ate
    );
  END IF;

  RETURN jsonb_build_array(jsonb_build_object(
    'chave', 'recepcao',
    'nome', 'Recepção',
    'descricao', 'Atendimento e cobrança no balcão, com produtos encaminhados pela equipe.',
    'status_contrato', CASE WHEN FOUND THEN v_modulo.status_contrato ELSE 'nao_contratado' END,
    'contratado', v_vigente,
    'ativo', CASE WHEN FOUND THEN v_modulo.ativo_na_unidade AND v_vigente ELSE false END,
    'trial_ate', CASE WHEN FOUND THEN v_modulo.trial_ate ELSE NULL END,
    'vigente_ate', CASE WHEN FOUND THEN v_modulo.vigente_ate ELSE NULL END,
    'updated_at', CASE WHEN FOUND THEN v_modulo.updated_at ELSE NULL END
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.configuracoes_modulo_definir_ativo(
  p_modulo text,
  p_ativo boolean,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_role text := public.get_my_role();
  v_modulo public.barbearia_modulos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'MODULO_SEM_PERMISSAO';
  END IF;
  IF p_modulo IS NULL OR p_modulo <> 'recepcao' OR p_ativo IS NULL THEN
    RAISE EXCEPTION 'MODULO_INVALIDO';
  END IF;

  SELECT * INTO v_modulo
  FROM public.barbearia_modulos
  WHERE barbearia_id = v_barbearia AND modulo = p_modulo
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODULO_NAO_CONTRATADO';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_modulo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'MODULO_CONFLITO_VERSAO';
  END IF;
  IF p_ativo AND NOT public.modulo_contratado_e_vigente(
    v_modulo.status_contrato,
    v_modulo.trial_ate,
    v_modulo.vigente_ate
  ) THEN
    RAISE EXCEPTION 'MODULO_NAO_CONTRATADO';
  END IF;

  UPDATE public.barbearia_modulos
  SET ativo_na_unidade = p_ativo,
      updated_at = clock_timestamp()
  WHERE id = v_modulo.id
  RETURNING * INTO v_modulo;

  RETURN jsonb_build_object(
    'chave', v_modulo.modulo,
    'ativo', v_modulo.ativo_na_unidade,
    'status_contrato', v_modulo.status_contrato,
    'updated_at', v_modulo.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.modulo_contratado_e_vigente(text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.modulo_acesso_verificar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configuracoes_modulos_listar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configuracoes_modulo_definir_ativo(text,boolean,timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.modulo_acesso_verificar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configuracoes_modulos_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.configuracoes_modulo_definir_ativo(text,boolean,timestamptz) TO authenticated;
