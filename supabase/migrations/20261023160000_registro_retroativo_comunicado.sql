-- Comunica à equipe a ampliação do registro retroativo com início e término.

INSERT INTO public.app_comunicados(
  chave,
  titulo,
  resumo,
  publico,
  prioridade,
  rotulo_acao,
  rota_gestao,
  rota_barbeiro,
  publicado_em
) VALUES (
  '2026-10-registro-retroativo-concluido',
  'Cortes retroativos: data, início e fim',
  'Os barbeiros agora podem registrar cortes realizados hoje ou nos dois dias anteriores informando horário de início e término. O corte nasce direto como concluído, sem travar o painel.',
  'ambos',
  'importante',
  'Ver painel',
  '/admin/agenda',
  '/barber/dashboard',
  clock_timestamp()
)
ON CONFLICT(chave) DO UPDATE SET
  titulo=EXCLUDED.titulo,
  resumo=EXCLUDED.resumo,
  publico=EXCLUDED.publico,
  prioridade=EXCLUDED.prioridade,
  rotulo_acao=EXCLUDED.rotulo_acao,
  rota_gestao=EXCLUDED.rota_gestao,
  rota_barbeiro=EXCLUDED.rota_barbeiro,
  ativo=true,
  publicado_em=clock_timestamp(),
  atualizado_em=clock_timestamp();
