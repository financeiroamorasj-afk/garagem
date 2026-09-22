# Checklist para o MVP — Garagem System

> Atualizado em 27/08/2026 a partir do código, migrations, testes e auditorias do projeto. Este documento organiza prioridades; não autoriza deploys ou alterações remotas.

## Legenda

- [x] concluído e implantado/auditado quando envolve banco;
- [~] implementado localmente ou parcialmente, ainda exige consolidação/revisão;
- [ ] ainda não implementado.

## 1. Módulo financeiro

### Fundação e segurança

- [x] Isolamento por `barbearia_id`, RLS e acesso administrativo `admin/master`.
- [x] Ledger financeiro, auditoria e operações idempotentes.
- [x] Contas bancárias e categorias com criação, edição, ativação e regras de integridade.
- [x] Resumo por período, saldo por conta, resultado diário e próximos vencimentos.
- [x] Listagem e liquidação de títulos existentes a pagar e a receber.
- [x] Envelopes: cadastro, percentuais, distribuição diária, extrato e aporte avulso.
- [x] Proteção para pagamentos e transferências não consumirem valores reservados.
- [x] Backup, deploy e auditoria da Fase 2D.1 em produção.
- [~] Consolidar e versionar toda a UI financeira atual com sua árvore completa de dependências.
- [ ] Corrigir os erros globais de lint preexistentes e estabelecer uma suíte limpa como critério de entrega.

### Operação diária — prioridade máxima

- [ ] Criar, editar e cancelar lançamentos manuais a pagar.
- [ ] Criar, editar e cancelar lançamentos manuais a receber.
- [ ] Definir regras para títulos recorrentes e parcelados.
- [ ] Implementar pagamentos e recebimentos parciais, ou declarar explicitamente que o MVP aceita apenas liquidação integral.
- [ ] Implementar estorno auditável de pagamento e recebimento.
- [ ] Criar a interface de transferência entre contas bancárias usando a RPC já existente.
- [ ] Conectar **Usar / resgatar envelope** a um título manual pendente.
- [ ] Conectar o estorno de resgate do envelope.
- [ ] Exibir o saldo disponível, considerando reservas, em todos os fluxos que debitam uma conta.
- [ ] Criar histórico operacional unificado por conta, com filtros e rastreabilidade.

### Integração com a barbearia

- [ ] Definir a fonte de verdade do faturamento: atendimento concluído, venda/checkout ou recebimento financeiro.
- [ ] Ao concluir uma venda/atendimento, gerar a entrada financeira uma única vez, com idempotência.
- [ ] Integrar formas de pagamento, taxas e data real de recebimento.
- [ ] Integrar venda de produtos, custo no momento da venda e CMV.
- [ ] Consolidar comissão por profissional e por serviço usando os campos já existentes no schema.
- [ ] Criar fechamento e pagamento de comissões sem dupla contagem financeira.
- [ ] Tratar cancelamento/estorno operacional e seu reflexo financeiro.
- [ ] Definir como créditos do cliente são emitidos, usados, expirados e exibidos na interface.

### Relatórios e controle

- [ ] Implementar DRE detalhada por grupo, período e competência; a tela atual é um resumo, não uma DRE completa.
- [ ] Implementar fluxo de caixa realizado e previsto.
- [ ] Exibir contas vencidas, a vencer e projeção de saldo.
- [ ] Implementar conciliação bancária por importação OFX/CSV.
- [ ] Criar regras de matching por valor, data, descrição e tolerância, sempre com confirmação humana.
- [ ] Tratar duplicidade de importação por FITID/hash.
- [ ] Implementar fechamento de período e regras para impedir alterações retroativas indevidas.
- [ ] Adicionar exportação de relatórios e trilha de auditoria administrativa.

### Qualidade para considerar o financeiro terminado

- [ ] Testes ponta a ponta dos fluxos principais no navegador.
- [ ] Testes de autorização com `admin`, `master`, barbeiro e usuário sem perfil.
- [ ] Testes de concorrência para novos lançamentos, estornos, resgates e conciliação.
- [ ] Ensaio documentado de restauração do backup lógico; os dumps atuais têm FKs circulares que exigem procedimento próprio.
- [ ] Revisão desktop e mobile de todas as telas financeiras.
- [ ] Monitoramento de falhas das RPCs e rotina de suporte sem expor SQL ao usuário.
- [ ] Checklist de produção, backup, dry-run, deploy e auditoria para cada migration futura.

## 2. Operação central da barbearia

### Agenda e atendimento

- [~] Corrigir e consolidar o fluxo de agendamento sobre as colunas reais do banco.
- [ ] Criar cliente novo diretamente durante o agendamento quando não houver correspondência.
- [ ] Validar encaixe, reagendamento, cancelamento, falta e conclusão do atendimento.
- [ ] Validar conflitos de horário, duração do serviço e disponibilidade do barbeiro no banco.
- [ ] Substituir dados demonstrativos restantes por consultas reais.
- [ ] Criar checkout simples do atendimento: serviços, produtos, descontos, forma de pagamento e conclusão.

### Cadastros operacionais

- [ ] Gestão completa de barbeiros/profissionais.
- [ ] Gestão completa de serviços, preços, duração e comissão.
- [ ] Gestão de produtos, custo, preço, estoque e movimentações.
- [ ] Gestão de clientes, contatos, observações e histórico.
- [ ] Configurações reais da barbearia, horários, permissões e preferências.

### Recepção e dono da barbearia

- [ ] Painel de recepção totalmente conectado a dados reais e estados operacionais.
- [ ] Dashboard do dono sem métricas fictícias.
- [ ] Indicadores de faturamento, ocupação, ticket médio, retorno e produtividade com definições auditáveis.
- [ ] Perfis e menus específicos para dono, recepção e barbeiro.

## 3. Histórico do corte do cliente

- [ ] Definir contrato do registro de corte e vínculo com cliente, barbeiro e atendimento.
- [ ] Seletores para estilo, pentes, técnica, acabamento, barba e outros atributos recorrentes.
- [ ] Campo de observações técnicas e preferências do cliente.
- [ ] Consulta rápida do último corte ao abrir o atendimento.
- [ ] Ação **Repetir corte anterior** sem duplicação desnecessária.
- [ ] Ao registrar novo corte, arquivar o anterior em vez de excluir imediatamente.
- [ ] Lixeira lógica, restauração e retenção auditável.
- [ ] Definir limites de registros e política de privacidade.

## 4. Fotos, Storage e compactação

- [ ] Bucket privado segmentado por barbearia, cliente e registro.
- [ ] Policies de Storage por tenant e papel; nenhuma URL pública permanente.
- [ ] URLs assinadas de curta duração.
- [ ] Compactação antes do upload, redimensionamento e remoção de EXIF/localização.
- [ ] Definir formato, dimensões, tamanho e quantidade máxima de fotos.
- [ ] Upload por câmera e galeria com feedback de progresso e retry idempotente.
- [ ] Lixeira e exclusão automática após prazo aprovado.
- [ ] Auditoria para impedir leitura ou remoção entre barbearias.
- [ ] Testes separados do Storage; a validação financeira sem Storage não cobre esta frente.

## 5. Experiência mobile como aplicativo

- [ ] Projetar navegação mobile própria, priorizando agenda, chegada, histórico e fechamento.
- [ ] Áreas de toque, teclado, modais e formulários adequados ao uso com uma mão.
- [ ] Manifesto PWA, ícones, instalação e tela de abertura.
- [ ] Definir quais fluxos podem funcionar offline e quais devem bloquear sem conexão.
- [ ] Não cachear dados financeiros ou fotos privadas sem política específica.
- [ ] Fila segura de sincronização, retry e resolução de conflito.
- [ ] Testes em aparelhos reais, além de larguras simuladas.

## 6. Produto, administração e lançamento

- [ ] Construir `adm.garagemsystembarber.com.br` com gestão de barbearias, planos e suporte.
- [ ] Definir onboarding da barbearia e criação segura do primeiro administrador.
- [ ] Recuperação de senha, convite de equipe e desligamento de acesso.
- [ ] Logs de suporte, auditoria e ferramentas sem acesso indevido entre tenants.
- [ ] Landing page e captação de leads conectadas a um fluxo real.
- [ ] Termos, política de privacidade, consentimento de fotos e adequação à LGPD.
- [ ] Ambiente de homologação separado de produção.
- [ ] Pipeline de deploy, migração, rollback e verificação pós-deploy.
- [ ] Monitoramento, alertas, erros de frontend e saúde do Supabase.
- [ ] Plano comercial, cobrança e limites por assinatura.

## Ordem recomendada para chegar ao MVP

1. Consolidar e versionar a UI financeira já aprovada.
2. Implantar lançamentos manuais a pagar/receber, transferência e estornos.
3. Liberar resgate de envelopes para títulos pendentes.
4. Fechar checkout de atendimento e integração automática com o financeiro.
5. Implementar comissões e fechamento da equipe.
6. Entregar DRE detalhada, fluxo de caixa e conciliação bancária.
7. Fechar cadastros, agenda, recepção e dashboards com dados reais.
8. Implantar histórico do corte sem fotos.
9. Implantar Storage privado, compactação e retenção de fotos.
10. Projetar e validar a experiência mobile/PWA.
11. Construir o ADM da plataforma, onboarding, suporte, LGPD e operação comercial.

## Próximo checkpoint recomendado

Concluir a auditoria de escopo do commit da UI de envelopes. Em seguida, iniciar o contrato seguro de criação e manutenção de títulos manuais. Esse contrato desbloqueia o resgate dos envelopes e transforma o financeiro atual em uma ferramenta utilizável no dia a dia.
