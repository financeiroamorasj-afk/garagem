-- Comunica à equipe a nova confirmação visual do Portal do Cliente.
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
  '2026-10-portal-horario-reservado',
  'Portal confirma o horário reservado',
  'Depois de agendar, o cliente agora vê com clareza que o horário já está reservado para ele, sem a mensagem de aguardar confirmação.',
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
