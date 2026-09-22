---
name: "source-command-supabase-local-fundacao"
description: "Configura Supabase local via CLI + Docker (Docker Desktop já está rodando, confirmado). Usa `supabase db pull` para gerar uma migration baseline fiel ao schema real de produção, já que o histórico de migrations do repo é incompleto — depois sobe o stack local e cria um usuário admin de teste com credencial conhecida."
---

# source-command-supabase-local-fundacao

Use this skill when the user asks to run the migrated source command `supabase-local-fundacao`.

## Command Template

# /supabase-local-fundacao

## Contexto

Histórico de migrations do repo é incompleto: `rls_setup.sql` era manual (não gerado pelo CLI), tabelas mais antigas nunca tiveram migration formal, e só recentemente passamos a gerar migrations reais (`/schema-operacional-fundacao`, `/rls-emergencial-fundacao`). Isso significa que `supabase start` sozinho, sem mais nada, **não reproduziria o schema real** — só rodaria as poucas migrations que existem no repo.

Docker Desktop já está rodando (confirmado por Rafa, container `amora-avalia-v2` visível, é de outro projeto — não mexer nele).

---

## Parte 1 — Confirmar Supabase CLI

1. Confirme se o Supabase CLI está instalado (`supabase --version`). Se não estiver, instale (via npm/scoop/brew conforme o SO — confirme o SO antes de escolher o método).
2. Confirme se o projeto já tem `supabase/config.toml` (indicando `supabase init` já rodado) ou se precisa inicializar agora. Se `supabase/migrations/` já existe com os arquivos dos comandos anteriores, **não rode `supabase init` de um jeito que sobrescreva essa pasta** — verifique antes.

## Parte 2 — Gerar baseline fiel ao schema real (db pull)

1. `supabase link` para o projeto de produção (vai pedir o project ref e a senha do banco — se precisar, pare e peça a Rafa em vez de tentar adivinhar ou usar credencial de outro lugar).
2. Rode `supabase db pull` — isso gera uma migration nova capturando o schema real atual, preenchendo a lacuna do histórico incompleto.
3. **Importante**: `db pull` pode gerar conflito ou duplicação com as migrations que já existem no repo (`/schema-operacional-fundacao`, `/rls-emergencial-fundacao`), já que essas já foram aplicadas em produção e o `db pull` vai capturar o estado pós-aplicação delas também. Se isso acontecer, não tente resolver sozinho de forma destrutiva (ex: apagando migrations existentes) — pare e reporte o conflito, é uma decisão que precisa de review.

## Parte 3 — Subir o stack local

1. `supabase start` — sobe Postgres, Auth, Storage, Studio local via Docker.
2. Confirme que subiu sem erro e anote as portas/URLs locais geradas (API URL, anon key, service role key, Studio URL).
3. **Não aplique isso ainda no `.env` do frontend** — deixe como próximo passo manual de Rafa, depois que ele revisar (trocar entre local/produção deve ser uma escolha consciente dele, não automática).

## Parte 4 — Criar usuário admin de teste com credencial conhecida

1. No Supabase local (não em produção), crie um usuário de teste via Auth (email/senha simples e conhecida, tipo `admin@teste.local` / uma senha que você define e reporta em texto claro — é ambiente local, não é segredo de produção).
2. Crie o `profile` correspondente vinculado a uma barbearia de teste local (pode ser a mesma "Barbearia-teste" recriada localmente, ou uma nova — confirme qual faz mais sentido dado o que o `db pull` trouxe).
3. Reporte a credencial em texto claro no relatório — de novo, ambiente local, sem risco real.

---

## O que NÃO fazer

- Não mexer no container `amora-avalia-v2` visível no Docker Desktop — é de outro projeto.
- Não sobrescrever migrations existentes sem reportar conflito primeiro.
- Não trocar o `.env` do frontend para apontar pro ambiente local — isso fica para Rafa decidir depois de revisar.
- Não aplicar nada contra produção neste comando — é 100% sobre criar o ambiente local.

---

## Formato do relatório

```
## Relatório /supabase-local-fundacao

### CLI e link
[versão confirmada, projeto linkado com sucesso?]

### db pull
[migration gerada, algum conflito com migrations existentes? qual?]

### Stack local
[status do supabase start, URLs/portas geradas]

### Usuário de teste criado
[email/senha em texto claro, barbearia vinculada]

### Próximo passo sugerido para Rafa
[ex: revisar migration baseline, decidir se troca o .env local]

### Riscos ou dúvidas
[qualquer coisa que precise de decisão]
```
