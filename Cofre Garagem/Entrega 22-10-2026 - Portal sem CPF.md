# Entrega — Portal sem CPF obrigatório

Data: 22/10/2026

## Decisão

O CPF deixa de ser obrigatório no principal fluxo de agendamento do Portal do Cliente. Nome completo e WhatsApp são suficientes para escolher serviço, profissional e horário.

O CPF permanece opcional para quem quiser acessar histórico de cortes, fotos e preferências. Nenhum SMS, OTP ou contratação de provedor externo faz parte desta solução.

## Proteção de dados

- A entrada sem CPF cria uma sessão limitada de agendamento.
- Nome e telefone podem localizar a ficha operacional, mas não autenticam acesso ao histórico.
- A sessão limitada enxerga somente os agendamentos criados por ela.
- Histórico, fotos, preferências e edição do perfil continuam restritos ao acesso completo com CPF.
- Dois clientes com o mesmo nome continuam diferenciados internamente por telefone, histórico, última visita e barbeiro favorito.
- Nome e telefone iguais reutilizam a ficha operacional mais recente sem expor os dados privados já existentes.

## Implementação

- Nova RPC pública `portal_agendar_sem_cpf`.
- Sessões classificadas como `completo` ou `agendamento`.
- Agendamentos do Portal vinculados à sessão que os criou.
- Cancelamento limitado aos horários criados pela mesma sessão quando o acesso não usa CPF.
- Interface principal com nome, WhatsApp e campo `CPF (opcional)`.
- Atalho separado para clientes que desejam acessar o histórico com CPF.
- Aviso interno `Portal agora agenda sem CPF` destinado à gestão e aos barbeiros.

## Migration

- `20261022180000_portal_cpf_opcional.sql`

## Validação e publicação

- Build de produção concluído com sucesso.
- ESLint dos arquivos alterados concluído sem erros.
- Testes direcionados de interface: 3 aprovados de 3.
- Testes de integração local do Portal: 2 aprovados de 2, incluindo isolamento entre duas sessões com o mesmo nome e telefone.
- Suíte completa: 176 aprovados de 180. As quatro falhas restantes já existiam antes desta alteração: uma asserção antiga de disponibilidade e três testes da recepção que dependem da tabela ausente `recepcao_barbeiros_acesso` no banco local.
- Publicação em produção: pendente nesta etapa. Preencher com PR, migration remota, deploy e smoke test após a conclusão.

