-- Comunica as melhorias de clientes e atendimento nos aplicativos correspondentes.

INSERT INTO public.app_comunicados(chave,titulo,resumo,publico,prioridade,rotulo_acao,rota_gestao,publicado_em)
VALUES (
  '2026-10-clientes-sem-cpf-e-uniao','Clientes sem CPF e duplicados',
  'O CPF agora é opcional. Use telefone, histórico e barbeiro favorito para diferenciar homônimos; se houver cadastro duplicado, a gestão pode unir os perfis com auditoria.',
  'gestao','importante','Revisar clientes','/admin/clientes',clock_timestamp()
)
ON CONFLICT(chave) DO UPDATE SET
  titulo=EXCLUDED.titulo,resumo=EXCLUDED.resumo,publico=EXCLUDED.publico,prioridade=EXCLUDED.prioridade,
  rotulo_acao=EXCLUDED.rotulo_acao,rota_gestao=EXCLUDED.rota_gestao,rota_barbeiro=NULL,ativo=true,atualizado_em=clock_timestamp();

INSERT INTO public.app_comunicados(chave,titulo,resumo,publico,prioridade,rotulo_acao,rota_barbeiro,publicado_em)
VALUES (
  '2026-10-encaixe-retroativo-tela-ativa','Encaixe retroativo e tela ativa',
  'Esqueceu de iniciar um encaixe? Registre o atendimento já iniciado no mesmo dia. Durante o corte, o Garagem tenta manter a tela ativa para facilitar o encerramento.',
  'barbeiros','importante','Abrir meu atendimento','/barber/dashboard',clock_timestamp()
)
ON CONFLICT(chave) DO UPDATE SET
  titulo=EXCLUDED.titulo,resumo=EXCLUDED.resumo,publico=EXCLUDED.publico,prioridade=EXCLUDED.prioridade,
  rotulo_acao=EXCLUDED.rotulo_acao,rota_gestao=NULL,rota_barbeiro=EXCLUDED.rota_barbeiro,ativo=true,atualizado_em=clock_timestamp();
