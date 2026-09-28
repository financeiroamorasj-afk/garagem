-- Reparo emergencial aplicado uma única vez em produção em 26/09/2026.
--
-- Na ocasião, migrations anteriores haviam sido registradas como aplicadas sem
-- que todo o SQL tivesse sido executado. O snapshot original recompôs os objetos
-- ausentes diretamente no banco de produção, mas repete tabelas, funções, índices
-- e policies que já são criados pelas migrations anteriores em um banco novo.
--
-- Por isso, esta posição do histórico é intencionalmente um no-op em instalações
-- limpas. O SQL integral aplicado na recuperação foi preservado para auditoria em:
-- supabase/repairs/20260926193000_recupera_schema_operacional_producao.sql

DO $$
BEGIN
  RAISE NOTICE 'Reparo operacional histórico: nenhuma ação necessária em instalação limpa.';
END;
$$;
