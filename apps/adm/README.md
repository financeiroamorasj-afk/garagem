# ADM Garagem System

Aplicação separada para gestão da plataforma, prevista para o domínio `adm.garagemsystembarber.com.br`.

## Segurança

- autenticação pelo mesmo Supabase do Garagem;
- sessão SSR em cookies com `@supabase/ssr`;
- autorização validada em `plataforma_admins` no servidor;
- leituras administrativas usam `service_role` somente depois da autorização;
- a chave privilegiada nunca usa prefixo `NEXT_PUBLIC_` e nunca chega ao navegador.

## Ambiente

Copie `.env.example` para `.env.local` apenas no ambiente do ADM e preencha:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`.

## Execução

```bash
npm install
npm run dev
```

Na Vercel, crie um segundo projeto usando este mesmo repositório e defina o diretório raiz como `apps/adm`.
