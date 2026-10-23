-- Comunica à equipe o reforço de data no Portal do Cliente.
-- A aplicação em produção deve ocorrer somente depois de o frontend ser validado.

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
  '2026-10-portal-proxima-disponibilidade',
  'Portal destaca a próxima data disponível',
  'Quando não há horário hoje, o cliente agora vê em destaque a próxima data disponível e recebe um novo alerta antes de confirmar um agendamento futuro.',
  'ambos',
  'informativo',
  'Ver atualização',
  '/admin/configuracoes',
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
