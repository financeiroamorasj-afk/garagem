---
description: "Corrige autorização visual e retries idempotentes da integração UI da Fase 2B, sem migration e sem operações financeiras em produção."
---

# /financeiro-corrigir-integracao-ui-fase-2b

## Objetivo

Corrigir dois bloqueios da revisão da integração das telas financeiras:

1. o layout administrativo não pode assumir papel `admin` por mock;
2. pagar/receber deve reutilizar a mesma chave de idempotência em retries da
   mesma intenção.

Não crie migrations, RPCs ou alterações no Supabase remoto. Não use
`service_role`, não altere RLS e não execute `pagarConta` ou `receberConta`
contra dados de produção durante esta etapa.

## Antes de editar

1. Leia integralmente o design system aprovado e os arquivos:
   - `src/components/layout/AdminLayout.jsx`;
   - `src/components/ProtectedRoute.jsx`;
   - `src/pages/financeiro/FinanceTitles.jsx`;
   - `src/lib/supabase.*` e políticas de `profiles` no baseline.
2. Confirme que a leitura do próprio perfil usa a policy existente de RLS
   (`id = auth.uid()`). Se o schema real não confirmar isso, pare e reporte;
   não invente uma consulta privilegiada.
3. Preserve modificações alheias do worktree.

## Correção 1 — Papel real da sessão

Substitua o mock `useUser` de `AdminLayout` por um fluxo real e mínimo:

- obter a sessão autenticada pelo cliente Supabase já configurado;
- consultar apenas o próprio `profiles.id` para obter `role` e, se necessário,
  nome de exibição; nunca consultar outros perfis;
- enquanto carrega, apresentar estado de carregamento acessível do design
  system;
- em sessão ausente, retornar ao login;
- em erro de leitura, perfil inexistente ou papel fora de `admin`/`master`,
  negar por padrão, sem renderizar menu, rotas ou dados financeiros;
- preservar a proteção de banco existente: este controle visual não substitui
  `financeiro_assert_admin()`;
- não colocar `role`, tenant ou qualquer permissão em armazenamento local
  persistente.

Se for útil, extraia um hook pequeno e reutilizável em diretório coerente, mas
não faça refactor fora desse fluxo. Trate alterações de autenticação em tempo
real para que logout ou troca de sessão revogue a tela imediatamente.

## Correção 2 — Chave de idempotência por intenção

Em `FinanceTitles.jsx`:

- gere a chave com `crypto.randomUUID()` somente quando o modal de liquidação
  for aberto para um título;
- guarde a chave em `useRef` ou estado que não seja recriado por render;
- reutilize exatamente a mesma chave em toda nova tentativa de confirmação
  enquanto o mesmo modal/intenção estiver aberto;
- limpe a chave somente ao cancelar/fechar o modal, escolher outro título ou
  concluir com sucesso;
- mantenha o botão desabilitado durante envio e preserve foco/modal;
- não exponha a chave na UI, URL, logs ou mensagens de erro.

Não modifique a assinatura dos wrappers financeiros e não crie uma operação
simulada. A confirmação continua usando as RPCs existentes apenas quando um
admin decide operar em ambiente real.

## Tratamento de falhas e estados

- Se a listagem de contas bancárias falhar, mostre erro recuperável; não
  silencie a falha nem deixe modal aparentemente disponível sem contas.
- Se não houver conta ativa, explique no modal que não é possível liquidar
  antes de cadastrar uma conta, mantendo a confirmação desabilitada.
- Diferencie erro de autorização de erro de carregamento, sem revelar detalhes
  do banco ou de outra barbearia.
- Continue usando tokens/primitivos do design system, foco visível, labels
  ligados e texto além de cor para estados.

## Testes obrigatórios

1. Adicione testes sem dependências novas que comprovem a política de chave:
   uma intenção cria uma chave, retries reutilizam-na e cancelamento/nova
   intenção cria outra. Extraia helper puro testável se necessário.
2. Teste ou inspecione de forma reproduzível os quatro estados do layout:
   carregando, sessão ausente, perfil `barbeiro`/sem perfil e perfil
   `admin`/`master`.
3. Em localhost, valide desktop e mobile:
   - rota financeira com admin;
   - acesso negado para barbeiro, sem dados renderizados;
   - modal com Escape, clique no overlay, foco preso e foco devolvido;
   - tentativa de retry reutiliza a chave internamente;
   - erro de contas bancárias é visível e recuperável;
   - tabelas em estado vazio real;
   - console sem erros.
4. Não clique em “Pagar” ou “Receber” usando produção. Para validar a chamada
   mutável, use apenas Supabase local com fixture transacional descartada, ou
   valide o fluxo por teste automatizado mockado.
5. Execute lint dos arquivos alterados, testes, `git diff --check` e build.

## Relatório

```
## Relatório /financeiro-corrigir-integracao-ui-fase-2b

### Autorizações e idempotência
[como o papel real e a chave por intenção foram implementados]

### Segurança
[RLS do próprio perfil, negação por padrão e ausência de service_role]

### Validação local
[testes, desktop/móvel, modal, estados e console]

### Operações financeiras
[confirme que nenhuma liquidação foi executada em produção]

### Próximo checkpoint
[auditoria humana e aprovação visual antes de commit]
```
