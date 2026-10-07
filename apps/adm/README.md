# ADM Garagem System

Aplicação separada para gestão da plataforma, publicada no domínio `adm.garagemsystem.com.br`.

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
- `ASAAS_ENVIRONMENT=sandbox` durante a homologação, depois `producao`;
- `ASAAS_API_KEY` gerada no mesmo ambiente informado acima;
- `ASAAS_WEBHOOK_SECRET`, token exclusivo do webhook com 32 a 255 caracteres — nunca reutilize a API Key;
- `CHECKOUT_ALLOWED_ORIGINS`, `GARAGEM_LANDING_URL` e `GARAGEM_APP_URL` para limitar a origem e os retornos do checkout;
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

## Homologação do Asaas

1. Aplique as migrations no banco remoto.
2. Publique o ADM com `ASAAS_ENVIRONMENT=sandbox`.
3. Cadastre no Sandbox do Asaas o webhook `https://adm.garagemsystem.com.br/api/webhooks/asaas`, com envio sequencial e os eventos de Checkout e pagamento definidos no Cofre.
4. Só depois publique a Landing Page com os botões de assinatura.
5. Confirme no ADM a sequência checkout → evento → barbearia → convite → assinatura antes de trocar as credenciais para Produção.

## Implantação manual

O `super_admin` pode acessar `Barbearias → Nova barbearia` para criar um tenant
sem chamar o Asaas. O fluxo usa os preços e módulos do catálogo, ativa a
assinatura com origem `manual` e envia o convite ao administrador da unidade.
A cobrança deve ser criada e acompanhada separadamente até que a assinatura
seja vinculada ao gateway.
