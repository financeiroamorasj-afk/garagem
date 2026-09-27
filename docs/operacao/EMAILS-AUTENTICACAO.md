# E-mails de acesso do Garagem System

## Padrão adotado

- Remetente visível: `Garagem System <systemgaragem@gmail.com>`
- Assunto do convite: `Seu acesso ao Garagem System`
- Assunto da recuperação: `Redefina sua senha do Garagem System`
- Template versionado: `supabase/templates/invite.html`
- Destino do botão: convite seguro do Supabase para `/definir-senha`

O fluxo de cadastro de barbeiro e recepção continua usando `inviteUserByEmail`. O SMTP e o template são responsabilidades do Supabase Auth; nenhuma senha de e-mail deve ser adicionada ao repositório, a variáveis do frontend ou a uma Edge Function.

## Configuração de produção no Supabase

No projeto **Garagem System**, abrir **Authentication > SMTP Settings** e habilitar o SMTP personalizado:

| Campo | Valor |
| --- | --- |
| Sender email | `systemgaragem@gmail.com` |
| Sender name | `Garagem System` |
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `systemgaragem@gmail.com` |
| Password | senha de aplicativo do Google, com 16 caracteres |

A senha de aplicativo exige verificação em duas etapas na conta Google. Ela deve ser colada apenas no painel do Supabase.

Depois, abrir **Authentication > Email Templates > Invite user**:

1. Usar o assunto `Seu acesso ao Garagem System`.
2. Copiar integralmente o conteúdo de `supabase/templates/invite.html`.
3. Salvar o template.

Em **Authentication > Email Templates > Reset password**:

1. Usar o assunto `Redefina sua senha do Garagem System`.
2. Copiar integralmente o conteúdo de `supabase/templates/recovery.html`.
3. Salvar o template.

Em **Authentication > URL Configuration**, confirmar:

- Site URL: `https://app.garagemsystem.com.br`
- Redirect URL permitida: `https://app.garagemsystem.com.br/definir-senha`

## Teste de aceitação

1. Criar um barbeiro com um e-mail ainda não cadastrado.
2. Confirmar que o remetente aparece como `Garagem System <systemgaragem@gmail.com>`.
3. Confirmar o assunto e o layout escuro com a marca Garagem.
4. Clicar em **Criar minha senha**.
5. Definir a senha e validar o redirecionamento para o espaço do barbeiro.
6. Repetir em Gmail e Outlook e verificar também a caixa de spam.

Convites criados antes da ativação do SMTP e do template não mudam retroativamente. Para um barbeiro ainda não confirmado, use **Barbeiros > Reenviar convite** depois de configurar o SMTP. Usuários que já confirmaram o acesso continuam entrando com a própria senha e não recebem outro convite.
