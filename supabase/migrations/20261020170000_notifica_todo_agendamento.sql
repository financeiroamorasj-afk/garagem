-- Todo novo agendamento deve avisar o profissional responsável, qualquer que
-- seja a origem (portal, administrador, recepção ou outro fluxo da equipe).

DROP TRIGGER IF EXISTS agendamento_portal_notificacao_push_trg ON public.agendamentos;
DROP TRIGGER IF EXISTS agendamento_notificacao_push_trg ON public.agendamentos;
DROP FUNCTION IF EXISTS public.notificacao_push_agendamento_portal();

CREATE OR REPLACE FUNCTION public.notificacao_push_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,net,pg_temp
AS $$
BEGIN
  PERFORM net.http_post(
    url:='https://wzgtqduivvdfeskpmopq.supabase.co/functions/v1/push-appointment',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object(
      'type','INSERT',
      'table',TG_TABLE_NAME,
      'schema',TG_TABLE_SCHEMA,
      'record',to_jsonb(NEW),
      'old_record',NULL
    ),
    timeout_milliseconds:=3000
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notificacao_push_agendamento() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER agendamento_notificacao_push_trg
AFTER INSERT ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.notificacao_push_agendamento();
