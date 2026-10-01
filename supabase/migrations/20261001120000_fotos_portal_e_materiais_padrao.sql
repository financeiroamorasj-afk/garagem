-- Visualização privada das fotos no portal e catálogo inicial para reduzir o atrito de implantação.

CREATE OR REPLACE FUNCTION public.portal_corte_foto_path(p_token text, p_corte_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sessao public.portal_sessoes%ROWTYPE;
  v_path text;
BEGIN
  v_sessao := public.portal_sessao_validar(p_token);

  SELECT cc.foto_path
    INTO v_path
  FROM public.cliente_cortes cc
  WHERE cc.id = p_corte_id
    AND cc.barbearia_id = v_sessao.barbearia_id
    AND cc.cliente_id = v_sessao.cliente_id
    AND cc.foto_path IS NOT NULL
    AND cc.foto_excluida_em IS NULL;

  IF v_path IS NULL THEN
    RAISE EXCEPTION 'PORTAL_FOTO_NAO_ENCONTRADA';
  END IF;

  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_corte_foto_path(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_corte_foto_path(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.materiais_padrao_criar(p_barbearia_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inseridos integer;
BEGIN
  IF p_barbearia_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.barbearias b WHERE b.id = p_barbearia_id
  ) THEN
    RAISE EXCEPTION 'MATERIAIS_BARBEARIA_INVALIDA';
  END IF;

  WITH padrao(nome, tipo, unidade) AS (
    VALUES
      ('Lâmina descartável', 'insumo', 'unidade'),
      ('Papel de pescoço', 'insumo', 'unidade'),
      ('Luva descartável', 'insumo', 'par'),
      ('Algodão ou gaze', 'insumo', 'unidade'),
      ('Álcool 70%', 'insumo', 'ml'),
      ('Desinfetante para instrumentos', 'insumo', 'ml'),
      ('Creme, gel ou espuma de barbear', 'insumo', 'ml'),
      ('Óleo pré-barba', 'insumo', 'ml'),
      ('Balm ou loção pós-barba', 'insumo', 'ml'),
      ('Óleo para barba', 'insumo', 'ml'),
      ('Pomada ou cera modeladora', 'insumo', 'g'),
      ('Shampoo', 'insumo', 'ml'),
      ('Condicionador', 'insumo', 'ml'),
      ('Toalha limpa', 'ferramenta', 'unidade'),
      ('Capa de corte', 'ferramenta', 'unidade'),
      ('Máquina de corte', 'ferramenta', 'unidade'),
      ('Máquina de acabamento', 'ferramenta', 'unidade'),
      ('Pente de corte', 'ferramenta', 'unidade'),
      ('Jogo de pentes graduados', 'ferramenta', 'jogo'),
      ('Tesoura de corte', 'ferramenta', 'unidade'),
      ('Tesoura de desfiar', 'ferramenta', 'unidade'),
      ('Navalhete', 'ferramenta', 'unidade'),
      ('Escova para barba', 'ferramenta', 'unidade'),
      ('Borrifador de água', 'ferramenta', 'unidade'),
      ('Secador profissional', 'ferramenta', 'unidade')
  ), inseridos AS (
    INSERT INTO public.materiais_servico(barbearia_id, nome, tipo, unidade)
    SELECT p_barbearia_id, p.nome, p.tipo, p.unidade
    FROM padrao p
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.materiais_servico m
      WHERE m.barbearia_id = p_barbearia_id
        AND lower(btrim(m.nome)) = lower(btrim(p.nome))
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inseridos FROM inseridos;

  RETURN v_inseridos;
END;
$$;

REVOKE ALL ON FUNCTION public.materiais_padrao_criar(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.barbearia_materiais_padrao_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.materiais_padrao_criar(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.barbearia_materiais_padrao_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS barbearia_materiais_padrao_apos_criar ON public.barbearias;
CREATE TRIGGER barbearia_materiais_padrao_apos_criar
AFTER INSERT ON public.barbearias
FOR EACH ROW
EXECUTE FUNCTION public.barbearia_materiais_padrao_trigger();

DO $$
DECLARE
  v_barbearia_id uuid;
BEGIN
  FOR v_barbearia_id IN SELECT id FROM public.barbearias LOOP
    PERFORM public.materiais_padrao_criar(v_barbearia_id);
  END LOOP;
END;
$$;
