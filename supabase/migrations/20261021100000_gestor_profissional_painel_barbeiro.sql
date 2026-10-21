-- Permite que admin/master que tambem possui um profissional ativo use o
-- mesmo painel operacional dos barbeiros sem trocar de login ou de papel.
--
-- As funcoes continuam resolvendo o profissional por auth.uid() e limitando
-- todas as operacoes ao respectivo profissional_id. Um gestor sem vinculo
-- ativo continua sendo rejeitado pelos mesmos checks de profissional nulo.

DO $migration$
DECLARE
  v_signature text;
  v_procedure regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.barbeiro_agenda_contexto()',
    'public.barbeiro_agenda_listar_memoria(date)',
    'public.barbeiro_agenda_listar_periodo(date,date)',
    'public.barbeiro_painel_resumo(date,date)',
    'public.barbeiro_produtos_listar()',
    'public.barbeiro_produto_vender(uuid,integer,uuid,text,uuid)',
    'public.barbeiro_atendimento_ativo()',
    'public.barbeiro_agendamento_mudar_status(uuid,text,text)',
    'public.barbeiro_atendimento_materiais_listar(uuid)',
    'public.barbeiro_atendimento_materiais_registrar(uuid,jsonb)',
    'public.barbeiro_checkout_concluir(uuid,jsonb,jsonb,numeric,numeric,text,numeric,date,uuid)',
    'public.barbeiro_atendimento_enviar_recepcao(uuid,jsonb,jsonb,numeric,uuid)'
  ]
  LOOP
    v_procedure := to_regprocedure(v_signature);
    IF v_procedure IS NULL THEN
      RAISE EXCEPTION 'GESTOR_PROFISSIONAL_FUNCAO_AUSENTE:%', v_signature;
    END IF;

    v_definition := pg_get_functiondef(v_procedure);
    v_updated := replace(
      replace(
        v_definition,
        'public.get_my_role()<>''barbeiro''',
        'public.get_my_role() NOT IN (''admin'',''master'',''barbeiro'')'
      ),
      'public.get_my_role() <> ''barbeiro''',
      'public.get_my_role() NOT IN (''admin'',''master'',''barbeiro'')'
    );

    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'GESTOR_PROFISSIONAL_GUARDA_NAO_ENCONTRADA:%', v_signature;
    END IF;

    EXECUTE v_updated;
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.barbeiro_agenda_contexto() IS
  'Contexto do profissional ativo vinculado ao usuario autenticado, incluindo gestor que tambem atende.';
COMMENT ON FUNCTION public.barbeiro_agendamento_mudar_status(uuid,text,text) IS
  'Executa transicoes somente na agenda do profissional autenticado, seja barbeiro ou gestor vinculado.';
