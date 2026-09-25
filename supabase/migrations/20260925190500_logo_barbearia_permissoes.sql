-- O upsert do Storage também consulta o objeto existente; mantém a leitura
-- administrativa isolada e alinha a edição de identidade ao papel master.

DROP POLICY IF EXISTS barbearias_logos_ler_proprio ON storage.objects;
CREATE POLICY barbearias_logos_ler_proprio ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='barbearias-logos'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin','master')
);

DROP POLICY IF EXISTS barbearias_identidade_atualizar ON public.barbearias;
CREATE POLICY barbearias_identidade_atualizar ON public.barbearias
FOR UPDATE TO authenticated USING (
  id=public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master')
) WITH CHECK (
  id=public.get_my_barbearia_id()
  AND public.get_my_role() IN ('admin','master')
);
