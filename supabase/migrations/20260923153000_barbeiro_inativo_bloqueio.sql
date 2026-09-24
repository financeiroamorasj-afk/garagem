-- Barbeiro inativo continua com histórico preservado, mas perde acesso operacional.
CREATE OR REPLACE FUNCTION public.get_my_profissional_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM public.profissionais
  WHERE user_id = auth.uid()
    AND ativo IS TRUE
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_profissional_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profissional_id() TO authenticated, service_role;
