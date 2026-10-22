-- Permite agendar pelo Portal sem informar CPF. O acesso sem documento e
-- deliberadamente limitado: nome e telefone podem localizar a ficha para a
-- operacao, mas nao liberam historico, fotos ou preferencias anteriores.

ALTER TABLE public.portal_sessoes
  ADD COLUMN IF NOT EXISTS acesso_tipo text NOT NULL DEFAULT 'completo';

ALTER TABLE public.portal_sessoes
  DROP CONSTRAINT IF EXISTS portal_sessoes_acesso_tipo_check;
ALTER TABLE public.portal_sessoes
  ADD CONSTRAINT portal_sessoes_acesso_tipo_check
  CHECK (acesso_tipo IN ('completo','agendamento'));

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS portal_sessao_id uuid
  REFERENCES public.portal_sessoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agendamentos_portal_sessao_idx
  ON public.agendamentos(portal_sessao_id)
  WHERE portal_sessao_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.portal_sessao_agendamento_criar(
  p_barbearia_id uuid,
  p_cliente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  v_token text;
  v_expira timestamptz:=now()+interval '30 days';
  v_id uuid;
BEGIN
  DELETE FROM public.portal_sessoes
  WHERE expira_em<=now() OR (revogada_em IS NOT NULL AND revogada_em<now()-interval '1 day');

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.portal_sessoes(
    barbearia_id,cliente_id,token_hash,expira_em,acesso_tipo
  ) VALUES (
    p_barbearia_id,p_cliente_id,public.portal_token_hash(v_token),v_expira,'agendamento'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id',v_id,'token',v_token,'expira_em',v_expira,'acesso_tipo','agendamento');
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_agendar_sem_cpf(
  p_slug text,
  p_nome text,
  p_telefone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  v_barbearia public.barbearias%ROWTYPE;
  v_nome text:=btrim(COALESCE(p_nome,''));
  v_nome_chave text;
  v_telefone text:=regexp_replace(COALESCE(p_telefone,''),'\D','','g');
  v_id uuid;
  v_sessao jsonb;
BEGIN
  SELECT * INTO v_barbearia FROM public.barbearias
  WHERE slug=lower(btrim(COALESCE(p_slug,''))) AND portal_ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_BARBEARIA_NAO_ENCONTRADA'; END IF;
  IF length(v_nome) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PORTAL_NOME_INVALIDO'; END IF;
  IF length(v_telefone) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'PORTAL_TELEFONE_INVALIDO'; END IF;

  v_nome_chave:=lower(extensions.unaccent(v_nome));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_barbearia.id::text||':portal-sem-cpf:'||v_telefone||':'||v_nome_chave,0
  ));

  SELECT c.id INTO v_id
  FROM public.clientes c
  WHERE c.barbearia_id=v_barbearia.id
    AND regexp_replace(COALESCE(c.telefone,''),'\D','','g')=v_telefone
    AND lower(extensions.unaccent(btrim(c.nome)))=v_nome_chave
  ORDER BY c.updated_at DESC,c.id
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.clientes(barbearia_id,nome,telefone,updated_at)
    VALUES(v_barbearia.id,v_nome,v_telefone,clock_timestamp())
    RETURNING id INTO v_id;
  END IF;

  v_sessao:=public.portal_sessao_agendamento_criar(v_barbearia.id,v_id);
  RETURN jsonb_build_object(
    'status','autenticado','token',v_sessao->>'token','expira_em',v_sessao->>'expira_em',
    'acesso_tipo','agendamento'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_dados(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  v_sessao public.portal_sessoes%ROWTYPE;
  v_result jsonb;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  SELECT jsonb_build_object(
    'acesso_tipo',v_sessao.acesso_tipo,
    'barbearia',jsonb_build_object(
      'nome',b.nome,'slug',b.slug,'logo_url',b.logo_url,'config_cores',b.config_cores,
      'pagamento_online_ativo',b.pagamento_online_ativo
    ),
    'cliente',jsonb_build_object(
      'id',c.id,'nome',c.nome,'telefone',c.telefone,
      'cpf_final',CASE WHEN v_sessao.acesso_tipo='completo' THEN rtrim(c.cpf_final) ELSE NULL END,
      'barbeiro_favorito_id',CASE WHEN v_sessao.acesso_tipo='completo' THEN c.barbeiro_favorito_id ELSE NULL END,
      'notas_preferencias',CASE WHEN v_sessao.acesso_tipo='completo' THEN c.notas_preferencias ELSE NULL END
    ),
    'equipe',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',p.id,'nome',p.nome,'apelido',p.apelido,'especialidade',p.especialidade,'foto_url',p.foto_url
    ) ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id)
      FROM public.profissionais p WHERE p.barbearia_id=v_sessao.barbearia_id AND p.ativo),'[]'::jsonb),
    'servicos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'nome',s.nome,'descricao',s.descricao,'preco',s.preco,'duracao_minutos',s.duracao_minutos
    ) ORDER BY lower(s.nome),s.id)
      FROM public.servicos s WHERE s.barbearia_id=v_sessao.barbearia_id AND s.ativo),'[]'::jsonb),
    'agendamentos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,'data_hora',a.data_hora,'data_fim',a.data_fim,'status',a.status,
      'valor_final',a.valor_final,'pagamento_status',a.pagamento_status,
      'profissional_id',a.profissional_id,'profissional_nome',COALESCE(p.apelido,p.nome),
      'servico_id',a.servico_id,'servico_nome',COALESCE(s.nome,'Serviço')
    ) ORDER BY a.data_hora)
      FROM public.agendamentos a
      LEFT JOIN public.profissionais p ON p.id=a.profissional_id AND p.barbearia_id=a.barbearia_id
      LEFT JOIN public.servicos s ON s.id=a.servico_id AND s.barbearia_id=a.barbearia_id
      WHERE a.barbearia_id=v_sessao.barbearia_id AND a.cliente_id=v_sessao.cliente_id
        AND a.data_hora>=now()-interval '1 day' AND a.status<>'cancelado'
        AND (v_sessao.acesso_tipo='completo' OR a.portal_sessao_id=v_sessao.id)),'[]'::jsonb),
    'historico',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',cc.id,'estilo',cc.estilo,'pentes',cc.pentes,'acabamento',cc.acabamento,
      'barba',cc.barba,'observacoes',cc.observacoes,'preferencias_cliente',cc.preferencias_cliente,
      'tem_foto',(cc.foto_path IS NOT NULL AND cc.foto_excluida_em IS NULL),
      'criado_em',cc.criado_em,'profissional_nome',COALESCE(cp.apelido,cp.nome),
      'servico_nome',COALESCE(cs.nome,'Serviço')
    ) ORDER BY cc.criado_em DESC)
      FROM public.cliente_cortes cc
      JOIN public.profissionais cp ON cp.id=cc.profissional_id AND cp.barbearia_id=cc.barbearia_id
      LEFT JOIN public.agendamentos ca ON ca.id=cc.agendamento_id AND ca.barbearia_id=cc.barbearia_id
      LEFT JOIN public.servicos cs ON cs.id=ca.servico_id AND cs.barbearia_id=ca.barbearia_id
      WHERE v_sessao.acesso_tipo='completo'
        AND cc.barbearia_id=v_sessao.barbearia_id AND cc.cliente_id=v_sessao.cliente_id),'[]'::jsonb)
  ) INTO v_result
  FROM public.clientes c JOIN public.barbearias b ON b.id=c.barbearia_id
  WHERE c.id=v_sessao.cliente_id AND c.barbearia_id=v_sessao.barbearia_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'PORTAL_CLIENTE_NAO_ENCONTRADO'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_agendamento_criar(
  p_token text,p_servico_id uuid,p_profissional_id uuid,p_inicio timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_preco numeric; v_duracao integer; v_id uuid; v_fuso text; v_data date;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  IF p_inicio IS NULL OR p_inicio<=now() THEN RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL'; END IF;
  SELECT s.preco,s.duracao_minutos INTO v_preco,v_duracao FROM public.servicos s
  WHERE s.id=p_servico_id AND s.barbearia_id=v_sessao.barbearia_id AND s.ativo;
  IF v_duracao IS NULL THEN RAISE EXCEPTION 'PORTAL_SERVICO_INVALIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id=p_profissional_id
    AND p.barbearia_id=v_sessao.barbearia_id AND p.ativo) THEN RAISE EXCEPTION 'PORTAL_PROFISSIONAL_INVALIDO'; END IF;
  SELECT fuso_horario INTO v_fuso FROM public.barbearias WHERE id=v_sessao.barbearia_id;
  v_data:=(p_inicio AT TIME ZONE COALESCE(v_fuso,'America/Sao_Paulo'))::date;
  IF NOT EXISTS (SELECT 1 FROM public.portal_horarios_livres(
    p_token,p_servico_id,v_data,p_profissional_id,1,100
  ) h WHERE h.profissional_id=p_profissional_id AND h.inicio=p_inicio) THEN
    RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL';
  END IF;
  INSERT INTO public.agendamentos(
    barbearia_id,profissional_id,cliente_id,servico_id,data_hora,duracao_minutos_snapshot,
    data_fim,valor_final,status,origem,pagamento_status,portal_sessao_id
  ) VALUES (
    v_sessao.barbearia_id,p_profissional_id,v_sessao.cliente_id,p_servico_id,p_inicio,v_duracao,
    p_inicio+make_interval(mins=>v_duracao),v_preco,'confirmado','portal_cliente','nao_solicitado',v_sessao.id
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','confirmado','inicio',p_inicio,'valor_final',v_preco);
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%AGENDA_HORARIO_OCUPADO%' THEN RAISE EXCEPTION 'PORTAL_HORARIO_INDISPONIVEL'; END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_agendamento_cancelar(p_token text,p_agendamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_sessao public.portal_sessoes%ROWTYPE;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  UPDATE public.agendamentos SET status='cancelado'
  WHERE id=p_agendamento_id AND barbearia_id=v_sessao.barbearia_id AND cliente_id=v_sessao.cliente_id
    AND status IN ('pendente','confirmado') AND data_hora>now()
    AND (v_sessao.acesso_tipo='completo' OR portal_sessao_id=v_sessao.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_AGENDAMENTO_NAO_CANCELAVEL'; END IF;
  RETURN jsonb_build_object('id',p_agendamento_id,'status','cancelado');
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_perfil_atualizar(
  p_token text,p_nome text,p_telefone text,p_barbeiro_favorito_id uuid,p_notas_preferencias text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_sessao public.portal_sessoes%ROWTYPE;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  IF v_sessao.acesso_tipo<>'completo' THEN RAISE EXCEPTION 'PORTAL_ACESSO_LIMITADO'; END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'PORTAL_NOME_INVALIDO'; END IF;
  IF p_telefone IS NULL OR length(regexp_replace(p_telefone,'\D','','g')) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'PORTAL_TELEFONE_INVALIDO'; END IF;
  IF length(COALESCE(p_notas_preferencias,''))>1000 THEN RAISE EXCEPTION 'PORTAL_PREFERENCIAS_INVALIDAS'; END IF;
  IF p_barbeiro_favorito_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profissionais p
    WHERE p.id=p_barbeiro_favorito_id AND p.barbearia_id=v_sessao.barbearia_id AND p.ativo)
  THEN RAISE EXCEPTION 'PORTAL_PROFISSIONAL_INVALIDO'; END IF;
  UPDATE public.clientes SET nome=btrim(p_nome),telefone=btrim(p_telefone),
    barbeiro_favorito_id=p_barbeiro_favorito_id,
    notas_preferencias=NULLIF(btrim(p_notas_preferencias),''),updated_at=now()
  WHERE id=v_sessao.cliente_id AND barbearia_id=v_sessao.barbearia_id;
  RETURN jsonb_build_object('atualizado',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_corte_foto_path(p_token text,p_corte_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_sessao public.portal_sessoes%ROWTYPE; v_path text;
BEGIN
  v_sessao:=public.portal_sessao_validar(p_token);
  IF v_sessao.acesso_tipo<>'completo' THEN RAISE EXCEPTION 'PORTAL_ACESSO_LIMITADO'; END IF;
  SELECT cc.foto_path INTO v_path FROM public.cliente_cortes cc
  WHERE cc.id=p_corte_id AND cc.barbearia_id=v_sessao.barbearia_id
    AND cc.cliente_id=v_sessao.cliente_id AND cc.foto_path IS NOT NULL AND cc.foto_excluida_em IS NULL;
  IF v_path IS NULL THEN RAISE EXCEPTION 'PORTAL_FOTO_NAO_ENCONTRADA'; END IF;
  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_sessao_agendamento_criar(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.portal_agendar_sem_cpf(text,text,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_agendar_sem_cpf(text,text,text) TO anon;

REVOKE ALL ON FUNCTION public.portal_dados(text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_agendamento_criar(text,uuid,uuid,timestamptz) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_agendamento_cancelar(text,uuid) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.portal_perfil_atualizar(text,text,text,uuid,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_dados(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_agendamento_criar(text,uuid,uuid,timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_agendamento_cancelar(text,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_perfil_atualizar(text,text,text,uuid,text) TO anon;

INSERT INTO public.app_comunicados(
  chave,titulo,resumo,publico,prioridade,rotulo_acao,rota_gestao,rota_barbeiro,publicado_em
) VALUES (
  '2026-10-portal-agendamento-sem-cpf','Portal agora agenda sem CPF',
  'O cliente pode agendar informando apenas nome e WhatsApp. O CPF ficou opcional e continua disponível somente para quem quiser acessar histórico e preferências protegidas.',
  'ambos','importante','Ver clientes','/admin/clientes','/barber/dashboard',clock_timestamp()
)
ON CONFLICT(chave) DO UPDATE SET
  titulo=EXCLUDED.titulo,resumo=EXCLUDED.resumo,publico=EXCLUDED.publico,prioridade=EXCLUDED.prioridade,
  rotulo_acao=EXCLUDED.rotulo_acao,rota_gestao=EXCLUDED.rota_gestao,rota_barbeiro=EXCLUDED.rota_barbeiro,
  ativo=true,atualizado_em=clock_timestamp();

COMMENT ON FUNCTION public.portal_agendar_sem_cpf(text,text,text) IS
  'Cria acesso limitado para agendamento por nome e telefone, sem liberar dados privados de uma ficha existente.';
