# Funil de Contatos Comerciais do Garagem

Data da proposta: 13/10/2026
Estado: Fase 1 implementada e publicada em produção em 13/10/2026

## Objetivo

Dar ao responsável comercial do Garagem System um lugar único no ADM da plataforma para registrar barbearias encontradas por pesquisa direta, iniciar conversas por WhatsApp ou Instagram e saber com clareza quem precisa de retorno.

O funil pertence ao ADM da plataforma, e não ao painel operacional de uma barbearia. Um contato comercial ainda não é uma barbearia provisionada, um cliente da barbearia, um checkout ou uma assinatura.

## Princípio do MVP

Cada contato precisa responder rapidamente a quatro perguntas:

1. Quem é a barbearia e como falar com ela?
2. Em que etapa da conversa ela está?
3. Qual foi a última interação?
4. Qual é a próxima ação e quando ela deve acontecer?

O cadastro deve ser rápido o suficiente para ser preenchido durante a pesquisa no Instagram ou antes de abrir uma conversa no WhatsApp.

## Etapas do funil

| Etapa | Significado | Próximo movimento esperado |
| --- | --- | --- |
| Novo | Encontrado, mas ainda não abordado | Fazer o primeiro contato |
| Contatado | Primeira mensagem enviada | Aguardar ou programar retorno |
| Respondeu | Houve resposta da barbearia | Entender necessidade e perfil |
| Qualificado | Há aderência e interesse real | Marcar demonstração ou apresentar oferta |
| Proposta | Oferta ou link de contratação enviado | Acompanhar decisão |
| Convertido | Contratação concluída | Vincular à barbearia e assinatura reais |
| Perdido | Não seguirá no momento | Registrar motivo e encerrar ou programar retomada |

`Perdido` é um desfecho, não uma coluna que exige trabalho diário. Contatos sem resposta continuam em `Contatado`, com tentativas registradas e uma próxima ação ou encerramento definido.

## Tela `Contatos`

Adicionar `Contatos` à navegação do ADM, entre `Visão geral` e `Barbearias`, inicialmente disponível apenas para `super_admin`.

### Visão principal

- indicadores: contatos ativos, retornos vencidos, retornos de hoje, respostas recebidas e conversões;
- filtros por etapa, canal, origem, cidade, responsável e período;
- busca por barbearia, pessoa, telefone ou Instagram;
- alternância entre visão em funil e visão em lista;
- botão `Novo contato` sempre visível.

Cada cartão do funil deve mostrar:

- nome da barbearia;
- cidade e estado, quando informados;
- nome do responsável, quando conhecido;
- canais disponíveis;
- data da última interação;
- próxima ação, com atraso destacado;
- etiquetas livres;
- ações rápidas `WhatsApp`, `Instagram` e `Registrar interação`.

### Cadastro rápido

Campos essenciais:

- nome da barbearia;
- WhatsApp ou perfil do Instagram — ao menos um obrigatório;
- cidade/UF;
- nome do responsável, se conhecido;
- origem: pesquisa no Instagram, pesquisa no Google/Maps, indicação, inbound ou outra;
- observação inicial;
- próxima ação e data/hora.

Campos automáticos:

- etapa inicial `Novo`;
- operador responsável;
- data de criação e atualização;
- telefone normalizado e usuário do Instagram normalizado para detectar duplicidade.

### Detalhe do contato

O detalhe deve abrir em página ou painel lateral e concentrar:

- dados comerciais editáveis;
- etapa atual e motivo de perda, quando aplicável;
- linha do tempo de interações;
- próxima ação;
- atalhos para abrir `wa.me` e o perfil do Instagram;
- ação `Converter`.

## Registro de interação

O sistema não precisa ler mensagens privadas no MVP. O operador abre o canal e registra o resultado manualmente.

Uma interação possui:

- canal: WhatsApp, Instagram, telefone, e-mail, reunião ou nota interna;
- tipo: primeira abordagem, retorno, resposta recebida, demonstração, proposta ou anotação;
- data e hora;
- resumo curto;
- resultado;
- operador responsável;
- nova etapa, quando houver mudança;
- próxima ação e data.

Ao registrar uma interação, a interface deve incentivar a definir a próxima ação. Isso evita contatos sem acompanhamento.

## Conversão sem duplicar dados

O botão `Converter` não deve criar um cadastro comercial paralelo.

Fluxo proposto:

1. o prospect chega a `Proposta`;
2. a contratação acontece pelo checkout ou pelo provisionamento manual já existente;
3. o contato é marcado como `Convertido`;
4. o registro recebe o `barbearia_id`, o `checkout_id` e/ou o `assinatura_id` correspondentes;
5. o histórico comercial permanece consultável no ADM.

Assim, `barbearias` continua sendo a identidade canônica de quem já entrou na plataforma.

## Modelo de dados proposto

### `saas_contatos_comerciais`

- `id uuid primary key`;
- `nome_barbearia text not null`;
- `nome_responsavel text`;
- `telefone text` e `telefone_normalizado text`;
- `instagram text` e `instagram_normalizado text`;
- `email text`;
- `cidade text`, `uf text`;
- `origem text`;
- `etapa text not null`;
- `responsavel_user_id uuid not null`;
- `proxima_acao text`, `proxima_acao_em timestamptz`;
- `ultima_interacao_em timestamptz`;
- `motivo_perda text`;
- `observacoes text`;
- `tags text[]`;
- `barbearia_id uuid`, `checkout_id uuid`, `assinatura_id uuid`;
- `convertido_em timestamptz`;
- `created_at`, `updated_at`.

Regras importantes:

- ao menos telefone ou Instagram deve existir;
- não permitir dois contatos ativos com o mesmo telefone normalizado;
- alertar, sem bloquear automaticamente, possível duplicidade por Instagram ou nome da barbearia;
- exigir motivo ao marcar como `Perdido`;
- exigir vínculo com a contratação real ao concluir a conversão, salvo migrações controladas.

### `saas_contatos_interacoes`

- `id uuid primary key`;
- `contato_id uuid not null`;
- `canal text not null`;
- `tipo text not null`;
- `resumo text`;
- `resultado text`;
- `etapa_anterior text`, `etapa_nova text`;
- `ocorrida_em timestamptz not null`;
- `autor_user_id uuid not null`;
- `created_at`.

O histórico deve ser somente de acréscimo. Correções relevantes precisam ficar auditáveis, sem apagar silenciosamente a atividade anterior.

## Indicadores úteis

O primeiro painel deve priorizar operação, não vaidade:

- contatos novos no período;
- contatos aguardando primeira abordagem;
- retornos vencidos e de hoje;
- taxa de resposta por canal;
- quantidade que chegou a `Qualificado` e `Proposta`;
- conversões por período e por origem;
- tempo médio entre cadastro, primeira abordagem e conversão;
- motivos de perda mais frequentes.

No começo, os números devem ser contagens simples derivadas dos registros. Não é necessário criar uma camada analítica separada.

## Segurança e privacidade

- manter as tabelas comerciais inacessíveis aos usuários das barbearias;
- fazer o acesso pelo servidor do ADM, seguindo o padrão das tabelas SaaS atuais;
- limitar o MVP ao `super_admin` até existir uma função comercial dedicada;
- registrar autoria e data das alterações importantes;
- guardar apenas dados necessários para a prospecção;
- permitir marcar `não contatar` e impedir novas tarefas comerciais para esse contato;
- não armazenar conteúdo integral de conversas privadas; registrar apenas resumos operacionais.

## Fora do MVP

- leitura ou envio automático de mensagens pelo WhatsApp ou Instagram;
- captura automática de leads por robôs;
- cadências automáticas e disparos em massa;
- integração com API oficial da Meta;
- pontuação automática de leads;
- múltiplos pipelines;
- metas e comissões de vendedores;
- importação em massa.

Esses itens só devem entrar depois que o uso manual revelar volume e padrões reais.

## Entrega sugerida

### Fase 1 — acompanhamento manual

- migration das duas tabelas, validações, índices e proteção;
- item `Contatos` no ADM;
- lista/funil, cadastro e edição;
- linha do tempo manual;
- atalhos de WhatsApp e Instagram;
- próxima ação com estados `hoje`, `futura` e `vencida`;
- conversão vinculada ao cadastro real;
- testes de acesso, duplicidade e transições.

### Fase 2 — gestão comercial

- papel `comercial` no ADM;
- atribuição de responsáveis;
- painel de conversão e desempenho por canal/origem;
- exportação controlada;
- retomada de contatos perdidos.

### Fase 3 — integrações

- avaliar APIs oficiais e consentimentos;
- automatizar apenas os pontos que se mostrarem repetitivos no uso real;
- preservar sempre a linha do tempo e a possibilidade de operação manual.

## Critério de sucesso do MVP

Ao abrir o ADM, o responsável deve conseguir identificar em menos de um minuto:

- quem ainda não recebeu a primeira abordagem;
- quem precisa de retorno hoje ou está atrasado;
- qual foi a última conversa com cada barbearia;
- quem avançou, quem foi perdido e por quê;
- quais contatos se transformaram em assinaturas reais.
