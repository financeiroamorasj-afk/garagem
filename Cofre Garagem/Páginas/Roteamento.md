Tags: #routing

## Rotas Principais
- [[Login]]
- [[Painel Admin]]
- [[Painel do Barbeiro]]
- [[Painel da Recepção]]

## Recepção

- `/admin/recepcao`: relatório gerencial do proprietário e link copiável para a equipe.
- `/admin/configuracoes`: ativação do módulo, concessão e revogação de acessos, link copiável para a equipe.
- `/reception/board`: balcão operacional, restrito a recepcionistas ativos e barbeiros explicitamente habilitados na unidade.
- Quem abre o link operacional sem sessão é encaminhado ao login e retorna ao balcão após autenticação, desde que tenha permissão.
