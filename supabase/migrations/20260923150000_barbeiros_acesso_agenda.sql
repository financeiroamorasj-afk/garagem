-- Cadastro administrativo de barbeiros e vínculo seguro com o usuário de acesso.

ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS apelido text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS profissionais_user_id_unique
  ON public.profissionais (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.profissionais
  DROP CONSTRAINT IF EXISTS profissionais_apelido_check,
  ADD CONSTRAINT profissionais_apelido_check
    CHECK (apelido IS NULL OR length(btrim(apelido)) BETWEEN 2 AND 60),
  DROP CONSTRAINT IF EXISTS profissionais_telefone_check,
  ADD CONSTRAINT profissionais_telefone_check
    CHECK (telefone IS NULL OR length(btrim(telefone)) BETWEEN 8 AND 30),
  DROP CONSTRAINT IF EXISTS profissionais_especialidade_check,
  ADD CONSTRAINT profissionais_especialidade_check
    CHECK (especialidade IS NULL OR length(btrim(especialidade)) <= 100);

CREATE OR REPLACE FUNCTION public.barbeiros_listar(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  nome text,
  apelido text,
  telefone text,
  especialidade text,
  foto_url text,
  comissao_percentual numeric,
  ativo boolean,
  user_id uuid,
  email text,
  criado_em timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'admin' OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.apelido,
    p.telefone,
    p.especialidade,
    p.foto_url,
    p.comissao_percentual,
    p.ativo,
    p.user_id,
    pr.email,
    p.criado_em,
    p.updated_at
  FROM public.profissionais p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id AND pr.barbearia_id = p.barbearia_id
  WHERE p.barbearia_id = v_barbearia
    AND (p_incluir_inativos OR p.ativo)
  ORDER BY p.ativo DESC, COALESCE(NULLIF(btrim(p.apelido), ''), p.nome), p.nome;
END;
$$;

CREATE OR REPLACE FUNCTION public.barbeiros_atualizar(
  p_profissional_id uuid,
  p_nome text,
  p_apelido text,
  p_telefone text,
  p_especialidade text,
  p_comissao_percentual numeric,
  p_ativo boolean,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_antes public.profissionais%ROWTYPE;
  v_depois public.profissionais%ROWTYPE;
  v_nome text := btrim(p_nome);
  v_apelido text := NULLIF(btrim(p_apelido), '');
  v_telefone text := NULLIF(btrim(p_telefone), '');
  v_especialidade text := NULLIF(btrim(p_especialidade), '');
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'admin' OR v_barbearia IS NULL THEN
    RAISE EXCEPTION 'BARBEIROS_NAO_AUTORIZADO';
  END IF;
  IF p_profissional_id IS NULL OR p_expected_updated_at IS NULL OR p_ativo IS NULL THEN
    RAISE EXCEPTION 'BARBEIROS_DADOS_INVALIDOS';
  END IF;
  IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'BARBEIROS_NOME_INVALIDO';
  END IF;
  IF v_apelido IS NOT NULL AND length(v_apelido) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'BARBEIROS_APELIDO_INVALIDO';
  END IF;
  IF v_telefone IS NOT NULL AND length(v_telefone) NOT BETWEEN 8 AND 30 THEN
    RAISE EXCEPTION 'BARBEIROS_TELEFONE_INVALIDO';
  END IF;
  IF v_especialidade IS NOT NULL AND length(v_especialidade) > 100 THEN
    RAISE EXCEPTION 'BARBEIROS_ESPECIALIDADE_INVALIDA';
  END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN
    RAISE EXCEPTION 'BARBEIROS_COMISSAO_INVALIDA';
  END IF;

  SELECT * INTO v_antes
  FROM public.profissionais
  WHERE id = p_profissional_id AND barbearia_id = v_barbearia
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'BARBEIROS_NAO_ENCONTRADO'; END IF;
  IF v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'BARBEIROS_CONFLITO_VERSAO';
  END IF;

  UPDATE public.profissionais
  SET nome = v_nome,
      apelido = v_apelido,
      telefone = v_telefone,
      especialidade = v_especialidade,
      comissao_percentual = p_comissao_percentual,
      ativo = p_ativo,
      updated_at = clock_timestamp()
  WHERE id = v_antes.id
  RETURNING * INTO v_depois;

  RETURN jsonb_build_object(
    'id', v_depois.id,
    'ativo', v_depois.ativo,
    'updated_at', v_depois.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.barbeiros_listar(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barbeiros_listar(boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,boolean,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barbeiros_atualizar(uuid,text,text,text,text,numeric,boolean,timestamptz) TO authenticated;
