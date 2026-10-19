-- Fotos públicas da equipe para o portal de agendamento do cliente.
-- A escrita continua restrita ao administrador da própria barbearia.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('barbeiros-fotos','barbeiros-fotos',true,524288,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public=true,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS barbeiros_fotos_inserir ON storage.objects;
DROP POLICY IF EXISTS barbeiros_fotos_atualizar ON storage.objects;
DROP POLICY IF EXISTS barbeiros_fotos_remover ON storage.objects;
DROP POLICY IF EXISTS barbeiros_fotos_ler ON storage.objects;

CREATE POLICY barbeiros_fotos_ler ON storage.objects
FOR SELECT TO public
USING (bucket_id='barbeiros-fotos');

CREATE POLICY barbeiros_fotos_inserir ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='barbeiros-fotos'
  AND public.get_my_role()='admin'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id::text=(storage.foldername(name))[2]
      AND p.barbearia_id=public.get_my_barbearia_id()
  )
);

CREATE POLICY barbeiros_fotos_atualizar ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id='barbeiros-fotos'
  AND public.get_my_role()='admin'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
)
WITH CHECK (
  bucket_id='barbeiros-fotos'
  AND public.get_my_role()='admin'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id::text=(storage.foldername(name))[2]
      AND p.barbearia_id=public.get_my_barbearia_id()
  )
);

CREATE POLICY barbeiros_fotos_remover ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id='barbeiros-fotos'
  AND public.get_my_role()='admin'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
);
