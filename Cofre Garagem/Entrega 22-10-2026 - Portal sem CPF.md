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

## Estado da publicação

Publicação concluída em 22/10/2026.

- PR: `#79 — Portal: permitir agendamento sem CPF`.
- Commit da entrega: `34c13e2`.
- Commit de merge na `main`: `a4b0e7378e310fba70e385a35d80ea258d2c1749`.
- Merge concluído às 18:14, no horário de Brasília.
- Migration aplicada no Supabase de produção: `20261022180000_portal_cpf_opcional.sql`.
- Validação pós-aplicação no banco:
  - Coluna `acesso_tipo` ativa em `portal_sessoes`;
  - Coluna `portal_sessao_id` ativa em `agendamentos`;
  - Função RPC `portal_agendar_sem_cpf` criada e liberada para perfil `anon`;
  - Teste de chamada REST na RPC em produção validado;
  - Versão `20261022180000` registrada em `supabase_migrations.schema_migrations`;
  - Comunicado interno `2026-10-portal-agendamento-sem-cpf` cadastrado em `app_comunicados` com público para ambos os aplicativos (gestão e barbeiro).
- Deploys de produção da Vercel disparados para os projetos `garagem-app` e `garagem-adm`.
- Domínios oficiais em produção ativos com HTTP 200.

