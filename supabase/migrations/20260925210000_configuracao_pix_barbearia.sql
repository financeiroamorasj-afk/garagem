BEGIN;

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS pix_beneficiario text,
  ADD COLUMN IF NOT EXISTS pix_cidade text;

ALTER TABLE public.barbearias
  DROP CONSTRAINT IF EXISTS barbearias_pix_configuracao_completa,
  ADD CONSTRAINT barbearias_pix_configuracao_completa CHECK (
    (pix_chave IS NULL AND pix_beneficiario IS NULL AND pix_cidade IS NULL)
    OR (
      char_length(pix_chave) BETWEEN 1 AND 77
      AND char_length(pix_beneficiario) BETWEEN 2 AND 25
      AND char_length(pix_cidade) BETWEEN 2 AND 15
    )
  );

CREATE OR REPLACE FUNCTION public.configuracoes_pix_obter()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid := public.get_my_barbearia_id();
  v_config public.barbearias%ROWTYPE;
BEGIN
  IF v_barbearia IS NULL THEN RAISE EXCEPTION 'PIX_ACESSO_NEGADO'; END IF;
  SELECT * INTO v_config FROM public.barbearias WHERE id = v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'PIX_ACESSO_NEGADO'; END IF;
  RETURN jsonb_build_object(
    'configurado', v_config.pix_chave IS NOT NULL,
    'chave', v_config.pix_chave,
    'beneficiario', v_config.pix_beneficiario,
    'cidade', v_config.pix_cidade
  );
END; $$;

CREATE OR REPLACE FUNCTION public.configuracoes_pix_salvar(
  p_chave text,
  p_beneficiario text,
  p_cidade text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_barbearia uuid := public.financeiro_assert_admin();
  v_chave text := NULLIF(btrim(p_chave), '');
  v_beneficiario text := NULLIF(btrim(p_beneficiario), '');
  v_cidade text := NULLIF(btrim(p_cidade), '');
  v_antes boolean;
BEGIN
  SELECT pix_chave IS NOT NULL INTO v_antes FROM public.barbearias WHERE id = v_barbearia FOR UPDATE;

  IF v_chave IS NULL AND v_beneficiario IS NULL AND v_cidade IS NULL THEN
    UPDATE public.barbearias
    SET pix_chave = NULL, pix_beneficiario = NULL, pix_cidade = NULL
    WHERE id = v_barbearia;
  ELSE
    IF v_chave IS NULL OR char_length(v_chave) > 77 THEN RAISE EXCEPTION 'PIX_CHAVE_INVALIDA'; END IF;
    IF v_beneficiario IS NULL OR char_length(v_beneficiario) NOT BETWEEN 2 AND 25 THEN RAISE EXCEPTION 'PIX_BENEFICIARIO_INVALIDO'; END IF;
    IF v_cidade IS NULL OR char_length(v_cidade) NOT BETWEEN 2 AND 15 THEN RAISE EXCEPTION 'PIX_CIDADE_INVALIDA'; END IF;
    UPDATE public.barbearias
    SET pix_chave = v_chave, pix_beneficiario = v_beneficiario, pix_cidade = v_cidade
    WHERE id = v_barbearia;
  END IF;

  PERFORM public.financeiro_auditar(
    v_barbearia,
    'rpc',
    'barbearias_pix',
    v_barbearia,
    jsonb_build_object('configurado', v_antes),
    jsonb_build_object('configurado', v_chave IS NOT NULL),
    NULL
  );

  RETURN public.configuracoes_pix_obter();
END; $$;

REVOKE ALL ON FUNCTION public.configuracoes_pix_obter() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configuracoes_pix_salvar(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configuracoes_pix_obter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.configuracoes_pix_salvar(text,text,text) TO authenticated;

COMMENT ON FUNCTION public.configuracoes_pix_obter() IS
  'Retorna somente a configuracao Pix da barbearia autenticada para gerar BR Code estatico no checkout.';
COMMENT ON FUNCTION public.configuracoes_pix_salvar(text,text,text) IS
  'Salva ou remove a configuracao Pix da unidade; somente administradores e sem registrar a chave na auditoria.';

COMMIT;
