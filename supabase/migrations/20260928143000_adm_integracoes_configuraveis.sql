-- Configurações extensíveis do ADM: gateways, APIs e módulos futuros.
--
-- Segredos nunca são persistidos nesta tabela. O banco guarda apenas o nome
-- da variável/cofre que o runtime deverá resolver no servidor.

ALTER TABLE public.saas_checkouts
  DROP CONSTRAINT IF EXISTS saas_checkouts_gateway_provider_check;
ALTER TABLE public.saas_checkouts
  ADD CONSTRAINT saas_checkouts_gateway_provider_check
  CHECK (gateway_provider IS NULL OR gateway_provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$');

ALTER TABLE public.saas_assinaturas
  DROP CONSTRAINT IF EXISTS saas_assinaturas_gateway_provider_check;
ALTER TABLE public.saas_assinaturas
  ADD CONSTRAINT saas_assinaturas_gateway_provider_check
  CHECK (gateway_provider IS NULL OR gateway_provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$');

ALTER TABLE public.saas_gateway_eventos
  DROP CONSTRAINT IF EXISTS saas_gateway_eventos_provider_check;
ALTER TABLE public.saas_gateway_eventos
  ADD CONSTRAINT saas_gateway_eventos_provider_check
  CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$');

CREATE TABLE public.plataforma_integracoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  produto_id uuid NOT NULL REFERENCES public.plataforma_produtos(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 100),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  ambiente text NOT NULL DEFAULT 'sandbox' CHECK (ambiente IN ('sandbox','producao')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','configurado','ativo','erro','inativo','arquivado')),
  principal boolean NOT NULL DEFAULT false,
  base_url text,
  credencial_ref text CHECK (credencial_ref IS NULL OR credencial_ref ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  webhook_secret_ref text CHECK (webhook_secret_ref IS NULL OR webhook_secret_ref ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  configuracao_publica jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuracao_publica) = 'object'),
  ultimo_teste_em timestamptz,
  ultima_falha_codigo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id,categoria,codigo,ambiente),
  UNIQUE (id,produto_id),
  CHECK (base_url IS NULL OR base_url ~ '^https?://')
);

CREATE UNIQUE INDEX plataforma_integracoes_principal_unique
ON public.plataforma_integracoes(produto_id,categoria,ambiente)
WHERE principal AND status <> 'arquivado';

CREATE INDEX plataforma_integracoes_categoria_idx
ON public.plataforma_integracoes(produto_id,categoria,status);

CREATE TRIGGER plataforma_integracoes_touch BEFORE UPDATE ON public.plataforma_integracoes
FOR EACH ROW EXECUTE FUNCTION public.saas_touch_updated_at();

INSERT INTO public.saas_modulos(
  produto_id,codigo,nome,descricao,entitlement_codigo,status,configuracao,ordem
)
SELECT id,'ia_gestao','IA para gestão',
  'Assistente para apoiar o barbeiro e a gestão da unidade.',
  'ia_gestao','rascunho','{"integracao_categoria":"ia_gestao"}'::jsonb,20
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id,codigo) DO NOTHING;

INSERT INTO public.saas_modulos(
  produto_id,codigo,nome,descricao,entitlement_codigo,status,configuracao,ordem
)
SELECT id,'ia_atendimento_whatsapp','IA para atendimento no WhatsApp',
  'Assistente para atender clientes pelo canal oficial da barbearia.',
  'ia_atendimento_whatsapp','rascunho',
  '{"integracao_categoria":"ia_atendimento_whatsapp","canal":"whatsapp"}'::jsonb,30
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id,codigo) DO NOTHING;

INSERT INTO public.plataforma_integracoes(
  produto_id,categoria,codigo,nome,provider,ambiente,status,principal,
  base_url,credencial_ref,webhook_secret_ref,configuracao_publica
)
SELECT id,'gateway_assinaturas','principal','Gateway de assinaturas','asaas',
  'sandbox','rascunho',true,'https://api-sandbox.asaas.com/v3',
  'ASAAS_API_KEY','ASAAS_WEBHOOK_SECRET',
  '{"external_reference_prefix":"garagem","formas_pagamento":["pix","cartao"]}'::jsonb
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id,categoria,codigo,ambiente) DO NOTHING;

INSERT INTO public.plataforma_integracoes(
  produto_id,categoria,codigo,nome,provider,ambiente,status,principal,
  base_url,credencial_ref,configuracao_publica
)
SELECT id,'ia_gestao','principal','IA de apoio à gestão','openai',
  'producao','rascunho',true,'https://api.openai.com/v1','OPENAI_API_KEY',
  '{"modelo":null,"limite_mensal":null}'::jsonb
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id,categoria,codigo,ambiente) DO NOTHING;

INSERT INTO public.plataforma_integracoes(
  produto_id,categoria,codigo,nome,provider,ambiente,status,principal,
  base_url,credencial_ref,configuracao_publica
)
SELECT id,'ia_atendimento_whatsapp','principal','IA de atendimento no WhatsApp','openai',
  'producao','rascunho',true,'https://api.openai.com/v1','OPENAI_API_KEY',
  '{"modelo":null,"canal_provider":null,"limite_mensal":null}'::jsonb
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id,categoria,codigo,ambiente) DO NOTHING;

ALTER TABLE public.plataforma_integracoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plataforma_integracoes FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.plataforma_integracoes TO service_role;

COMMENT ON TABLE public.plataforma_integracoes IS
  'Catálogo de adaptadores externos por produto. Guarda metadados e referências de segredo, nunca chaves de API.';
COMMENT ON COLUMN public.plataforma_integracoes.credencial_ref IS
  'Nome da variável de ambiente ou referência no cofre; o valor secreto não deve ser persistido.';
COMMENT ON COLUMN public.plataforma_integracoes.webhook_secret_ref IS
  'Nome da variável de ambiente ou referência no cofre para validar webhooks.';
