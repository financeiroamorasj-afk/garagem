---
description: Migra o código existente do Garagem System para os tokens e primitivos do design system aprovado em /design-system
---

# /ds-migrar

## Objetivo

O design system (tokens em `src/index.css` + 8 primitivos em `src/components/ui/`) já foi criado, revisado visualmente em `/design-system` e **aprovado por Rafa**. Este comando migra o restante do código (`src/pages`, `src/components`) para usar esses tokens e primitivos, substituindo os padrões antigos.

**Este NÃO é um comando de refatoração de lógica.** É migração visual: trocar `className` hardcoded por tokens/primitivos, sem alterar comportamento, state, chamadas ao Supabase, rotas ou props de negócio.

---

## Regras de ouro (não negociáveis)

1. **Nunca altere lógica.** Se um `onClick`, `useState`, `useEffect`, query ao Supabase, ou prop de negócio precisar mudar para a migração funcionar, PARE e reporte — não decida sozinho.
2. **Prefira os primitivos sobre className cru.** Se existe `<Button>`, `<Input>`, `<Card>`, `<Badge>`, `<Modal>`, `<Label>`, `<Spinner>` ou `<EmptyState>` que cobre o caso, use o primitivo em vez de recriar o estilo com Tailwind direto.
3. **Gradientes e sombras grandes em elementos estáticos (não-overlay): NÃO REMOVA AUTOMATICAMENTE.** Rafa ainda vai decidir tela por tela se ficam, viram exceção documentada, ou saem. Ao encontrar um, **apenas sinalize no relatório** (arquivo, linha, trecho) e deixe como está no código por enquanto.
4. **Não toque no `.env`, configs do Supabase, rotas do `react-router-dom`, ou schema/queries.**
5. **Um arquivo por commit.** Cada página/componente migrado = um commit separado, mensagem no padrão `ds-migrar: <nome do arquivo>`. Isso permite reverter um arquivo sem afetar os outros.
6. **Não quebre a rota `/design-system`.** Ela é a fonte de verdade visual — não a edite neste processo.

---

## Mapeamento: padrão antigo → token/primitivo novo

| Padrão antigo encontrado no código | Substituir por |
|---|---|
| `bg-[#1a1a1a]`, `bg-[#121212]`, `bg-[#161616]`, `bg-industrial-dark` | `bg-surface-0` / `bg-surface-1` / `bg-surface-2` / `bg-surface-3` (conforme camada de elevação) |
| `text-gray-500`, `text-gray-600`, `text-gray-800` | `text-steel` (ou `text-warm-white` se for texto primário) |
| `border-gray-800`, `border-gray-900` | classe de borda com token `--color-line` (verificar nome exato no `index.css`) |
| `rounded-3xl`, `rounded-2xl`, `rounded-[3rem]`, `rounded-full`, `borderRadius: '25px'` (padrão antigo "Rebip" em `ClientSearch.jsx`) | `rounded` (2px) ou `rounded-md` (4px) — nunca mais que isso |
| `shadow-2xl`, `shadow-xl` em card estático (não-modal) | **sinalizar, não remover** (ver Regra 3) |
| `bg-gradient-to-r from-copper to-gold-aged` (texto ou botão) | **sinalizar, não remover** (ver Regra 3) |
| Botões com classes manuais (`bg-copper text-white font-black py-4 px-8 rounded-2xl ...`) | `<Button variant="primary" size="...">` |
| Inputs manuais (`<input className="w-full bg-industrial-dark border ...">`) | `<Input>` |
| Cards de dado/estatística (`bg-[#1a1a1a] border ... rounded-3xl p-6`) | `<Card>` |
| Badges de status (pendente/pago/atrasado) | `<Badge variant="...">` |
| Overlays de modal manuais | `<Modal>` |
| Loading spinners manuais (`animate-spin rounded-full border-b-2`) | `<Spinner>` |
| Telas/listas vazias sem dado | `<EmptyState>` |
| Fontes: `font-black`, `tracking-tighter`, `uppercase` em headers de página/seção | Aplicar classe de tipografia correspondente da escala (`display`, `h1`, `h2` → Fraunces 600) |
| Fontes: labels pequenos uppercase (`text-[9px] font-black uppercase tracking-widest`) | Classe `label` da escala (JetBrains Mono 500, uppercase) |
| Valores monetários (`R$ {value.toLocaleString(...)}`) | Classe `data` / `data-lg` da escala (JetBrains Mono, tabular-nums) — **manter a lógica de formatação `.toLocaleString`, só trocar a className** |

---

## Escopo de arquivos (ordem de prioridade)

Escaneie `src/pages` e `src/components` por completo — esta lista é o que já identificamos, mas não é exaustiva:

**Páginas:**
1. `src/pages/Login.jsx`
2. `src/pages/Dashboard.jsx`
3. `src/pages/AdminDashboard.jsx` (maior arquivo, migrar por seção/tab: overview → team → services → inventory → settings)

**Componentes:**
4. `src/components/ClientSearch.jsx` (atenção especial — tem o padrão antigo "Rebip" comentado explicitamente no código, é o principal candidato ao mapeamento de `borderRadius: '25px'`)
5. `src/components/ServiceProductModal.jsx`
6. `src/components/BarberModal.jsx`
7. `src/components/QuickAppointmentModal.jsx`
8. `src/components/CurrencyInput.jsx`
9. Qualquer outro componente em `src/components` não listado acima

Migre **um arquivo por vez, nesta ordem**. Não pule para o próximo sem reportar o anterior.

---

## Lembretes técnicos (gotchas já mapeados no projeto)

- `--color-text-primary` colide com namespace do Tailwind → use os aliases `--color-warm-white` / `--color-steel`, nunca crie `text-text-*`.
- `var()` dentro de `@theme` quebra `color-mix()` em opacidade — se precisar de um novo alias com opacidade (`bg-algo/12`), use hex literal, não `var()`.
- Tokens de `duration` não têm namespace no Tailwind — use `duration-100/200/400` direto na classe, não crie variável.
- Utilities customizadas precisam de `@utility`, não `@layer utilities`.
- O único uso autorizado de valor arbitrário do Tailwind neste projeto é `brightness-[...]`. Qualquer outro valor arbitrário que você for tentado a criar (`rounded-[3rem]`, `bg-[#1a1a1a]`) é exatamente o que este comando existe para eliminar — não crie novos.

---

## Processo por arquivo

Para cada arquivo, nesta ordem:

1. Leia o arquivo inteiro antes de editar.
2. Liste mentalmente (ou em comentário temporário) todos os padrões antigos encontrados, usando a tabela de mapeamento.
3. Aplique as substituições, preservando 100% da lógica (props, state, handlers, imports de dados).
4. Rode o app localmente (ou pelo menos confirme que não há erro de sintaxe/import) antes de commitar.
5. Commit: `git commit -m "ds-migrar: <nome-do-arquivo>"`.
6. Adicione ao relatório final (ver formato abaixo).

---

## Formato do relatório final

Ao terminar (ou ao pausar por bloqueio), produza um resumo assim:

```
## Relatório /ds-migrar

### Arquivos migrados
- src/pages/Login.jsx ✅
- src/pages/Dashboard.jsx ✅
- ...

### Pontos sinalizados para decisão do Rafa (NÃO alterados)
- src/components/ClientSearch.jsx:23 — borderRadius: '25px' (padrão "Rebip" antigo, comentado no código)
- src/pages/AdminDashboard.jsx:142 — bg-gradient-to-r from-copper to-gold-aged (texto do logo "Garagem")
- src/pages/Login.jsx:88 — shadow-[0_0_15px_rgba(184,115,51,0.3)] em botão de login
- ...

### Bloqueios / dúvidas (precisei parar)
- [descrever qualquer caso onde a migração exigiria mudar lógica, ou onde o mapeamento não estava claro]

### Commits gerados
- <lista de commits, um por arquivo>
```

Não segue para o merge/push sozinho — o relatório é para Rafa revisar aqui no chat antes de aprovar.
