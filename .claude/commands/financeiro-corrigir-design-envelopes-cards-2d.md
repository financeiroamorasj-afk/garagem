---
description: "Torna cards a visualização principal dos envelopes na vitrine do design system, sem alterar UI operacional ou banco."
---

# /financeiro-corrigir-design-envelopes-cards-2d

## Objetivo

Corrigir a prévia visual dos envelopes para que a experiência principal seja uma grade de **cards**, mais amigável e orientada a propósito. A tabela/lista não deve ser removida necessariamente, mas fica como visão compacta secundária para futura consulta — não como protagonista.

Nenhuma RPC mutável, migration, banco, rota operacional, commit ou deploy é autorizado.

## Design obrigatório dos cards

Na seção Envelopes da vitrine `/design-system`, substituir a lista principal por uma grade responsiva de cards. Cada card deve mostrar:

- ícone existente coerente com “envelope/reserva”, sem novo pacote;
- nome do envelope e finalidade;
- conta vinculada em texto secundário;
- percentual de distribuição em badge semântico;
- “Saldo reservado” como valor de maior hierarquia;
- medidor de uso/reserva usando o primitivo acessível aprovado;
- situação em texto + badge, sem depender somente de cor;
- ação “Ver extrato”, que abre o protótipo demonstrativo do extrato daquele card;
- ação “Usar / resgatar” apenas visualmente inativa, com explicação de que a integração virá depois.

O extrato demonstrativo deve refletir o envelope selecionado, contendo distribuição, resgate/uso, estorno, data BRT, valor, direção e saldo após cada evento.

## Layout

- Desktop: duas ou três colunas conforme a largura disponível, mantendo cartões de mesma altura por linha quando possível.
- Tablet: duas colunas.
- 360 px: uma coluna, botões com área de toque adequada e nenhum overflow horizontal do documento.
- Usar `Card`, `Badge`, `Button`, `Modal`, tokens e tipografia existentes.
- Sem aparência copiada do Rebip: preservar paleta escura, bordas, raios e densidade do Garagem.
- A tabela compacta, se permanecer, deve ficar abaixo dos cards com rótulo “Visão compacta”, e não duplicar ações primárias.

## Acessibilidade e estados

- Cada card deve ter nome acessível, ordem de foco natural e controles com rótulos claros.
- Modal fecha por Escape, overlay e retorna foco ao botão de origem.
- O medidor oferece texto alternativo com valores e percentual.
- Demonstrar card sem saldo, atenção e inativo.

## Validação

Rodar lint dos arquivos alterados, testes existentes, build e `git diff --check`. Confirmar `/design-system` em localhost com HTTP 200. Não fazer alterações fora do design system.

## Relatório

Entregar `Relatório /financeiro-corrigir-design-envelopes-cards-2d` com arquivos alterados, comportamento do extrato demonstrativo, acessibilidade, validações e URL para aprovação visual desktop/360 px.

