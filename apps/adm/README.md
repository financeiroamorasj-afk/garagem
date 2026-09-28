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
- `ASAAS_API_KEY` e `ASAAS_WEBHOOK_SECRET` para o gateway inicial;
- `OPENAI_API_KEY` para os complementos de IA quando forem ativados.

O catálogo `plataforma_integracoes` guarda somente provedor, ambiente, URL e
referências para variáveis seguras. O ADM exibe se cada variável está configurada,
mas nunca lê seu valor para o navegador. Assim, o Asaas e os provedores de IA
podem ser substituídos sem refazer o modelo de assinaturas.

## Execução

```bash
npm install
npm run dev
```

Na Vercel, crie um segundo projeto usando este mesmo repositório e defina o diretório raiz como `apps/adm`.
