---
tags: [funcionalidade, atendimento, mobile]
---
# HistÃ³rico de Cortes

Esta funcionalidade visa melhorar o acompanhamento do cliente entre as visitas.

## Objetivo
O barbeiro registra rapidamente o resultado do atendimento ou consulta o *Ãºltimo corte* de um cliente assim que ele retorna, para ter referÃªncia do que fazer ou replicar um penteado jÃ¡ aprovado.

## O Modelo
- ExistirÃ¡ um **Ãºnico registro ativo de corte** por cliente, para evitar acÃºmulo desnecessÃ¡rio de dados idÃªnticos.
- Caso o corte mude, o registro antigo Ã© *arquivado* (mantendo seus metadados para consulta histÃ³rica), e um novo passa a ser o ativo.
- Fotos acompanham esses registros com limites de retenÃ§Ã£o e "lixeira lÃ³gica".

## Atributos e Campos (UI Mobile)
Para facilitar o preenchimento, os itens mais repetitivos sÃ£o em forma de seletor rÃ¡pido (tags), ao invÃ©s de texto:
- Tipo/Estilo do corte.
- Pente principal e auxiliares (mÃ¡quina).
- Tipo de acabamento (degradÃª, navalha, tesoura, etc.).
- Detalhes de barba/acabamento.
- AnotaÃ§Ãµes livres (comprimento, preferÃªncias especiais).
