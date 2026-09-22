# Backlog MVP — atendimento, histórico de corte e experiência mobile

> Registro de produto em 26/08/2026. Este documento organiza frentes futuras; não autoriza migrations, armazenamento, uploads ou alterações de produção.

## Frente 1 — Histórico de corte do cliente

### Objetivo

Permitir que o barbeiro registre rapidamente como o atendimento foi realizado e consulte o último corte antes de iniciar um retorno do cliente.

### Fluxo desejado

1. Ao concluir ou consultar um atendimento, o barbeiro encontra o **último registro ativo de corte** do cliente.
2. O sistema mostra foto, atributos principais e observações.
3. O barbeiro pergunta se o cliente quer repetir o corte.
4. Se sim, usa o registro como referência, sem criar uma cópia desnecessária.
5. Se não, registra o novo corte e o novo registro passa a ser o ativo.

### Campos propostos

Usar seletores para itens repetitivos e campos livres somente onde agregam contexto:

- tipo/estilo do corte;
- pente principal e pentes auxiliares;
- acabamento (degradê, navalha, máquina, tesoura etc.);
- barba e acabamento de barba, quando aplicável;
- comprimento/observações técnicas;
- preferências do cliente e restrições relevantes;
- notas livres do barbeiro;
- uma ou mais fotos vinculadas ao registro, conforme política aprovada;
- barbeiro responsável, data e referência ao atendimento.

### Regra de histórico e “lixeira”

Não excluir imediatamente o registro anterior apenas para reduzir banco: isso perde referência útil e não reduz o armazenamento de forma confiável enquanto a lixeira existir.

Proposta para decisão futura:

- manter um único **registro ativo** por cliente;
- ao criar um novo estilo, arquivar o anterior e manter seus metadados mínimos para consulta/histórico;
- mover fotos antigas para lixeira lógica e remover objeto + referência após prazo de retenção aprovado;
- permitir restauração dentro do prazo;
- registrar quem criou, alterou ou removeu o registro.

Decisões pendentes: quantidade máxima de fotos por registro, prazo de retenção de fotos ativas, prazo de lixeira e se o cliente pode solicitar remoção antecipada.

## Frente 2 — Fotos, Storage e privacidade

### Requisitos

- fotos ficam em Storage; o banco guarda apenas metadados e referência do objeto, nunca o arquivo binário;
- bucket privado, segregado por barbearia/cliente/registro;
- políticas de acesso por usuário autenticado, barbeiro autorizado e tenant; nunca URL pública permanente;
- URLs assinadas de curta duração para visualização;
- compactação antes do upload: redimensionamento, qualidade controlada, remoção de metadados EXIF/localização e limite de tamanho;
- bloquear formatos, dimensões e arquivos acima do limite antes do envio;
- criação e remoção do objeto devem manter consistência com o registro no banco;
- limpeza automática por política de retenção/rotina controlada, com logs e modo seguro contra remoção entre tenants.

### Decisões técnicas futuras

- formato preferencial (WebP/AVIF/JPEG compatível);
- dimensões máximas e tamanho máximo por foto;
- quantidade máxima por registro;
- prazo ativo e prazo na lixeira;
- mecanismo de limpeza agendada e auditoria;
- consentimento/aviso de privacidade para fotos de clientes.

## Frente 3 — Experiência de aplicativo no mobile

### Direção

O mobile não será apenas o desktop reduzido. A experiência deve ser projetada como aplicativo, priorizando tarefas rápidas do barbeiro: agenda do dia, chegada do cliente, histórico do corte, registro rápido e fechamento.

### Escopo futuro de PWA/app-like

- navegação mobile própria, com ações prioritárias ao alcance do polegar;
- instalação como app: manifesto, ícones, tema e tela de abertura;
- estratégia de cache explícita e limitada; nunca cachear dados financeiros ou fotos privadas sem regra de segurança;
- comportamento offline definido por fluxo: consulta recente, fila de envio ou bloqueio claro quando conexão for obrigatória;
- feedback de sincronização, erro e reenvio idempotente;
- câmera/galeria para foto do corte com permissão explicada;
- acessibilidade, áreas de toque, teclado e contraste para uso em atendimento;
- validação em dispositivos e larguras reais, não somente responsividade visual.

## Ordem recomendada após Financeiro

1. Diagnóstico do schema operacional de clientes, agendamentos, serviços e barbeiros.
2. Contrato de registro de corte e histórico, sem fotos ainda.
3. Interface local de registro e consulta do último corte.
4. Contrato privado de Storage, compactação e retenção de fotos.
5. Upload de fotos em localhost e auditoria de políticas.
6. Fundação PWA/mobile, separada da responsividade comum.
