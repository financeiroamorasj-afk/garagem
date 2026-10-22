-- Enriquece a seleção operacional de clientes sem tornar CPF ou nome uma
-- chave única. Telefone, histórico e profissional favorito ajudam a equipe a
-- distinguir homônimos antes de criar outro cadastro.

CREATE OR REPLACE FUNCTION public.agenda_encaixe_catalogo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_barbearia uuid:=public.agenda_assert_operador();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'servicos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'nome',s.nome,'preco',s.preco,'duracao_minutos',s.duracao_minutos
    ) ORDER BY lower(s.nome)) FROM public.servicos s WHERE s.barbearia_id=v_barbearia AND s.ativo),'[]'::jsonb),
    'clientes',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'nome',c.nome,'telefone',c.telefone,
      'total_atendimentos',(SELECT count(*) FROM public.agendamentos a WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status='concluido'),
      'ultima_visita',(SELECT max(a.data_hora) FROM public.agendamentos a WHERE a.barbearia_id=v_barbearia AND a.cliente_id=c.id AND a.status='concluido'),
      'barbeiro_favorito_nome',(SELECT COALESCE(p.apelido,p.nome) FROM public.profissionais p WHERE p.id=c.barbeiro_favorito_id AND p.barbearia_id=c.barbearia_id)
    ) ORDER BY lower(c.nome),c.id) FROM public.clientes c WHERE c.barbearia_id=v_barbearia),'[]'::jsonb),
    'profissionais',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',p.id,'nome',p.nome,'apelido',p.apelido
    ) ORDER BY lower(COALESCE(p.apelido,p.nome)),p.id) FROM public.profissionais p WHERE p.barbearia_id=v_barbearia AND p.ativo),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_encaixe_catalogo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agenda_encaixe_catalogo() TO authenticated;

COMMENT ON FUNCTION public.agenda_encaixe_catalogo() IS
  'Catalogo operacional com contexto suficiente para distinguir clientes homonimos sem exigir CPF.';
