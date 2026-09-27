-- Fundação do ADM de assinaturas do Garagem System.
--
-- Esta migration não integra com o Asaas e não define preços comerciais.
-- Ela cria a fonte de verdade necessária para operar planos e assinaturas
-- manualmente, mantendo o gateway como um adaptador posterior.

CREATE TABLE public.plataforma_produtos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  gateway_prefix text NOT NULL UNIQUE CHECK (gateway_prefix ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plataforma_produtos(codigo,nome,gateway_prefix)
VALUES ('garagem','Garagem System','garagem')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE public.plataforma_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin','financeiro','suporte')),
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.saas_planos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  descricao text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','arquivado')),
  preco_mensal numeric(12,2),
  preco_anual numeric(12,2),
  dias_trial integer NOT NULL DEFAULT 0 CHECK (dias_trial BETWEEN 0 AND 90),
  limite_usuarios integer CHECK (limite_usuarios IS NULL OR limite_usuarios > 0),
  recursos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(recursos) = 'object'),
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id,codigo),
  UNIQUE (id,produto_id),
  CHECK (preco_mensal IS NULL OR preco_mensal >= 0),
  CHECK (preco_anual IS NULL OR preco_anual >= 0),
  CHECK (status <> 'ativo' OR preco_mensal IS NOT NULL)
);

CREATE TABLE public.saas_modulos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  descricao text,
  entitlement_codigo text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','arquivado')),
  preco_mensal numeric(12,2) CHECK (preco_mensal IS NULL OR preco_mensal >= 0),
  configuracao jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuracao) = 'object'),
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id,codigo),
  UNIQUE (id,produto_id)
);

INSERT INTO public.saas_modulos(produto_id,codigo,nome,descricao,entitlement_codigo,status)
SELECT id,'recepcao','Recepção','Operação e cobrança centralizadas no balcão.','recepcao','rascunho'
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id,codigo) DO NOTHING;

CREATE TABLE public.saas_plano_modulos (
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  plano_id uuid NOT NULL,
  modulo_id uuid NOT NULL,
  incluido boolean NOT NULL DEFAULT true,
  limites jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limites) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plano_id,modulo_id),
  FOREIGN KEY (plano_id,produto_id) REFERENCES public.saas_planos(id,produto_id) ON DELETE CASCADE,
  FOREIGN KEY (modulo_id,produto_id) REFERENCES public.saas_modulos(id,produto_id) ON DELETE RESTRICT
);

CREATE TABLE public.saas_ofertas (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  plano_id uuid,
  codigo text NOT NULL CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  descricao text,
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
  membro_fundador boolean NOT NULL DEFAULT false,
  inicia_em timestamptz,
  termina_em timestamptz,
  limite_usos integer CHECK (limite_usos IS NULL OR limite_usos > 0),
  usos integer NOT NULL DEFAULT 0 CHECK (usos >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id,codigo),
  UNIQUE (id,produto_id),
  FOREIGN KEY (plano_id,produto_id) REFERENCES public.saas_planos(id,produto_id) ON DELETE RESTRICT,
  CHECK (termina_em IS NULL OR inicia_em IS NULL OR termina_em > inicia_em),
  CHECK (limite_usos IS NULL OR usos <= limite_usos)
);

CREATE TABLE public.saas_checkouts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  plano_id uuid NOT NULL,
  oferta_id uuid,
  status text NOT NULL DEFAULT 'iniciado' CHECK (status IN (
    'iniciado','aguardando_pagamento','pago','provisionando','concluido','expirado','falhou','cancelado'
  )),
  nome_barbearia text NOT NULL CHECK (char_length(btrim(nome_barbearia)) BETWEEN 2 AND 120),
  slug_desejado text NOT NULL CHECK (slug_desejado ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  nome_admin text NOT NULL CHECK (char_length(btrim(nome_admin)) BETWEEN 2 AND 120),
  email_admin text NOT NULL,
  telefone_admin text,
  documento_hash text,
  documento_final text CHECK (documento_final IS NULL OR documento_final ~ '^[0-9]{4}$'),
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('pix','cartao')),
  ciclo text NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal','anual')),
  preco_lista numeric(12,2) NOT NULL CHECK (preco_lista >= 0),
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
  preco_final numeric(12,2) NOT NULL CHECK (preco_final >= 0 AND preco_final <= preco_lista),
  membro_fundador boolean NOT NULL DEFAULT false,
  idempotency_key uuid NOT NULL UNIQUE,
  checkout_token_hash text NOT NULL UNIQUE,
  gateway_provider text CHECK (gateway_provider IS NULL OR gateway_provider = 'asaas'),
  gateway_ambiente text CHECK (gateway_ambiente IS NULL OR gateway_ambiente IN ('sandbox','producao')),
  gateway_customer_id text,
  gateway_subscription_id text,
  gateway_payment_id text,
  gateway_external_reference text UNIQUE,
  link_pagamento text,
  barbearia_id uuid REFERENCES public.barbearias(id) ON DELETE SET NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  etapas_concluidas jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(etapas_concluidas) = 'object'),
  falha_codigo text,
  falha_detalhe text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,produto_id),
  FOREIGN KEY (plano_id,produto_id) REFERENCES public.saas_planos(id,produto_id) ON DELETE RESTRICT,
  FOREIGN KEY (oferta_id,produto_id) REFERENCES public.saas_ofertas(id,produto_id) ON DELETE RESTRICT,
  CHECK (char_length(btrim(email_admin)) BETWEEN 5 AND 254)
);

CREATE UNIQUE INDEX saas_checkouts_slug_aberto_unique
ON public.saas_checkouts(produto_id,slug_desejado)
WHERE status IN ('iniciado','aguardando_pagamento','pago','provisionando');

CREATE INDEX saas_checkouts_email_idx ON public.saas_checkouts(lower(email_admin));
CREATE INDEX saas_checkouts_status_idx ON public.saas_checkouts(status,created_at DESC);

CREATE TABLE public.saas_assinaturas (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE RESTRICT,
  plano_id uuid NOT NULL,
  checkout_id uuid,
  status text NOT NULL DEFAULT 'aguardando_pagamento' CHECK (status IN (
    'aguardando_pagamento','trial','ativo','inadimplente','suspenso','cancelado','expirado'
  )),
  ciclo text NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal','anual')),
  preco_lista numeric(12,2) NOT NULL CHECK (preco_lista >= 0),
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
  preco_final numeric(12,2) NOT NULL CHECK (preco_final >= 0 AND preco_final <= preco_lista),
  membro_fundador boolean NOT NULL DEFAULT false,
  desconto_expira_em date,
  trial_ate timestamptz,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  suspenso_em timestamptz,
  cancelado_em timestamptz,
  gateway_provider text CHECK (gateway_provider IS NULL OR gateway_provider = 'asaas'),
  gateway_ambiente text CHECK (gateway_ambiente IS NULL OR gateway_ambiente IN ('sandbox','producao')),
  gateway_customer_id text,
  gateway_subscription_id text,
  gateway_external_reference text UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,produto_id),
  FOREIGN KEY (plano_id,produto_id) REFERENCES public.saas_planos(id,produto_id) ON DELETE RESTRICT,
  FOREIGN KEY (checkout_id,produto_id) REFERENCES public.saas_checkouts(id,produto_id) ON DELETE RESTRICT,
  CHECK (status <> 'trial' OR trial_ate IS NOT NULL),
  CHECK (periodo_fim IS NULL OR periodo_inicio IS NULL OR periodo_fim > periodo_inicio)
);

CREATE UNIQUE INDEX saas_assinaturas_corrente_unique
ON public.saas_assinaturas(produto_id,barbearia_id)
WHERE status IN ('aguardando_pagamento','trial','ativo','inadimplente','suspenso');

CREATE UNIQUE INDEX saas_assinaturas_gateway_subscription_unique
ON public.saas_assinaturas(gateway_provider,gateway_ambiente,gateway_subscription_id)
WHERE gateway_subscription_id IS NOT NULL;

CREATE TABLE public.saas_assinatura_modulos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  assinatura_id uuid NOT NULL,
  modulo_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('trial','ativo','suspenso','cancelado','expirado')),
  preco_lista numeric(12,2) NOT NULL DEFAULT 0 CHECK (preco_lista >= 0),
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
  preco_final numeric(12,2) NOT NULL DEFAULT 0 CHECK (preco_final >= 0 AND preco_final <= preco_lista),
  trial_ate timestamptz,
  vigente_ate timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assinatura_id,modulo_id),
  FOREIGN KEY (assinatura_id,produto_id) REFERENCES public.saas_assinaturas(id,produto_id) ON DELETE CASCADE,
  FOREIGN KEY (modulo_id,produto_id) REFERENCES public.saas_modulos(id,produto_id) ON DELETE RESTRICT,
  CHECK (status <> 'trial' OR trial_ate IS NOT NULL)
);

CREATE TABLE public.saas_provisionamento_etapas (
  checkout_id uuid NOT NULL REFERENCES public.saas_checkouts(id) ON DELETE CASCADE,
  etapa text NOT NULL CHECK (etapa IN (
    'barbearia_criada','admin_auth_criado','profile_vinculado','assinatura_criada','convite_enviado'
  )),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','executando','concluida','falhou')),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  erro_codigo text,
  erro_detalhe text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (checkout_id,etapa)
);

CREATE TABLE public.saas_gateway_eventos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = 'asaas'),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox','producao')),
  event_id text NOT NULL,
  event_type text NOT NULL,
  resource_id text,
  checkout_id uuid,
  assinatura_id uuid,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','processando','processado','ignorado','falhou')),
  payload_sanitizado jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload_sanitizado) = 'object'),
  payload_sha256 text,
  erro_codigo text,
  erro_detalhe text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  UNIQUE (provider,ambiente,event_id),
  FOREIGN KEY (checkout_id,produto_id) REFERENCES public.saas_checkouts(id,produto_id) ON DELETE RESTRICT,
  FOREIGN KEY (assinatura_id,produto_id) REFERENCES public.saas_assinaturas(id,produto_id) ON DELETE RESTRICT
);

CREATE TABLE public.saas_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id uuid REFERENCES public.plataforma_produtos(id) ON DELETE SET NULL,
  ator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ator_role text,
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id text,
  estado_anterior jsonb,
  estado_novo jsonb,
  correlation_id text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX saas_auditoria_entidade_idx ON public.saas_auditoria(entidade,entidade_id,created_at DESC);
CREATE INDEX saas_gateway_eventos_status_idx ON public.saas_gateway_eventos(status,recebido_em);

CREATE OR REPLACE FUNCTION public.saas_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public,pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER plataforma_produtos_touch BEFORE UPDATE ON public.plataforma_produtos
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER plataforma_admins_touch BEFORE UPDATE ON public.plataforma_admins
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_planos_touch BEFORE UPDATE ON public.saas_planos
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_modulos_touch BEFORE UPDATE ON public.saas_modulos
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_ofertas_touch BEFORE UPDATE ON public.saas_ofertas
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_checkouts_touch BEFORE UPDATE ON public.saas_checkouts
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_assinaturas_touch BEFORE UPDATE ON public.saas_assinaturas
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_assinatura_modulos_touch BEFORE UPDATE ON public.saas_assinatura_modulos
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();
CREATE TRIGGER saas_provisionamento_etapas_touch BEFORE UPDATE ON public.saas_provisionamento_etapas
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.plataforma_admin_tem_acesso(p_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public,auth,pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.plataforma_admins a
    WHERE a.user_id = auth.uid()
      AND a.ativo
      AND (p_roles IS NULL OR a.role = ANY(p_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.saas_entitlements_sincronizar(p_assinatura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,pg_temp
AS $$
DECLARE
  v_assinatura public.saas_assinaturas%ROWTYPE;
  v_recepcao_incluida boolean := false;
  v_status_contrato text := 'nao_contratado';
BEGIN
  SELECT * INTO v_assinatura
  FROM public.saas_assinaturas
  WHERE id = p_assinatura_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAAS_ASSINATURA_NAO_ENCONTRADA';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.saas_modulos m
    LEFT JOIN public.saas_plano_modulos pm
      ON pm.modulo_id = m.id
     AND pm.plano_id = v_assinatura.plano_id
     AND pm.incluido
    LEFT JOIN public.saas_assinatura_modulos am
      ON am.modulo_id = m.id
     AND am.assinatura_id = v_assinatura.id
     AND am.status IN ('trial','ativo')
    WHERE m.produto_id = v_assinatura.produto_id
      AND m.entitlement_codigo = 'recepcao'
      AND (pm.plano_id IS NOT NULL OR am.id IS NOT NULL)
  ) INTO v_recepcao_incluida;

  IF v_recepcao_incluida THEN
    v_status_contrato := CASE v_assinatura.status
      WHEN 'trial' THEN 'trial'
      WHEN 'ativo' THEN 'ativo'
      WHEN 'cancelado' THEN 'cancelado'
      ELSE 'suspenso'
    END;
  END IF;

  IF v_recepcao_incluida THEN
    INSERT INTO public.barbearia_modulos(
      barbearia_id,modulo,status_contrato,ativo_na_unidade,trial_ate,vigente_ate
    ) VALUES (
      v_assinatura.barbearia_id,'recepcao',v_status_contrato,false,
      CASE WHEN v_status_contrato = 'trial' THEN v_assinatura.trial_ate ELSE NULL END,
      CASE WHEN v_status_contrato = 'ativo' THEN v_assinatura.periodo_fim ELSE NULL END
    )
    ON CONFLICT (barbearia_id,modulo) DO UPDATE
    SET status_contrato = EXCLUDED.status_contrato,
        ativo_na_unidade = CASE
          WHEN EXCLUDED.status_contrato IN ('trial','ativo') THEN public.barbearia_modulos.ativo_na_unidade
          ELSE false
        END,
        trial_ate = EXCLUDED.trial_ate,
        vigente_ate = EXCLUDED.vigente_ate,
        updated_at = clock_timestamp();
  ELSE
    UPDATE public.barbearia_modulos
    SET status_contrato = 'nao_contratado',
        ativo_na_unidade = false,
        trial_ate = NULL,
        vigente_ate = NULL,
        updated_at = clock_timestamp()
    WHERE barbearia_id = v_assinatura.barbearia_id
      AND modulo = 'recepcao';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_assinatura_mudar_status(
  p_assinatura_id uuid,
  p_novo_status text,
  p_motivo text,
  p_origem text DEFAULT 'adm',
  p_correlation_id text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,pg_temp
AS $$
DECLARE
  v_anterior public.saas_assinaturas%ROWTYPE;
  v_nova public.saas_assinaturas%ROWTYPE;
  v_transicao_valida boolean := false;
BEGIN
  IF p_novo_status IS NULL OR p_novo_status NOT IN (
    'aguardando_pagamento','trial','ativo','inadimplente','suspenso','cancelado','expirado'
  ) THEN
    RAISE EXCEPTION 'SAAS_STATUS_INVALIDO';
  END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'SAAS_MOTIVO_OBRIGATORIO';
  END IF;

  SELECT * INTO v_anterior
  FROM public.saas_assinaturas
  WHERE id = p_assinatura_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SAAS_ASSINATURA_NAO_ENCONTRADA'; END IF;
  IF p_expected_version IS NOT NULL AND v_anterior.version <> p_expected_version THEN
    RAISE EXCEPTION 'SAAS_CONFLITO_VERSAO';
  END IF;
  IF v_anterior.status = p_novo_status THEN
    RETURN jsonb_build_object('id',v_anterior.id,'status',v_anterior.status,'version',v_anterior.version,'inalterada',true);
  END IF;

  v_transicao_valida := CASE v_anterior.status
    WHEN 'aguardando_pagamento' THEN p_novo_status IN ('trial','ativo','cancelado')
    WHEN 'trial' THEN p_novo_status IN ('ativo','suspenso','cancelado','expirado')
    WHEN 'ativo' THEN p_novo_status IN ('inadimplente','suspenso','cancelado','expirado')
    WHEN 'inadimplente' THEN p_novo_status IN ('ativo','suspenso','cancelado')
    WHEN 'suspenso' THEN p_novo_status IN ('ativo','cancelado','expirado')
    ELSE false
  END;

  IF NOT v_transicao_valida THEN RAISE EXCEPTION 'SAAS_TRANSICAO_INVALIDA'; END IF;

  UPDATE public.saas_assinaturas
  SET status = p_novo_status,
      version = version + 1,
      suspenso_em = CASE WHEN p_novo_status = 'suspenso' THEN clock_timestamp() ELSE suspenso_em END,
      cancelado_em = CASE WHEN p_novo_status = 'cancelado' THEN clock_timestamp() ELSE cancelado_em END
  WHERE id = p_assinatura_id
  RETURNING * INTO v_nova;

  INSERT INTO public.saas_auditoria(
    produto_id,acao,entidade,entidade_id,estado_anterior,estado_novo,correlation_id
  ) VALUES (
    v_nova.produto_id,
    'assinatura.status_alterado:' || COALESCE(NULLIF(btrim(p_origem),''),'adm'),
    'saas_assinaturas',
    v_nova.id::text,
    jsonb_build_object('status',v_anterior.status,'version',v_anterior.version),
    jsonb_build_object('status',v_nova.status,'version',v_nova.version,'motivo',btrim(p_motivo)),
    p_correlation_id
  );

  PERFORM public.saas_entitlements_sincronizar(v_nova.id);

  RETURN jsonb_build_object('id',v_nova.id,'status',v_nova.status,'version',v_nova.version,'inalterada',false);
END;
$$;

ALTER TABLE public.plataforma_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plano_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_assinatura_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_provisionamento_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_gateway_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plataforma_produtos,public.plataforma_admins,
  public.saas_planos,public.saas_modulos,public.saas_plano_modulos,public.saas_ofertas,
  public.saas_checkouts,public.saas_assinaturas,public.saas_assinatura_modulos,
  public.saas_provisionamento_etapas,public.saas_gateway_eventos,public.saas_auditoria
FROM PUBLIC,anon,authenticated;

GRANT ALL ON TABLE public.plataforma_produtos,public.plataforma_admins,
  public.saas_planos,public.saas_modulos,public.saas_plano_modulos,public.saas_ofertas,
  public.saas_checkouts,public.saas_assinaturas,public.saas_assinatura_modulos,
  public.saas_provisionamento_etapas,public.saas_gateway_eventos,public.saas_auditoria
TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.saas_auditoria_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.saas_touch_updated_at() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.plataforma_admin_tem_acesso(text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.saas_entitlements_sincronizar(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_assinatura_mudar_status(uuid,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.saas_touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.plataforma_admin_tem_acesso(text[]) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.saas_entitlements_sincronizar(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_assinatura_mudar_status(uuid,text,text,text,text,integer) TO service_role;

COMMENT ON TABLE public.saas_planos IS 'Catálogo comercial versionável. Preços permanecem nulos enquanto o plano estiver em rascunho.';
COMMENT ON TABLE public.saas_checkouts IS 'Intenção de contratação antes do provisionamento. Não persiste CPF/CNPJ integral nem dados de cartão.';
COMMENT ON TABLE public.saas_gateway_eventos IS 'Caixa de entrada idempotente para webhooks sanitizados. A chave inclui ambiente para separar sandbox e produção.';
COMMENT ON FUNCTION public.saas_assinatura_mudar_status(uuid,text,text,text,text,integer) IS 'Máquina de estados da assinatura, com concorrência otimista, auditoria e sincronização de entitlements.';
