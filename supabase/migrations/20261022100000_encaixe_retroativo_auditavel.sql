-- Permite registrar no mesmo dia um encaixe que já começou, sem disfarçar o
-- lançamento tardio como um atendimento iniciado em tempo real.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS registro_retroativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retroativo_registrado_em timestamptz,
  ADD COLUMN IF NOT EXISTS retroativo_registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_registro_retroativo_coerente;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_registro_retroativo_coerente CHECK (
  (registro_retroativo AND retroativo_registrado_em IS NOT NULL)
  OR (NOT registro_retroativo AND retroativo_registrado_em IS NULL AND retroativo_registrado_por IS NULL)
);

CREATE INDEX IF NOT EXISTS agendamentos_retroativos_auditoria_idx
  ON public.agendamentos(barbearia_id,retroativo_registrado_em DESC) WHERE registro_retroativo;

CREATE OR REPLACE FUNCTION public.barbeiro_encaixe_retroativo_criar(
  p_cliente_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_valor_final numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_profissional public.profissionais%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_servico public.servicos%ROWTYPE;
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_fuso text;
  v_hoje date;
  v_id uuid;
  v_inicio timestamptz:=date_trunc('minute',p_inicio);
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin','master','barbeiro') THEN
    RAISE EXCEPTION 'AGENDA_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  SELECT * INTO v_profissional FROM public.profissionais
  WHERE id=public.get_my_profissional_id() AND barbearia_id=v_barbearia AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_inicio IS NULL THEN RAISE EXCEPTION 'AGENDA_RETROATIVO_HORARIO_INVALIDO'; END IF;

  SELECT COALESCE(fuso_horario,'America/Sao_Paulo') INTO v_fuso
  FROM public.barbearias WHERE id=v_barbearia;
  v_hoje:=(clock_timestamp() AT TIME ZONE v_fuso)::date;
  IF (v_inicio AT TIME ZONE v_fuso)::date<>v_hoje OR v_inicio>clock_timestamp() THEN
    RAISE EXCEPTION 'AGENDA_RETROATIVO_SOMENTE_HOJE';
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id=p_cliente_id AND barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_CLIENTE_INVALIDO'; END IF;
  SELECT * INTO v_servico FROM public.servicos WHERE id=p_servico_id AND barbearia_id=v_barbearia AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_SERVICO_INVALIDO'; END IF;
  IF p_valor_final IS NOT NULL AND p_valor_final<0 THEN RAISE EXCEPTION 'AGENDA_VALOR_INVALIDO'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_profissional.id::text||':atendimento-ativo',0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.barbearia_id=v_barbearia AND a.profissional_id=v_profissional.id AND a.status='em_atendimento'
  ) THEN RAISE EXCEPTION 'AGENDA_ATENDIMENTO_EM_ANDAMENTO'; END IF;

  INSERT INTO public.agendamentos(
    barbearia_id,profissional_id,cliente_id,servico_id,data_hora,
    valor_final,status,origem,iniciado_em,registro_retroativo,
    retroativo_registrado_em,retroativo_registrado_por
  ) VALUES (
    v_barbearia,v_profissional.id,v_cliente.id,v_servico.id,v_inicio,
    COALESCE(p_valor_final,v_servico.preco),'em_atendimento','interno',v_inicio,true,
    clock_timestamp(),auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',v_id,'status','em_atendimento','profissional_id',v_profissional.id,
    'cliente_id',v_cliente.id,'cliente_nome',v_cliente.nome,'cliente_telefone',v_cliente.telefone,
    'servico_id',v_servico.id,'servico_nome',v_servico.nome,'duracao_minutos',v_servico.duracao_minutos,
    'valor_final',COALESCE(p_valor_final,v_servico.preco),'data_hora',v_inicio,'iniciado_em',v_inicio,
    'registro_retroativo',true,'retroativo_registrado_em',clock_timestamp()
  );
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN RAISE EXCEPTION 'AGENDA_RETROATIVO_CONFLITO_HORARIO'; END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,numeric) TO authenticated;

COMMENT ON FUNCTION public.barbeiro_encaixe_retroativo_criar(uuid,uuid,timestamptz,numeric) IS
  'Cria atendimento ativo do proprio profissional com inicio informado no dia atual e trilha de auditoria retroativa.';
