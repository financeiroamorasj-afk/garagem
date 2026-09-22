---
description: "Unifica todos os campos monetários no CurrencyInput do design system com máscara brasileira por centavos, sem alterar banco."
---

# /ds-padronizar-campos-monetarios

## Objetivo

Padronizar todos os campos editáveis de dinheiro do Garagem System em um único
`CurrencyInput` do design system. A regra de interação aprovada é:

```text
Digite apenas algarismos: 500 = R$ 5,00; 50000 = R$ 500,00.
```

Assim ninguém precisa inserir manualmente a vírgula e reduzimos o risco de
registrar `500` quando a intenção era `R$ 5,00`.

Não alterar migrations, RPCs, schema, valores já persistidos, permissões ou
dados remotos. O campo continua entregando valor numérico em reais aos
consumidores existentes.

## Inventário obrigatório

Antes de editar, use `rg` para localizar todos os inputs editáveis de valor,
preço, custo, taxa, saldo, venda, serviço, produto, agendamento e ações
rápidas. Há hoje dois componentes com o nome `CurrencyInput`; não deixe nenhum
campo monetário novo ou antigo com comportamento divergente.

Não altere valores apenas exibidos em tabelas/cards: eles devem continuar usando
`formatarBRL`.

## Componente oficial

Consolide o comportamento em `src/components/ui/CurrencyInput.jsx`:

- exibir sempre a moeda brasileira com prefixo visual `R$`, separador de milhar
  e duas casas decimais;
- aceitar digitação, colagem e backspace com teclado decimal/numeral;
- extrair algarismos e sinal negativo, quando o campo permitir negativo;
- interpretar os algarismos como centavos: `1` → `R$ 0,01`, `500` →
  `R$ 5,00`, `50000` → `R$ 500,00`;
- permitir valor vazio quando o campo for opcional; zero deve ser explicitamente
  distinguível de vazio;
- não perder foco ou mover cursor ao digitar;
- `inputMode="numeric"` para teclado móvel, sem usar `type="number"`;
- label, ajuda, erro, `aria-invalid`, `aria-describedby`, foco visível e estado
  desabilitado conforme o design system;
- texto de ajuda padrão: “Digite apenas algarismos. Ex.: 500 = R$ 5,00.”,
  salvo quando uma ajuda mais específica for passada;
- prop explícita `allowNegative` (padrão `false`); saldo inicial financeiro a
  habilita, os demais campos não;
- retornar valor numérico em reais ou `null`, nunca string formatada, por uma
  API clara e uniforme (`onValueChange`).

Se precisar de helpers, coloque-os em módulo puro testável, sem duplicar a
lógica de moeda. Não use `Intl` como parser.

## Migração de consumidores

1. Migre todas as importações do antigo `src/components/CurrencyInput.jsx` para
   o componente oficial em `src/components/ui/CurrencyInput.jsx`.
2. Converta os consumidores à mesma assinatura `label`, `value`,
   `onValueChange`, `allowNegative`, `error` e `helpText`.
3. Remova o componente legado se não restar importação; se compatibilidade for
   necessária temporariamente, mantenha somente um adaptador fino sem estado ou
   máscara própria. Nunca mantenha duas implementações de parsing.
4. Atualize, no mínimo, os fluxos de agendamento, ações rápidas,
   cadastro/edição de serviço/produto, agendamento administrativo e cadastro
   de conta bancária.
5. No saldo inicial da conta, mantenha a confirmação adicional para número
   negativo e adapte-a ao valor numérico retornado pela nova máscara.

## Design system

Atualize `docs/design-system/DESIGN-SYSTEM.md` para documentar este padrão
monetário único, incluindo os exemplos `500 → R$ 5,00` e o uso exclusivo de
`CurrencyInput` para valores editáveis. Atualize a vitrine `/design-system`
com demonstração de digitação e estado negativo permitido, sem dados reais.

## Testes obrigatórios

Adicione testes puros e/ou de componente, sem dependências novas, cobrindo:

- `500` vira `5,00`; `50000` vira `500,00`;
- colagem de `R$ 1.234,56` resulta em `1234,56`;
- backspace e limpeza;
- vazio versus zero;
- negativo permitido e negativo bloqueado;
- arredondamento/limite seguro; valores não finitos rejeitados;
- todos os consumidores migrados não usam o componente legado nem `input`
  monetário manual.

Rode testes, lint dos arquivos alterados, `git diff --check` e build. Em
localhost, valide desktop e celular nos formulários migrados, com console sem
erros. Não faça commit; pare para aprovação visual.

## Relatório

```
## Relatório /ds-padronizar-campos-monetarios

### Componente único
[contrato, máscara e suporte a negativo]

### Campos migrados
[lista dos fluxos cobertos]

### Design system
[documentação e vitrine]

### Verificação local
[testes, lint, build e localhost]

### Aguardando aprovação visual
[o que digitar e conferir]
```
