# Snapshot de Progresso — 26/09/2026

Registro de continuidade para retomada do projeto após a janela de uso atual.

## Estado geral

O Garagem System possui o núcleo operacional do MVP implementado e testado em ambiente local. O próximo trabalho não deve começar por IA ou CRM: primeiro precisamos deixar o banco e a operação prontos para o primeiro membro fundador.

## Entregue no app

- Login e perfis de administrador, barbeiro e recepção.
- Agenda diária, semanal e mensal.
- Disponibilidades, folgas, conflitos e encaixes.
- Modo TV com agenda da equipe, YouTube e alternância automática.
- Clientes em cards e lista.
- Portal do cliente por CPF e slug da barbearia.
- Histórico de cortes, preferências e fotos compactadas.
- Catálogo de serviços, materiais e produtos.
- Estoque, venda de produtos e comissões de serviços/produtos.
- Recepção com fila, cobrança, produtos e estornos.
- Logo e identidade visual da barbearia.
- QR Code PIX baseado na chave cadastrada.
- Títulos parcelados e recorrentes.

## Decisões confirmadas

### Cobrança dos atendimentos

Nesta fase, o PIX será manual: o sistema exibe o QR Code, o cliente paga, apresenta o comprovante e o barbeiro ou recepção confirma o recebimento. Não implementar ainda confirmação automática, webhook ou conciliação por atendimento.

### Assinaturas do Garagem System

O ADM de assinaturas é prioridade. O lead deverá poder contratar diretamente por cartão de crédito ou PIX via gateway. Esta cobrança é separada da cobrança dos cortes e produtos da barbearia.

### IA e CRM

Não são bloqueadores do MVP. A IA pode ser apresentada no app para gerar expectativa e desenvolvida em paralelo. O CRM começa depois do ADM de assinaturas.

### Produção e segurança

Banco limpo, migrations conferidas, RLS, storage, variáveis, backup e rollback são pré-requisitos antes do uso do MVP pelo membro fundador.

## Ordem de retomada

1. Revisar banco de produção e eliminar lixo técnico/fluxos legados.
2. Testar ponta a ponta o cenário do membro fundador.
3. Fazer os acabamentos do app: responsividade, estados de erro/vazio e comprovante.
4. Criar o ADM mínimo de planos e assinaturas.
5. Depois, CRM e IA.

## Pontos técnicos para revisar

- Tabelas legadas com `tenant_id`: `vendas`, `contas_receber` e `movimentacoes_financeiras`.
- Integração do gateway para assinatura, ainda não implementada.
- Dashboard final de repasses, CMV e margem.
- Interface de transferência entre contas e resgate de envelopes.
- Leads ainda chegam pela landing/WhatsApp, sem CRM próprio.

## Landing page

A landing está em repositório separado e com deploy manual funcional. Os CTAs direcionam para o WhatsApp. A captação estruturada de leads ficará para a etapa de CRM.

## Retomada sugerida

Ao voltar, começar por uma auditoria de produção/segurança e pelo roteiro de teste do membro fundador. Não iniciar IA, CRM ou novas integrações antes de confirmar esse checklist.

## Auditoria iniciada nesta retomada

- O repositório está na branch `codex/checkout-pix-qrcode`; não há alteração de código nova nesta retomada.
- O Supabase local está acessível, mas os serviços de imgproxy, edge runtime e pooler estão parados. Isso precisa ser distinguido de um problema de produção antes do deploy.
- O modelo atual possui RLS nas tabelas públicas principais.
- As tabelas legadas `vendas`, `contas_receber` e `movimentacoes_financeiras` usam `tenant_id`, não `barbearia_id`, e não devem receber policies copiadas do modelo novo sem decisão de arquitetura.
- O baseline legado concede grants amplos nessas tabelas; como o RLS está ativo e sem policies, o acesso fica negado por padrão, mas a situação precisa ser formalizada e revisada antes do MVP.
- Os buckets atuais são `barbearias-logos` e `cortes-clientes`, com políticas separadas para identidade da barbearia e fotos privadas de cortes.
- A live query local confirmou: `barbearias`, `clientes`, `agendamentos`, `produtos` e `vendas_produtos` têm RLS e policies; `vendas`, `contas_receber` e `movimentacoes_financeiras` têm RLS ativo, mas nenhuma policy.

### Próxima ação técnica segura

Gerar, revisar e somente depois aplicar uma migration específica de policies para as tabelas novas que eventualmente estejam sem cobertura. Não criar policies para as três tabelas legadas até decidir se serão adaptadas, migradas ou removidas.

## Decisão executada — congelamento do legado

Foi criada a migration `20260926100000_congela_tabelas_legadas.sql`.

- `vendas`, `contas_receber` e `movimentacoes_financeiras` continuam preservadas.
- O acesso de `PUBLIC`, `anon` e `authenticated` foi revogado.
- O RLS continua habilitado.
- As tabelas receberam comentários explícitos de que estão congeladas.
- O `service_role` não foi removido, preservando a possibilidade de auditoria e migração controlada.
- Nenhuma tabela nova do MVP foi alterada.
- A migration foi aplicada e verificada no banco local: `anon` e `authenticated` ficaram sem `SELECT` nas três tabelas legadas, com RLS ainda ativo.

Produção: o responsável pelo projeto confirmou a aplicação da migration no ambiente de produção. O próximo passo é validar o app real e confirmar que nenhum fluxo depende das tabelas congeladas.

## Incidente de produção — login

Ao tentar entrar no ambiente de produção, o app retornou `column profiles.ativo does not exist`.

- A consulta do login está correta ao verificar `role` e `ativo`.
- A coluna é criada pela migration `20260924160000_recepcao_usuarios_leitura.sql`.
- O diagnóstico é divergência entre o código publicado e as migrations aplicadas em produção.
- Não remover `ativo` da consulta como paliativo: isso permitiria login de perfis inativos e esconderia o problema de sincronização.
- A correção correta é aplicar a migration de recepção completa e conferir as migrations pendentes em ordem cronológica.

Status: migration aplicada com sucesso em produção (`Success. No rows returned`). Próximo passo: repetir o login e validar o carregamento do perfil, agenda e permissões.

## Incidente de produção — migrations parcialmente aplicadas

Depois da correção do login, o app entrou em produção, mas várias áreas continuaram falhando: agenda, disponibilidade, configurações, contas e recepção. O console mostrou respostas `404` para RPCs que deveriam existir.

### Causa confirmada

- O histórico do Supabase foi marcado como aplicado, mas isso não comprovava que todos os comandos SQL haviam sido executados.
- A comparação direta entre o schema de produção e o schema local confirmou aplicação parcial.
- Faltavam 14 tabelas operacionais e 77 funções no banco de produção, além de policies dos buckets de logos e fotos de cortes.
- O comando `migration repair` corrige somente o histórico; ele não executa o conteúdo SQL ausente.
- A hipótese mais provável é execução parcial no SQL Editor ou interrupção no primeiro erro, preservando os comandos anteriores porque os arquivos antigos não estavam protegidos por uma transação única.

### Recuperação preparada

Foi criada a migration consolidada `20260926193000_recupera_schema_operacional_producao.sql`.

- Usa `BEGIN` e `COMMIT`: qualquer erro desfaz toda a recuperação.
- Cria somente os objetos que faltavam no snapshot real de produção.
- Faz backfill seguro de `agendamentos.data_fim`, `agendamentos.duracao_minutos_snapshot` e `financeiro_contas_receber.data_competencia` antes de aplicar `NOT NULL`.
- Restaura tabelas, funções, índices, chaves, triggers, RLS, policies, buckets e publicação Realtime.
- Remove o acesso público herdado por padrão nas novas funções e preserva apenas os acessos aprovados para `anon` e `authenticated`.
- Solicita recarga do cache do PostgREST ao final.

### Validação concluída

A migration foi aplicada com sucesso sobre uma cópia estrutural do schema de produção, primeiro vazia e depois com registros legados simulados.

- 101 funções tocadas terminaram com zero acesso público; 9 ficaram disponíveis somente para o portal anônimo e 72 para usuários autenticados.
- As 14 tabelas recuperadas ficaram sem escrita direta por `anon` ou `authenticated`; somente as tabelas previstas mantiveram leitura autenticada.
- Os 7 policies de Storage esperados foram recriados.
- Os registros antigos receberam corretamente duração, horário final e competência financeira.
- O lint do Supabase não encontrou erro bloqueante; restaram apenas warnings preexistentes em funções antigas.

Status: recuperação aplicada em produção com `supabase db push --linked` e registrada no histórico remoto como `20260926193000`.

### Verificação posterior em produção

- Um novo dump remoto confirmou as 14 tabelas operacionais recuperadas.
- As RPCs que devolviam `404` passaram a existir no schema remoto, incluindo agenda, disponibilidade, jornadas, bloqueios, módulos, PIX, recepção e títulos recorrentes.
- As colunas críticas `profiles.ativo`, `agendamentos.data_fim`, `financeiro_contas_receber.data_competencia` e a configuração PIX estão presentes.
- As 7 policies esperadas dos buckets `cortes-clientes` e `barbearias-logos` foram confirmadas.
- O aviso de certificado apresentado ao final do `db push` ocorreu somente na criação do cache auxiliar `pg-delta` do CLI antigo; ele apareceu depois da aplicação e não invalidou a transação nem o histórico remoto.

Próximo passo: atualizar o app no navegador e executar o roteiro funcional em produção, começando por agenda, disponibilidade, configurações, contas e recepção.

Confirmação final: após atualizar o app, o responsável pelo projeto confirmou que o ambiente voltou a funcionar. O incidente de schema/migrations parcialmente aplicadas está encerrado. A partir daqui, retomar o roteiro do MVP e registrar separadamente qualquer falha funcional específica encontrada nos testes reais.

## Preparação dos testes móveis

- O favicon padrão do Vite foi substituído pelo símbolo oficial do Garagem.
- Foram adicionados metadados para navegador móvel, iPhone e instalação na tela inicial, além do manifesto `site.webmanifest`.
- A entrada do barbeiro é `https://app.garagemsystem.com.br/login`; uma conta com papel `barbeiro` é redirecionada para `/barber/dashboard`.
- O primeiro acesso do cliente é `https://app.garagemsystem.com.br/portal/barbearia-teste`; um CPF válido ainda não encontrado abre automaticamente o formulário de cadastro.
- Build, lint e 99 testes automatizados passaram.

Status: alteração do ícone pronta localmente; falta publicar o frontend para aparecer em produção. Os dois fluxos móveis podem ser testados no domínio de produção, observando que o novo ícone só aparecerá depois do deploy.

## Atualização em tempo real da agenda

- O agendamento feito pelo portal do cliente já era persistido no banco e aparecia ao recarregar as telas.
- O painel administrativo inicial ainda não escutava alterações de agenda.
- A agenda administrativa e o painel do barbeiro já possuíam assinaturas no frontend, mas `public.agendamentos` não estava incluída na publicação `supabase_realtime`; por isso o comportamento não era confiável.
- Foi criada a migration `20260926200000_agendamentos_realtime.sql`, idempotente, para publicar a tabela de agendamentos no Realtime.
- O dono passa a receber um aviso global de novo agendamento em qualquer tela da área administrativa, enquanto painel e agenda atualizam os dados silenciosamente.
- O barbeiro recebe aviso somente de agendamentos ligados ao próprio `profissional_id`, sem sinal de horários de outros profissionais.
- Ao voltar para uma aba que estava em segundo plano, as telas recarregam os dados como proteção contra suspensão do navegador móvel.
- A migration foi validada no banco local, confirmando `public.agendamentos` na publicação `supabase_realtime`.
- Lint, build, 100 testes completos e os testes focados passaram.

Status: código e migration prontos localmente. Para funcionar em produção, ainda é necessário publicar o frontend e aplicar a migration no Supabase vinculado. Notificações com o navegador totalmente fechado exigirão uma etapa futura de Web Push/PWA ou integração com WhatsApp; o MVP atual cobre aviso dentro do sistema aberto.

## Padronização dos e-mails de acesso

- O convite de barbeiros e recepção já usa o Supabase Auth por `inviteUserByEmail`.
- Foi criado um template oficial escuro, responsivo e alinhado à identidade do Garagem, com o assunto `Seu acesso ao Garagem System` e botão para criação da senha.
- O remetente aprovado é `Garagem System <systemgaragem@gmail.com>`.
- O SMTP de produção depende de uma senha de aplicativo do Google, guardada somente no painel do Supabase.
- Foi preparada a ação **Reenviar convite** para barbeiros já cadastrados que ainda não confirmaram o acesso.
- A Edge Function de reenvio valida administrador, barbearia, vínculo profissional, estado ativo e confirmação do usuário antes de emitir um novo convite.
- O procedimento operacional está documentado em `docs/operacao/EMAILS-AUTENTICACAO.md`.
- Build, lint e 102 testes automatizados passaram.

Status: implementação pronta para revisão e publicação. A ativação final exige configurar o SMTP e copiar o template para o Supabase hospedado; arquivos locais de template não alteram automaticamente o Auth de produção.

## Observação de continuidade

Este snapshot foi criado antes do encerramento da janela de uso semanal e deve ser tratado como a referência mais recente do plano do projeto.
