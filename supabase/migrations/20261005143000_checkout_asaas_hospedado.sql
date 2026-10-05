-- Checkout hospedado do Asaas e snapshot dos módulos adquiridos.
-- Não armazena CPF/CNPJ nem dados de cartão; esses dados são coletados pelo Asaas.

ALTER TABLE public.saas_checkouts
  DROP CONSTRAINT IF EXISTS saas_checkouts_forma_pagamento_check;
ALTER TABLE public.saas_checkouts
  ADD CONSTRAINT saas_checkouts_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix','cartao','pix_ou_cartao'));

ALTER TABLE public.saas_checkouts
  ADD COLUMN IF NOT EXISTS gateway_checkout_id text;

CREATE UNIQUE INDEX IF NOT EXISTS saas_checkouts_gateway_checkout_unique
ON public.saas_checkouts(gateway_provider,gateway_ambiente,gateway_checkout_id)
WHERE gateway_checkout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.saas_checkout_modulos (
  checkout_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  modulo_id uuid NOT NULL,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade BETWEEN 1 AND 50),
  preco_unitario_lista numeric(12,2) NOT NULL CHECK (preco_unitario_lista >= 0),
  preco_unitario_final numeric(12,2) NOT NULL CHECK (
    preco_unitario_final >= 0 AND preco_unitario_final <= preco_unitario_lista
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (checkout_id,modulo_id),
  FOREIGN KEY (checkout_id,produto_id)
    REFERENCES public.saas_checkouts(id,produto_id) ON DELETE CASCADE,
  FOREIGN KEY (modulo_id,produto_id)
    REFERENCES public.saas_modulos(id,produto_id) ON DELETE RESTRICT
);

ALTER TABLE public.saas_assinatura_modulos
  ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1
  CHECK (quantidade BETWEEN 1 AND 50);

ALTER TABLE public.saas_checkout_modulos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_checkout_modulos FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.saas_checkout_modulos TO service_role;

COMMENT ON COLUMN public.saas_checkouts.gateway_checkout_id IS
  'Identificador da sessão de Checkout hospedado no gateway.';
COMMENT ON TABLE public.saas_checkout_modulos IS
  'Snapshot imutável dos módulos, quantidades e preços escolhidos na contratação.';
