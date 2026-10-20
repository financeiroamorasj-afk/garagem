-- Perfil gerencial do profissional: resultado, extrato e aderencia da duracao real.
-- A duracao do catalogo pode ser ajustada pelo gestor sem reescrever o snapshot
-- dos agendamentos existentes. Assim, a agenda historica continua auditavel.

CREATE INDEX IF NOT EXISTS agendamentos_profissional_periodo_desempenho_idx
  ON public.agendamentos (barbearia_id, profissional_id, data_hora DESC)
  WHERE status IN ('concluido','cancelado','nao_compareceu');

CREATE OR REPLACE FUNCTION public.admin_barbeiro_extrato(
  p_profissional_id uuid,
  p_data_inicial date,
  p_data_final date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_inicio timestamptz;
  v_fim timestamptz;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'EXTRATO_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  IF p_profissional_id IS NULL OR p_data_inicial IS NULL OR p_data_final IS NULL
     OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>366 THEN
    RAISE EXCEPTION 'EXTRATO_BARBEIRO_PERIODO_INVALIDO';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id=p_profissional_id AND p.barbearia_id=v_barbearia
  ) THEN
    RAISE EXCEPTION 'EXTRATO_BARBEIRO_NAO_ENCONTRADO';
  END IF;

  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  WITH agendamentos_periodo AS (
    SELECT
      a.*,
      COALESCE(s.nome,f.servico_nome_snapshot,'Servico nao informado') servico_nome,
      s.duracao_minutos duracao_catalogo_atual,
      s.updated_at servico_updated_at,
      CASE
        WHEN a.iniciado_em IS NOT NULL AND a.concluido_em IS NOT NULL AND a.concluido_em>=a.iniciado_em
        THEN round(extract(epoch FROM (a.concluido_em-a.iniciado_em))/60.0,1)
      END duracao_real_minutos,
      CASE WHEN a.status='concluido' AND COALESCE(f.status,'concluido')='concluido'
        THEN COALESCE(f.valor_servico_liquido,a.valor_final,s.preco,0) ELSE 0 END valor_servico,
      CASE WHEN a.status='concluido' AND COALESCE(f.status,'concluido')='concluido'
        THEN COALESCE(f.comissao_servico_valor,
          round(COALESCE(a.valor_final,s.preco,0)*COALESCE(s.comissao_percentual,p.comissao_percentual,0)/100,2),0)
        ELSE 0 END comissao_servico,
      COALESCE((
        SELECT sum(COALESCE(vp.valor_liquido,vp.valor_venda,0))
        FROM public.vendas_produtos vp
        WHERE vp.barbearia_id=a.barbearia_id AND vp.agendamento_id=a.id AND vp.status='concluida'
      ),0) valor_produtos_atendimento,
      COALESCE((
        SELECT sum(vp.comissao_valor)
        FROM public.vendas_produtos vp
        WHERE vp.barbearia_id=a.barbearia_id AND vp.agendamento_id=a.id AND vp.status='concluida'
      ),0) comissao_produtos_atendimento,
      COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente') cliente_nome
    FROM public.agendamentos a
    JOIN public.profissionais p ON p.id=a.profissional_id AND p.barbearia_id=a.barbearia_id
    LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
    LEFT JOIN public.atendimento_fechamentos f ON f.agendamento_id=a.id AND f.barbearia_id=a.barbearia_id
    LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
    WHERE a.barbearia_id=v_barbearia AND a.profissional_id=p_profissional_id
      AND a.data_hora>=v_inicio AND a.data_hora<v_fim
  ), produtos_periodo AS (
    SELECT
      count(DISTINCT COALESCE(vp.venda_balcao_id,vp.fechamento_id,vp.id))::integer vendas,
      COALESCE(sum(vp.quantidade),0)::integer unidades,
      COALESCE(sum(COALESCE(vp.valor_liquido,vp.valor_venda,0)),0) valor,
      COALESCE(sum(vp.comissao_valor),0) comissao
    FROM public.vendas_produtos vp
    WHERE vp.barbearia_id=v_barbearia AND vp.profissional_id=p_profissional_id
      AND vp.status='concluida' AND vp.criado_em>=v_inicio AND vp.criado_em<v_fim
  ), resumo AS (
    SELECT
      count(*)::integer agendados,
      count(*) FILTER (WHERE a.status='concluido')::integer atendimentos,
      count(*) FILTER (WHERE a.status='cancelado')::integer cancelamentos,
      count(*) FILTER (WHERE a.status='nao_compareceu')::integer nao_comparecimentos,
      count(DISTINCT a.cliente_id) FILTER (WHERE a.status='concluido' AND a.cliente_id IS NOT NULL)::integer clientes_atendidos,
      COALESCE(sum(a.valor_servico),0) valor_servicos,
      COALESCE(sum(a.valor_produtos_atendimento) FILTER (WHERE a.status='concluido'),0) valor_produtos_atendimentos,
      COALESCE(sum(a.comissao_servico),0) comissao_servicos,
      round(avg(a.duracao_real_minutos) FILTER (WHERE a.status='concluido' AND a.duracao_real_minutos IS NOT NULL),1) tempo_medio_minutos,
      round(avg(GREATEST(0,extract(epoch FROM (a.iniciado_em-a.data_hora))/60.0))
        FILTER (WHERE a.iniciado_em IS NOT NULL),1) atraso_medio_inicio_minutos,
      count(*) FILTER (
        WHERE a.status='concluido' AND a.duracao_real_minutos IS NOT NULL
          AND abs(a.duracao_real_minutos-COALESCE(a.duracao_minutos_snapshot,a.duracao_catalogo_atual,30))<=5
      )::integer no_tempo,
      count(*) FILTER (WHERE a.status='concluido' AND a.duracao_real_minutos IS NOT NULL)::integer tempos_medidos
    FROM agendamentos_periodo a
  ), servicos_agrupados AS (
    SELECT
      a.servico_id,
      a.servico_nome,
      max(a.duracao_catalogo_atual)::integer duracao_cadastrada_minutos,
      max(a.servico_updated_at) servico_updated_at,
      count(*)::integer atendimentos,
      count(a.duracao_real_minutos)::integer amostras_tempo,
      round(avg(a.duracao_real_minutos),1) media_real_minutos,
      round(avg(a.duracao_real_minutos)-max(a.duracao_catalogo_atual),1) diferenca_minutos,
      greatest(5,round(max(a.duracao_catalogo_atual)*0.10)) tolerancia_minutos,
      greatest(5,least(480,(round(avg(a.duracao_real_minutos)/5.0)*5)::integer)) duracao_sugerida_minutos
    FROM agendamentos_periodo a
    WHERE a.status='concluido' AND a.servico_id IS NOT NULL
    GROUP BY a.servico_id,a.servico_nome
  ), servicos_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'servico_id',s.servico_id,
      'servico_nome',s.servico_nome,
      'duracao_cadastrada_minutos',s.duracao_cadastrada_minutos,
      'servico_updated_at',s.servico_updated_at,
      'atendimentos',s.atendimentos,
      'amostras_tempo',s.amostras_tempo,
      'media_real_minutos',s.media_real_minutos,
      'diferenca_minutos',s.diferenca_minutos,
      'tolerancia_minutos',s.tolerancia_minutos,
      'duracao_sugerida_minutos',CASE WHEN s.amostras_tempo>=3 THEN s.duracao_sugerida_minutos END,
      'status_tempo',CASE
        WHEN s.amostras_tempo<3 OR s.media_real_minutos IS NULL OR s.duracao_cadastrada_minutos IS NULL THEN 'sem_amostra'
        WHEN s.media_real_minutos>s.duracao_cadastrada_minutos+s.tolerancia_minutos THEN 'acima'
        WHEN s.media_real_minutos<s.duracao_cadastrada_minutos-s.tolerancia_minutos THEN 'abaixo'
        ELSE 'no_padrao'
      END
    ) ORDER BY
      CASE
        WHEN s.amostras_tempo>=3 AND abs(s.diferenca_minutos)>s.tolerancia_minutos THEN 0 ELSE 1
      END,
      abs(COALESCE(s.diferenca_minutos,0)) DESC,s.servico_nome),'[]'::jsonb) items
    FROM servicos_agrupados s
  ), extrato_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',x.id,'data_hora',x.data_hora,'cliente_nome',x.cliente_nome,
      'servico_nome',x.servico_nome,'status',x.status,
      'duracao_prevista_minutos',COALESCE(x.duracao_minutos_snapshot,x.duracao_catalogo_atual,30),
      'duracao_real_minutos',x.duracao_real_minutos,
      'valor_servico',x.valor_servico,'valor_produtos',x.valor_produtos_atendimento,
      'valor_total',x.valor_servico+x.valor_produtos_atendimento,
      'comissao_total',x.comissao_servico+x.comissao_produtos_atendimento
    ) ORDER BY x.data_hora DESC,x.id),'[]'::jsonb) items
    FROM (
      SELECT * FROM agendamentos_periodo
      WHERE status IN ('concluido','cancelado','nao_compareceu')
      ORDER BY data_hora DESC,id LIMIT 100
    ) x
  )
  SELECT jsonb_build_object(
    'data_inicial',p_data_inicial,'data_final',p_data_final,
    'resumo',jsonb_build_object(
      'agendados',r.agendados,'atendimentos',r.atendimentos,
      'cancelamentos',r.cancelamentos,'nao_comparecimentos',r.nao_comparecimentos,
      'clientes_atendidos',r.clientes_atendidos,
      'valor_servicos',r.valor_servicos,'valor_produtos',pr.valor,
      'valor_total',r.valor_servicos+pr.valor,
      'comissao_servicos',r.comissao_servicos,'comissao_produtos',pr.comissao,
      'comissao_total',r.comissao_servicos+pr.comissao,
      'vendas_produtos',pr.vendas,'produtos_unidades',pr.unidades,
      'ticket_medio',CASE WHEN r.atendimentos=0 THEN 0 ELSE round((r.valor_servicos+r.valor_produtos_atendimentos)/r.atendimentos,2) END,
      'tempo_medio_minutos',r.tempo_medio_minutos,
      'atraso_medio_inicio_minutos',r.atraso_medio_inicio_minutos,
      'aderencia_tempo_percentual',CASE WHEN r.tempos_medidos=0 THEN NULL ELSE round(r.no_tempo*100.0/r.tempos_medidos,1) END,
      'tempos_medidos',r.tempos_medidos
    ),
    'servicos',sj.items,
    'extrato',ej.items
  ) INTO v_resultado
  FROM resumo r CROSS JOIN produtos_periodo pr CROSS JOIN servicos_json sj CROSS JOIN extrato_json ej;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_servico_duracao_atualizar(
  p_servico_id uuid,
  p_duracao_minutos integer,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_servico public.servicos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'EXTRATO_BARBEIRO_NAO_AUTORIZADO';
  END IF;
  IF p_servico_id IS NULL OR p_expected_updated_at IS NULL OR p_duracao_minutos NOT BETWEEN 5 AND 480 THEN
    RAISE EXCEPTION 'EXTRATO_DURACAO_INVALIDA';
  END IF;

  UPDATE public.servicos
  SET duracao_minutos=p_duracao_minutos,updated_at=clock_timestamp()
  WHERE id=p_servico_id AND barbearia_id=v_barbearia AND updated_at=p_expected_updated_at
  RETURNING * INTO v_servico;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id=p_servico_id AND barbearia_id=v_barbearia) THEN
      RAISE EXCEPTION 'EXTRATO_SERVICO_NAO_ENCONTRADO';
    END IF;
    RAISE EXCEPTION 'EXTRATO_SERVICO_CONFLITO';
  END IF;

  RETURN jsonb_build_object(
    'id',v_servico.id,'nome',v_servico.nome,
    'duracao_minutos',v_servico.duracao_minutos,'updated_at',v_servico.updated_at
  );
END;
$$;

-- O dono continua com papel administrativo e passa a ter tambem uma identidade
-- profissional. Nao ha segundo login nem troca de papel; o vinculo basta para
-- que ele apareca no portal, na agenda e na configuracao de disponibilidade.
CREATE OR REPLACE FUNCTION public.admin_vincular_como_profissional()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id();
  v_perfil public.profiles%ROWTYPE;
  v_profissional public.profissionais%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR public.get_my_role() NOT IN ('admin','master') THEN
    RAISE EXCEPTION 'DONO_PROFISSIONAL_NAO_AUTORIZADO';
  END IF;
  SELECT * INTO v_perfil FROM public.profiles
  WHERE id=auth.uid() AND barbearia_id=v_barbearia;
  IF NOT FOUND OR length(btrim(COALESCE(v_perfil.nome,'')))<2 THEN
    RAISE EXCEPTION 'DONO_PROFISSIONAL_PERFIL_INVALIDO';
  END IF;

  SELECT * INTO v_profissional FROM public.profissionais
  WHERE user_id=auth.uid() AND barbearia_id=v_barbearia FOR UPDATE;
  IF FOUND THEN
    UPDATE public.profissionais SET ativo=true,updated_at=clock_timestamp()
    WHERE id=v_profissional.id RETURNING * INTO v_profissional;
  ELSE
    INSERT INTO public.profissionais(barbearia_id,user_id,nome,ativo,updated_at)
    VALUES(v_barbearia,auth.uid(),btrim(v_perfil.nome),true,clock_timestamp())
    RETURNING * INTO v_profissional;
  END IF;

  RETURN jsonb_build_object(
    'id',v_profissional.id,'nome',v_profissional.nome,'ativo',v_profissional.ativo,
    'user_id',v_profissional.user_id,'updated_at',v_profissional.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_barbeiro_extrato(uuid,date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_servico_duracao_atualizar(uuid,integer,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_vincular_como_profissional() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_barbeiro_extrato(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_servico_duracao_atualizar(uuid,integer,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_vincular_como_profissional() TO authenticated;

COMMENT ON FUNCTION public.admin_barbeiro_extrato(uuid,date,date) IS
  'Extrato gerencial de um profissional com resultado, comissoes e comparacao entre duracao prevista e real.';
COMMENT ON FUNCTION public.admin_servico_duracao_atualizar(uuid,integer,timestamptz) IS
  'Ajusta a duracao global do catalogo para novos agendamentos, preservando snapshots existentes.';
COMMENT ON FUNCTION public.admin_vincular_como_profissional() IS
  'Vincula o usuario administrador atual a um perfil profissional agendavel sem trocar seu papel de acesso.';
