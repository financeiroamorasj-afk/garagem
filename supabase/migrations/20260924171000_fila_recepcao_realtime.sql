-- Recepção R3: leitura mínima e segura para atualizar a fila em tempo real.

GRANT SELECT ON TABLE public.atendimento_pendencias TO authenticated;

CREATE POLICY atendimento_pendencias_leitura_operacional
ON public.atendimento_pendencias
FOR SELECT
TO authenticated
USING (
  barbearia_id = public.get_my_barbearia_id()
  AND (
    (public.get_my_role() = 'recepcao' AND public.modulo_acesso_verificar('recepcao'))
    OR public.get_my_role() IN ('admin', 'master')
    OR (
      public.get_my_role() = 'barbeiro'
      AND profissional_id = public.get_my_profissional_id()
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'atendimento_pendencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_pendencias;
  END IF;
END;
$$;

