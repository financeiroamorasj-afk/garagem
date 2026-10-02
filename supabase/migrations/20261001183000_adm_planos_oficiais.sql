-- Atualiza esquema de módulos para suportar preço anual e popula os planos oficiais do Garagem System.

ALTER TABLE public.saas_modulos
ADD COLUMN IF NOT EXISTS preco_anual numeric(12,2) CHECK (preco_anual IS NULL OR preco_anual >= 0);

-- 1. Plano Base
INSERT INTO public.saas_planos(produto_id, codigo, nome, descricao, status, preco_mensal, preco_anual, limite_usuarios, ordem)
SELECT id, 'base', 'Base', 'Indicado para quem atende sozinho e quer crescer no próprio ritmo.', 'ativo', 49.90, 478.80, 1, 10
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id, codigo) DO UPDATE
SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, status = EXCLUDED.status, preco_mensal = EXCLUDED.preco_mensal, preco_anual = EXCLUDED.preco_anual, limite_usuarios = EXCLUDED.limite_usuarios;

-- 2. Plano Gestão
INSERT INTO public.saas_planos(produto_id, codigo, nome, descricao, status, preco_mensal, preco_anual, limite_usuarios, ordem)
SELECT id, 'gestao', 'Gestão', 'Indicado para equipes que precisam enxergar a operação inteira.', 'ativo', 79.90, 766.80, 4, 20
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id, codigo) DO UPDATE
SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, status = EXCLUDED.status, preco_mensal = EXCLUDED.preco_mensal, preco_anual = EXCLUDED.preco_anual, limite_usuarios = EXCLUDED.limite_usuarios;

-- 3. Módulos Adicionais
-- 3.1. Recepção (já existe como rascunho, então damos UPDATE)
UPDATE public.saas_modulos
SET preco_mensal = 14.90, preco_anual = 142.80, status = 'ativo', descricao = 'Acesso dedicado, fila, check-in, cobrança no balcão e venda de produtos.'
WHERE codigo = 'recepcao' AND produto_id = (SELECT id FROM public.plataforma_produtos WHERE codigo = 'garagem');

-- 3.2. Profissional Adicional
INSERT INTO public.saas_modulos(produto_id, codigo, nome, descricao, entitlement_codigo, status, preco_mensal, preco_anual, ordem)
SELECT id, 'profissional_adicional', 'Profissional Adicional', 'Inclui novo acesso, agenda individual e participação na equipe.', 'profissional_adicional', 'ativo', 14.90, 142.80, 10
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id, codigo) DO UPDATE
SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, status = EXCLUDED.status, preco_mensal = EXCLUDED.preco_mensal, preco_anual = EXCLUDED.preco_anual;

-- 3.3. Modo TV
INSERT INTO public.saas_modulos(produto_id, codigo, nome, descricao, entitlement_codigo, status, preco_mensal, preco_anual, ordem)
SELECT id, 'modo_tv', 'Modo TV', 'Exibe a agenda da equipe e conteúdo em uma tela para a barbearia.', 'modo_tv', 'ativo', 9.90, 94.80, 20
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id, codigo) DO UPDATE
SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, status = EXCLUDED.status, preco_mensal = EXCLUDED.preco_mensal, preco_anual = EXCLUDED.preco_anual;

-- 4. Oferta Especial de Lançamento (Até 31/10)
INSERT INTO public.saas_ofertas(produto_id, codigo, descricao, desconto_percentual, membro_fundador, termina_em, ativo)
SELECT id, 'LANCAMENTO20', 'Desconto de 20% aplicável. Oferta de lançamento.', 20.00, true, '2026-10-31 23:59:59-03', true
FROM public.plataforma_produtos WHERE codigo = 'garagem'
ON CONFLICT (produto_id, codigo) DO UPDATE
SET descricao = EXCLUDED.descricao, desconto_percentual = EXCLUDED.desconto_percentual, termina_em = EXCLUDED.termina_em, ativo = EXCLUDED.ativo;
