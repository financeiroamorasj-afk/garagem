CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
ALTER FUNCTION public.clientes_listar(text,integer) SET search_path=public,extensions,pg_temp;
