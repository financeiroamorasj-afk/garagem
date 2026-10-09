# Entrega de 08/10/2026 — Modo TV, operação móvel e envelopes

## O que mudou

- Modo TV: o endereço `/tv` pode ser copiado e aberto em nova aba no painel do dono. A prévia da agenda também abre em nova aba. A interface distingue falta de permissão do barbeiro de ausência de TV conectada.
- Reprodução: a prévia administrativa preserva o player quando uma atualização temporária da agenda falha. Abas ocultas ainda podem ter vídeo suspenso pelo navegador; para uso contínuo, a tela da TV deve permanecer visível no aparelho.
- Barbeiro: atendimento em andamento mostra cronômetro a partir de `iniciado_em`, com opção de ocultar o tempo. Falhas ao iniciar aparecem junto ao atendimento. Ações de dias anteriores são explicadas em vez de oferecer botão inerte.
- Celular: removido o segundo botão de menu da barra inferior; a agenda semanal recolhe dias anteriores por padrão, com comando para reabri-los; contas financeiras usam cartões na tela estreita para evitar tabela encoberta ou cortada.
- Aparência: modo claro opcional, persistido neste navegador, disponível na entrada e nas áreas administrativa, do barbeiro e da recepção.
- Envelopes: `Usar / resgatar` libera parte ou todo o saldo reservado para o saldo disponível da conta bancária vinculada. Não cria receita nem movimentação bancária. Operação auditada, idempotente e limitada ao saldo do envelope.

## Banco de dados e publicação

- Migration: `20261008193000_resgate_livre_envelopes.sql`, aplicada e confirmada no Supabase de produção em 08/10/2026.
- Antes da migration, foi salvo snapshot do schema público em `%TEMP%/garagem-schema-before-20261008193000.sql` no computador de trabalho. É backup de estrutura, não de dados.
- Código-fonte: commit `23d1dc7` na branch `codex/modo-tv-acesso-link`.

## Verificação e limites

- Validação local repetida em 09/10/2026: 141 testes aprovados, incluindo o pareamento e controle da TV. Build Vite, build Next.js/TypeScript do ADM e ESLint concluídos sem erros.
- O clique que não reagia no atendimento não pôde ser reproduzido com o login local disponível. A interface agora mostra erros no próprio cartão; é necessário retestar com um atendimento real.
- A exibição de fotos de produtos e publicações no Modo TV não faz parte desta entrega. Requer fotos no cadastro de produtos, curadoria e um canal de conteúdo para a TV. A integração opcional ao Instagram deve usar autorização da conta profissional, sem copiar publicações por scraping.
