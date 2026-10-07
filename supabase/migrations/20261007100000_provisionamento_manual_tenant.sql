-- Permite ao ADM provisionar clientes antes da automação do gateway.
-- A origem manual usa o mesmo catálogo, assinatura, módulos e entitlements.

ALTER TABLE public.saas_checkouts
  DROP CONSTRAINT IF EXISTS saas_checkouts_forma_pagamento_check;
ALTER TABLE public.saas_checkouts
  ADD CONSTRAINT saas_checkouts_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix','cartao','pix_ou_cartao','manual'));

COMMENT ON COLUMN public.saas_checkouts.forma_pagamento IS
  'Forma escolhida no checkout ou manual quando a implantação foi criada pelo ADM.';
