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
  'Registro retroativo com início e fim',
  'O barbeiro agora pode registrar atendimentos realizados hoje ou nos dois dias anteriores informando início e término, gravados diretamente como concluídos.',
  'ambos',
  'informativo',
  'Ver na agenda',
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
  atualizado_em=clock_timestamp();
