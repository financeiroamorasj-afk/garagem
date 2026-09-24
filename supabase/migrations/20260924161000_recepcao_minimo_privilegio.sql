-- Remove leituras genéricas herdadas do baseline. A recepção acessa somente
-- contratos SECURITY DEFINER com projeções mínimas, nunca as tabelas completas.

DROP POLICY IF EXISTS "Users can select profiles from same barbearia" ON public.profiles;
DROP POLICY IF EXISTS "Users can select from same barbearia" ON public.clientes;
DROP POLICY IF EXISTS "Users can select from same barbearia" ON public.profissionais;
DROP POLICY IF EXISTS "Users can select from same barbearia" ON public.servicos;
DROP POLICY IF EXISTS "Users can select produtos from same barbearia" ON public.produtos;

CREATE POLICY profiles_leitura_operadores_autorizados
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin','master'))
);

CREATE POLICY clientes_leitura_operadores_autorizados
ON public.clientes FOR SELECT TO authenticated
USING (
  barbearia_id = public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master','barbeiro')
);

CREATE POLICY profissionais_leitura_operadores_autorizados
ON public.profissionais FOR SELECT TO authenticated
USING (
  barbearia_id = public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master','barbeiro')
);

CREATE POLICY servicos_leitura_operadores_autorizados
ON public.servicos FOR SELECT TO authenticated
USING (
  barbearia_id = public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master','barbeiro')
);

CREATE POLICY produtos_leitura_operadores_autorizados
ON public.produtos FOR SELECT TO authenticated
USING (
  barbearia_id = public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master','barbeiro')
);

