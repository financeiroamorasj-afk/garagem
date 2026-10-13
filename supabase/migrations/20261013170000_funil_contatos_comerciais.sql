-- Funil comercial do ADM da plataforma.
-- Contatos ainda não são tenants: a conversão preserva o histórico e cria
-- vínculos explícitos com a barbearia, o checkout e a assinatura reais.

CREATE TABLE public.saas_contatos_comerciais (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  nome_barbearia text NOT NULL CHECK (char_length(btrim(nome_barbearia)) BETWEEN 2 AND 120),
  nome_responsavel text CHECK (nome_responsavel IS NULL OR char_length(btrim(nome_responsavel)) BETWEEN 2 AND 120),
  telefone text,
  telefone_normalizado text CHECK (telefone_normalizado IS NULL OR telefone_normalizado ~ '^[0-9]{8,15}$'),
  instagram text,
  instagram_normalizado text CHECK (instagram_normalizado IS NULL OR instagram_normalizado ~ '^[a-z0-9._]{1,30}$'),
  email text CHECK (email IS NULL OR char_length(btrim(email)) BETWEEN 5 AND 254),
  cidade text CHECK (cidade IS NULL OR char_length(btrim(cidade)) BETWEEN 2 AND 100),
  uf text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  origem text NOT NULL DEFAULT 'instagram' CHECK (origem IN (
    'instagram','google_maps','indicacao','inbound','whatsapp','outro'
  )),
  etapa text NOT NULL DEFAULT 'novo' CHECK (etapa IN (
    'novo','contatado','respondeu','qualificado','proposta','convertido','perdido'
  )),
  responsavel_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  proxima_acao text CHECK (proxima_acao IS NULL OR char_length(btrim(proxima_acao)) BETWEEN 2 AND 200),
  proxima_acao_em timestamptz,
  ultima_interacao_em timestamptz,
  motivo_perda text CHECK (motivo_perda IS NULL OR char_length(btrim(motivo_perda)) BETWEEN 2 AND 240),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 3000),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  nao_contatar boolean NOT NULL DEFAULT false,
  barbearia_id uuid REFERENCES public.barbearias(id) ON DELETE RESTRICT,
  checkout_id uuid,
  assinatura_id uuid,
  convertido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,produto_id),
  FOREIGN KEY (checkout_id,produto_id) REFERENCES public.saas_checkouts(id,produto_id) ON DELETE RESTRICT,
  FOREIGN KEY (assinatura_id,produto_id) REFERENCES public.saas_assinaturas(id,produto_id) ON DELETE RESTRICT,
  CHECK (telefone_normalizado IS NOT NULL OR instagram_normalizado IS NOT NULL),
  CHECK (etapa <> 'perdido' OR motivo_perda IS NOT NULL),
  CHECK (etapa <> 'convertido' OR (barbearia_id IS NOT NULL AND convertido_em IS NOT NULL)),
  CHECK (NOT nao_contatar OR proxima_acao_em IS NULL)
);

CREATE UNIQUE INDEX saas_contatos_telefone_ativo_unique
ON public.saas_contatos_comerciais(produto_id,telefone_normalizado)
WHERE telefone_normalizado IS NOT NULL AND etapa NOT IN ('convertido','perdido');

CREATE INDEX saas_contatos_funil_idx
ON public.saas_contatos_comerciais(produto_id,etapa,proxima_acao_em NULLS LAST,created_at DESC);

CREATE INDEX saas_contatos_instagram_idx
ON public.saas_contatos_comerciais(produto_id,instagram_normalizado)
WHERE instagram_normalizado IS NOT NULL;

CREATE TABLE public.saas_contatos_interacoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  contato_id uuid NOT NULL,
  canal text NOT NULL CHECK (canal IN ('whatsapp','instagram','telefone','email','reuniao','nota')),
  tipo text NOT NULL CHECK (tipo IN ('primeira_abordagem','retorno','resposta_recebida','demonstracao','proposta','anotacao')),
  resumo text CHECK (resumo IS NULL OR char_length(btrim(resumo)) BETWEEN 2 AND 2000),
  resultado text CHECK (resultado IS NULL OR char_length(btrim(resultado)) BETWEEN 2 AND 500),
  etapa_anterior text NOT NULL CHECK (etapa_anterior IN (
    'novo','contatado','respondeu','qualificado','proposta','convertido','perdido'
  )),
  etapa_nova text CHECK (etapa_nova IS NULL OR etapa_nova IN (
    'novo','contatado','respondeu','qualificado','proposta','convertido','perdido'
  )),
  ocorrida_em timestamptz NOT NULL DEFAULT now(),
  autor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contato_id,produto_id) REFERENCES public.saas_contatos_comerciais(id,produto_id) ON DELETE RESTRICT
);

CREATE INDEX saas_contatos_interacoes_timeline_idx
ON public.saas_contatos_interacoes(contato_id,ocorrida_em DESC,created_at DESC);

CREATE TRIGGER saas_contatos_comerciais_touch
BEFORE UPDATE ON public.saas_contatos_comerciais
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.saas_contato_registrar_interacao(
  p_produto_id uuid,
  p_contato_id uuid,
  p_autor_user_id uuid,
  p_canal text,
  p_tipo text,
  p_resumo text,
  p_resultado text,
  p_etapa_nova text,
  p_ocorrida_em timestamptz,
  p_proxima_acao text,
  p_proxima_acao_em timestamptz,
  p_motivo_perda text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public,pg_temp
AS $$
DECLARE
  v_contato public.saas_contatos_comerciais%ROWTYPE;
  v_interacao_id uuid;
  v_etapa_nova text;
BEGIN
  SELECT * INTO v_contato
  FROM public.saas_contatos_comerciais
  WHERE id = p_contato_id AND produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAAS_CONTATO_NAO_ENCONTRADO';
  END IF;

  v_etapa_nova := COALESCE(p_etapa_nova,v_contato.etapa);
  IF v_contato.etapa = 'convertido' AND v_etapa_nova <> 'convertido' THEN
    RAISE EXCEPTION 'SAAS_CONTATO_CONVERTIDO_TERMINAL';
  END IF;
  IF v_etapa_nova = 'convertido' THEN
    RAISE EXCEPTION 'SAAS_CONTATO_CONVERSAO_EXIGE_VINCULO';
  END IF;
  IF v_etapa_nova = 'perdido' AND NULLIF(btrim(COALESCE(p_motivo_perda,'')),'') IS NULL THEN
    RAISE EXCEPTION 'SAAS_CONTATO_MOTIVO_PERDA_OBRIGATORIO';
  END IF;

  INSERT INTO public.saas_contatos_interacoes(
    produto_id,contato_id,canal,tipo,resumo,resultado,etapa_anterior,etapa_nova,ocorrida_em,autor_user_id
  ) VALUES (
    p_produto_id,p_contato_id,p_canal,p_tipo,NULLIF(btrim(COALESCE(p_resumo,'')),''),
    NULLIF(btrim(COALESCE(p_resultado,'')),''),v_contato.etapa,
    CASE WHEN v_etapa_nova = v_contato.etapa THEN NULL ELSE v_etapa_nova END,
    COALESCE(p_ocorrida_em,now()),p_autor_user_id
  )
  RETURNING id INTO v_interacao_id;

  UPDATE public.saas_contatos_comerciais
  SET etapa = v_etapa_nova,
      ultima_interacao_em = COALESCE(p_ocorrida_em,now()),
      proxima_acao = CASE
        WHEN v_etapa_nova = 'perdido' OR nao_contatar THEN NULL
        ELSE NULLIF(btrim(COALESCE(p_proxima_acao,'')),'')
      END,
      proxima_acao_em = CASE
        WHEN v_etapa_nova = 'perdido' OR nao_contatar THEN NULL
        ELSE p_proxima_acao_em
      END,
      motivo_perda = CASE
        WHEN v_etapa_nova = 'perdido' THEN btrim(p_motivo_perda)
        ELSE NULL
      END
  WHERE id = p_contato_id AND produto_id = p_produto_id;

  RETURN v_interacao_id;
END;
$$;

ALTER TABLE public.saas_contatos_comerciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_contatos_interacoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.saas_contatos_comerciais FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.saas_contatos_interacoes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.saas_contatos_comerciais TO service_role;
GRANT SELECT,INSERT ON TABLE public.saas_contatos_interacoes TO service_role;
REVOKE ALL ON FUNCTION public.saas_contato_registrar_interacao(uuid,uuid,uuid,text,text,text,text,text,timestamptz,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_contato_registrar_interacao(uuid,uuid,uuid,text,text,text,text,text,timestamptz,text,timestamptz,text) TO service_role;

COMMENT ON TABLE public.saas_contatos_comerciais IS 'Prospects comerciais do Garagem antes da criação do tenant.';
COMMENT ON TABLE public.saas_contatos_interacoes IS 'Linha do tempo imutável de interações comerciais registradas manualmente.';
