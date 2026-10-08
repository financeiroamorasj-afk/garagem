-- Um barbeiro mantém seu papel original e pode receber acesso adicional ao balcão.
-- A revogação não elimina o histórico financeiro nem desativa seu login.
CREATE TABLE public.recepcao_acessos_barbeiro (
  usuario_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  permitido boolean NOT NULL DEFAULT false,
  atualizado_por uuid NOT NULL REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recepcao_acessos_barbeiro_unidade ON public.recepcao_acessos_barbeiro(barbearia_id,permitido);
ALTER TABLE public.recepcao_acessos_barbeiro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recepcao_acessos_barbeiro FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recepcao_acesso_operador_verificar()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_perfil public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_perfil FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR v_perfil.barbearia_id IS NULL OR NOT coalesce(v_perfil.ativo,false) THEN RETURN false; END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RETURN false; END IF;
  IF v_perfil.role='recepcao' THEN RETURN true; END IF;
  IF coalesce(v_perfil.role,'')<>'barbeiro' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profissionais pr
    WHERE pr.user_id=v_perfil.id AND pr.barbearia_id=v_perfil.barbearia_id AND pr.ativo) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.recepcao_acessos_barbeiro a
    WHERE a.usuario_id=v_perfil.id AND a.barbearia_id=v_perfil.barbearia_id AND a.permitido
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_assert_operador()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
DECLARE v_barbearia uuid:=public.get_my_barbearia_id();
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR NOT (
    coalesce(public.get_my_role(),'')='recepcao'
    OR (coalesce(public.get_my_role(),'')='barbeiro' AND EXISTS (
      SELECT 1 FROM public.recepcao_acessos_barbeiro a
      WHERE a.usuario_id=auth.uid() AND a.barbearia_id=v_barbearia AND a.permitido
    ))
  ) THEN
    RAISE EXCEPTION 'RECEPCAO_NAO_AUTORIZADA';
  END IF;
  IF coalesce(public.get_my_role(),'')='barbeiro' AND NOT EXISTS (
    SELECT 1 FROM public.profissionais pr
    WHERE pr.user_id=auth.uid() AND pr.barbearia_id=v_barbearia AND pr.ativo
  ) THEN RAISE EXCEPTION 'RECEPCAO_NAO_AUTORIZADA'; END IF;
  IF NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  RETURN v_barbearia;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_barbeiros_listar()
RETURNS TABLE(id uuid,nome text,email text,ativo boolean,acesso_recepcao boolean,atualizado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_barbearia uuid:=public.recepcao_assert_admin();
BEGIN
  RETURN QUERY SELECT p.id,coalesce(p.nome,p.email,'Barbeiro'),p.email,
    p.ativo AND EXISTS (SELECT 1 FROM public.profissionais pr WHERE pr.user_id=p.id AND pr.barbearia_id=v_barbearia AND pr.ativo),
    coalesce(a.permitido,false),a.atualizado_em
  FROM public.profiles p
  LEFT JOIN public.recepcao_acessos_barbeiro a ON a.usuario_id=p.id AND a.barbearia_id=p.barbearia_id
  WHERE p.barbearia_id=v_barbearia AND p.role='barbeiro'
  ORDER BY p.ativo DESC,lower(coalesce(p.nome,p.email,'')),p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcao_barbeiro_acesso_definir(p_usuario_id uuid,p_permitir boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_admin();
  v_perfil public.profiles%ROWTYPE;
  v_updated timestamptz:=clock_timestamp();
BEGIN
  IF p_usuario_id IS NULL OR p_permitir IS NULL THEN RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO'; END IF;
  SELECT * INTO v_perfil FROM public.profiles
  WHERE id=p_usuario_id AND barbearia_id=v_barbearia AND role='barbeiro' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_BARBEIRO_NAO_ENCONTRADO'; END IF;
  IF p_permitir AND (NOT coalesce(v_perfil.ativo,false) OR NOT EXISTS (
    SELECT 1 FROM public.profissionais pr WHERE pr.user_id=p_usuario_id AND pr.barbearia_id=v_barbearia AND pr.ativo
  )) THEN RAISE EXCEPTION 'RECEPCAO_BARBEIRO_INATIVO'; END IF;
  INSERT INTO public.recepcao_acessos_barbeiro(usuario_id,barbearia_id,permitido,atualizado_por,atualizado_em)
  VALUES(p_usuario_id,v_barbearia,p_permitir,auth.uid(),v_updated)
  ON CONFLICT(usuario_id) DO UPDATE
  SET permitido=EXCLUDED.permitido,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=EXCLUDED.atualizado_em
  WHERE public.recepcao_acessos_barbeiro.barbearia_id=v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCAO_USUARIO_INVALIDO'; END IF;
  RETURN jsonb_build_object('id',p_usuario_id,'acesso_recepcao',p_permitir,'atualizado_em',v_updated);
END;
$$;

DROP POLICY atendimento_pendencias_leitura_operacional ON public.atendimento_pendencias;
CREATE POLICY atendimento_pendencias_leitura_operacional
ON public.atendimento_pendencias FOR SELECT TO authenticated
USING (
  barbearia_id=public.get_my_barbearia_id()
  AND (
    public.recepcao_acesso_operador_verificar()
    OR public.get_my_role() IN ('admin','master')
    OR (public.get_my_role()='barbeiro' AND profissional_id=public.get_my_profissional_id())
  )
);

REVOKE ALL ON FUNCTION public.recepcao_acesso_operador_verificar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_barbeiros_listar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.recepcao_barbeiro_acesso_definir(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recepcao_acesso_operador_verificar(),
  public.recepcao_barbeiros_listar(),public.recepcao_barbeiro_acesso_definir(uuid,boolean) TO authenticated;

-- Barbeiros com permissão de balcão precisam ver a disponibilidade da equipe inteira.
CREATE OR REPLACE FUNCTION public.agenda_disponibilidade_periodo(p_data_inicial date,p_data_final date)
RETURNS TABLE (
  data date,profissional_id uuid,profissional_nome text,profissional_apelido text,
  jornada_ativa boolean,hora_inicio time,hora_fim time,intervalo_inicio time,intervalo_fim time,
  horarios_extras jsonb,bloqueios jsonb,conflitos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.get_my_barbearia_id(); v_role text:=public.get_my_role();
  v_profissional uuid:=public.get_my_profissional_id(); v_fuso text;
BEGIN
  IF auth.uid() IS NULL OR v_barbearia IS NULL OR v_role NOT IN ('admin','master','barbeiro','recepcao') THEN RAISE EXCEPTION 'DISPONIBILIDADE_VISUALIZACAO_NAO_AUTORIZADA'; END IF;
  IF v_role='recepcao' AND NOT public.modulo_acesso_verificar('recepcao') THEN RAISE EXCEPTION 'RECEPCAO_MODULO_INATIVO'; END IF;
  IF v_role='barbeiro' AND v_profissional IS NULL THEN RAISE EXCEPTION 'AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO'; END IF;
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>31 THEN RAISE EXCEPTION 'DISPONIBILIDADE_PERIODO_INVALIDO'; END IF;
  SELECT COALESCE(b.fuso_horario,'America/Sao_Paulo') INTO v_fuso FROM public.barbearias b WHERE b.id=v_barbearia;

  RETURN QUERY WITH datas AS (
    SELECT d::date dia FROM generate_series(p_data_inicial,p_data_final,interval '1 day') d
  ), equipe AS (
    SELECT p.id,p.nome,p.apelido FROM public.profissionais p WHERE p.barbearia_id=v_barbearia AND p.ativo
      AND (v_role IN ('admin','master','recepcao') OR public.recepcao_acesso_operador_verificar() OR p.id=v_profissional)
  ), base AS (
    SELECT d.dia,p.id,p.nome,p.apelido,j.ativo,j.hora_inicio,j.hora_fim,j.intervalo_inicio,j.intervalo_fim,
      d.dia::timestamp AT TIME ZONE v_fuso dia_inicio,(d.dia+1)::timestamp AT TIME ZONE v_fuso dia_fim
    FROM datas d CROSS JOIN equipe p LEFT JOIN public.profissionais_jornadas j ON j.barbearia_id=v_barbearia AND j.profissional_id=p.id AND j.dia_semana=extract(dow FROM d.dia)::smallint
  )
  SELECT b.dia,b.id,b.nome,b.apelido,COALESCE(b.ativo,false),b.hora_inicio,b.hora_fim,b.intervalo_inicio,b.intervalo_fim,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'inicio',h.hora_inicio,'fim',h.hora_fim,'motivo',h.motivo) ORDER BY h.hora_inicio,h.id) FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id)),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pb.id,'inicio',pb.inicio,'fim',pb.fim,'motivo',pb.motivo) ORDER BY pb.inicio,pb.id) FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<b.dia_fim AND pb.fim>b.dia_inicio),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('agendamento_id',a.id,'inicio',a.data_hora,'fim',a.data_fim,'cliente',COALESCE(c.nome,NULLIF(btrim(a.cliente_nome_manual),''),'Cliente'),'motivos',to_jsonb(array_remove(ARRAY[
      CASE WHEN EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora) THEN 'Sobrepõe bloqueio' END,
      CASE WHEN NOT ((COALESCE(b.ativo,false) AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso)) OR EXISTS (SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id) AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso)) THEN 'Fora da disponibilidade' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.agendamentos oa WHERE oa.id<>a.id AND oa.barbearia_id=v_barbearia AND oa.profissional_id=b.id AND oa.status IN ('pendente','confirmado','encaixe','em_atendimento') AND oa.data_hora<a.data_fim AND oa.data_fim>a.data_hora) THEN 'Choque entre atendimentos' END
    ]::text[],NULL))) ORDER BY a.data_hora,a.id) FROM public.agendamentos a LEFT JOIN public.clientes c ON c.id=a.cliente_id AND c.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_barbearia AND a.profissional_id=b.id AND a.status IN ('pendente','confirmado','encaixe','em_atendimento') AND a.data_hora<b.dia_fim AND a.data_fim>b.dia_inicio AND (
        EXISTS (SELECT 1 FROM public.profissionais_bloqueios pb WHERE pb.barbearia_id=v_barbearia AND pb.profissional_id=b.id AND pb.inicio<a.data_fim AND pb.fim>a.data_hora)
        OR NOT ((COALESCE(b.ativo,false) AND a.data_hora >= (b.dia+b.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+b.hora_fim) AT TIME ZONE v_fuso AND (b.intervalo_inicio IS NULL OR a.data_fim <= (b.dia+b.intervalo_inicio) AT TIME ZONE v_fuso OR a.data_hora >= (b.dia+b.intervalo_fim) AT TIME ZONE v_fuso)) OR EXISTS (SELECT 1 FROM public.agenda_horarios_extras h WHERE h.barbearia_id=v_barbearia AND h.data=b.dia AND (h.profissional_id IS NULL OR h.profissional_id=b.id) AND a.data_hora >= (b.dia+h.hora_inicio) AT TIME ZONE v_fuso AND a.data_fim <= (b.dia+h.hora_fim) AT TIME ZONE v_fuso))
        OR EXISTS (SELECT 1 FROM public.agendamentos oa WHERE oa.id<>a.id AND oa.barbearia_id=v_barbearia AND oa.profissional_id=b.id AND oa.status IN ('pendente','confirmado','encaixe','em_atendimento') AND oa.data_hora<a.data_fim AND oa.data_fim>a.data_hora)
      )),'[]'::jsonb)
  FROM base b ORDER BY b.dia,lower(COALESCE(b.apelido,b.nome)),b.id;
END;
$$;

-- Inclui no relatório operações feitas por barbeiros autorizados, mesmo após revogação.
CREATE OR REPLACE FUNCTION public.admin_recepcao_resumo(p_data_inicial date,p_data_final date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.recepcao_assert_admin();
  v_inicio timestamptz;
  v_fim timestamptz;
  v_resumo jsonb;
  v_operadores jsonb;
BEGIN
  IF p_data_inicial IS NULL OR p_data_final IS NULL OR p_data_final<p_data_inicial OR p_data_final-p_data_inicial>92 THEN
    RAISE EXCEPTION 'RECEPCAO_RELATORIO_PERIODO_INVALIDO';
  END IF;
  v_inicio:=p_data_inicial::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim:=(p_data_final+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object(
    'cobrancas_atendimentos',count(*) FILTER (WHERE f.status='concluido'),
    'valor_atendimentos',COALESCE(sum(f.valor_final) FILTER (WHERE f.status='concluido'),0),
    'vendas_avulsas',(SELECT count(*) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'valor_vendas_avulsas',(SELECT COALESCE(sum(vb.valor_final),0) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'produtos_vendidos',(SELECT COALESCE(sum(vp.quantidade),0) FROM public.vendas_produtos vp JOIN public.vendas_balcao vb ON vb.id=vp.venda_balcao_id AND vb.barbearia_id=vp.barbearia_id WHERE vp.barbearia_id=v_barbearia AND vp.status='concluida' AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim),
    'estornos_avulsos',(SELECT count(*) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim),
    'valor_estornado',(SELECT COALESCE(sum(vb.valor_final),0) FROM public.vendas_balcao vb WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim),
    'devolucoes_ao_barbeiro',(SELECT count(*) FROM public.atendimento_operacao_log l WHERE l.barbearia_id=v_barbearia AND l.evento='cancelado' AND l.ator_papel='recepcao' AND l.criado_em>=v_inicio AND l.criado_em<v_fim)
  ) INTO v_resumo
  FROM public.atendimento_fechamentos f
  JOIN public.atendimento_pendencias ap ON ap.agendamento_id=f.agendamento_id AND ap.barbearia_id=f.barbearia_id
  WHERE f.barbearia_id=v_barbearia AND f.criado_em>=v_inicio AND f.criado_em<v_fim;

  WITH operadores AS (
    SELECT p.id,p.nome,p.email,p.ativo
    FROM public.profiles p
    WHERE p.barbearia_id=v_barbearia AND (
      p.role='recepcao'
      OR (p.role='barbeiro' AND (
        EXISTS (SELECT 1 FROM public.recepcao_acessos_barbeiro a WHERE a.usuario_id=p.id AND a.barbearia_id=v_barbearia AND a.permitido)
        OR EXISTS (SELECT 1 FROM public.atendimento_fechamentos f JOIN public.atendimento_pendencias ap ON ap.agendamento_id=f.agendamento_id AND ap.barbearia_id=f.barbearia_id WHERE f.criado_por=p.id AND f.barbearia_id=v_barbearia)
        OR EXISTS (SELECT 1 FROM public.vendas_balcao vb WHERE vb.criado_por=p.id AND vb.barbearia_id=v_barbearia)
      ))
    )
  ), fechamentos AS (
    SELECT f.criado_por operador_id,count(*) FILTER (WHERE f.status='concluido')::integer cobrancas,
      COALESCE(sum(f.valor_final) FILTER (WHERE f.status='concluido'),0) valor
    FROM public.atendimento_fechamentos f
    JOIN public.atendimento_pendencias ap ON ap.agendamento_id=f.agendamento_id AND ap.barbearia_id=f.barbearia_id
    WHERE f.barbearia_id=v_barbearia AND f.criado_em>=v_inicio AND f.criado_em<v_fim
    GROUP BY f.criado_por
  ), vendas AS (
    SELECT vb.criado_por operador_id,count(*) FILTER (WHERE vb.status='concluida')::integer vendas,
      COALESCE(sum(vb.valor_final) FILTER (WHERE vb.status='concluida'),0) valor,
      COALESCE(sum((SELECT sum(vp.quantidade) FROM public.vendas_produtos vp WHERE vp.barbearia_id=vb.barbearia_id AND vp.venda_balcao_id=vb.id AND vp.status='concluida')) FILTER (WHERE vb.status='concluida'),0)::integer produtos
    FROM public.vendas_balcao vb
    WHERE vb.barbearia_id=v_barbearia AND vb.criado_em>=v_inicio AND vb.criado_em<v_fim
    GROUP BY vb.criado_por
  ), estornos AS (
    SELECT vb.estornado_por operador_id,count(*)::integer estornos
    FROM public.vendas_balcao vb
    WHERE vb.barbearia_id=v_barbearia AND vb.status='estornada' AND vb.estornado_em>=v_inicio AND vb.estornado_em<v_fim
    GROUP BY vb.estornado_por
  ), devolucoes AS (
    SELECT l.ator_id operador_id,count(*)::integer devolucoes
    FROM public.atendimento_operacao_log l
    WHERE l.barbearia_id=v_barbearia AND l.evento='cancelado' AND l.ator_papel='recepcao' AND l.criado_em>=v_inicio AND l.criado_em<v_fim
    GROUP BY l.ator_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',o.id,'nome',o.nome,'email',o.email,'ativo',o.ativo,
    'cobrancas_atendimentos',COALESCE(f.cobrancas,0),'valor_atendimentos',COALESCE(f.valor,0),
    'vendas_avulsas',COALESCE(v.vendas,0),'valor_vendas_avulsas',COALESCE(v.valor,0),
    'produtos_vendidos',COALESCE(v.produtos,0),'estornos',COALESCE(e.estornos,0),
    'devolucoes_ao_barbeiro',COALESCE(d.devolucoes,0)
  ) ORDER BY o.ativo DESC,lower(o.nome),o.id),'[]'::jsonb)
  INTO v_operadores
  FROM operadores o
  LEFT JOIN fechamentos f ON f.operador_id=o.id
  LEFT JOIN vendas v ON v.operador_id=o.id
  LEFT JOIN estornos e ON e.operador_id=o.id
  LEFT JOIN devolucoes d ON d.operador_id=o.id;

  RETURN jsonb_build_object('data_inicial',p_data_inicial,'data_final',p_data_final,'resumo',v_resumo,'operadores',v_operadores);
END;
$$;
