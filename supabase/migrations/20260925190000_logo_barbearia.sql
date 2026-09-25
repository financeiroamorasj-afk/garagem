-- Identidade visual pública da barbearia, com escrita isolada por tenant.

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('barbearias-logos','barbearias-logos',true,614400,ARRAY['image/webp','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET
  public=true,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS barbearias_logos_inserir ON storage.objects;
DROP POLICY IF EXISTS barbearias_logos_atualizar ON storage.objects;
DROP POLICY IF EXISTS barbearias_logos_remover ON storage.objects;

CREATE POLICY barbearias_logos_inserir ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='barbearias-logos'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin','master')
);

CREATE POLICY barbearias_logos_atualizar ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id='barbearias-logos'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin','master')
) WITH CHECK (
  bucket_id='barbearias-logos'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin','master')
);

CREATE POLICY barbearias_logos_remover ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='barbearias-logos'
  AND (storage.foldername(name))[1]=public.get_my_barbearia_id()::text
  AND public.get_my_role() IN ('admin','master')
);

COMMENT ON COLUMN public.barbearias.logo_url IS
  'URL pública do logo institucional compactado; a escrita do arquivo é isolada pelo primeiro segmento do path.';
