-- Reserva o módulo fiscal no catálogo comercial. A integração e o provedor serão definidos depois.

INSERT INTO public.saas_modulos(
  produto_id, codigo, nome, descricao, entitlement_codigo, status,
  preco_mensal, configuracao, ordem
)
SELECT
  id,
  'fiscal',
  'Módulo fiscal',
  'Emissão e gestão fiscal para a operação da barbearia, comercializável como adicional ou em pacote anual.',
  'fiscal',
  'rascunho',
  NULL,
  jsonb_build_object(
    'provisionamento', 'pendente',
    'escopo_inicial', jsonb_build_array('configuracao_fiscal', 'emissao_documentos', 'historico_documentos'),
    'oferta_recomendada', jsonb_build_object('ciclo', 'anual', 'permite_desconto', true),
    'provedor', NULL::text
  ),
  40
FROM public.plataforma_produtos
WHERE codigo = 'garagem'
ON CONFLICT (produto_id, codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    entitlement_codigo = EXCLUDED.entitlement_codigo,
    configuracao = public.saas_modulos.configuracao || EXCLUDED.configuracao,
    ordem = EXCLUDED.ordem,
    updated_at = now();

COMMENT ON COLUMN public.saas_modulos.configuracao IS
  'Metadados públicos do módulo. Segredos e credenciais de provedores nunca devem ser armazenados aqui.';
