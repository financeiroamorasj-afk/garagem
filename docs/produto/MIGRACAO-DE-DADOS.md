# Migração de dados — projeto de ponta a ponta

Status: projetado para execução incremental  
Versão do contrato de importação: `garagem-migracao-v1`  
Template: `outputs/migracao-dados-20260927/template-migracao-garagem-v1.xlsx`

## 1. Objetivo

Permitir que uma barbearia que já opera em outro sistema comece no Garagem sem recadastrar manualmente sua base. A migração precisa ser previsível, auditável, idempotente, isolada por barbearia e reversível enquanto os dados importados ainda não tiverem sido usados na operação.

O produto terá dois caminhos:

1. **Autosserviço:** até 5.000 clientes e 5.000 agendamentos futuros por arquivo, usando o template oficial.
2. **Migração assistida:** grandes volumes, históricos complexos, fotos/documentos ou formatos exportados por sistemas de terceiros.

## 2. Escopo por onda

### Onda 1 — autosserviço do MVP

- clientes;
- profissionais e usuários de recepção, sem senha;
- serviços;
- produtos e saldo inicial de estoque;
- jornadas semanais;
- bloqueios futuros;
- materiais e materiais por serviço;
- agenda futura nos estados `pendente` ou `confirmado`;
- convite de acesso da equipe depois da importação.

### Onda 2 — migração assistida

- histórico de atendimentos e cortes;
- fotos e documentos;
- histórico de estoque;
- arquivos maiores que os limites do autosserviço;
- mapeadores para exportações de sistemas terceiros;
- clientes sem identificador confiável ou com duplicidades extensas.

### Fora do escopo da planilha

- senhas, hashes de senha, sessões e tokens;
- dados de cartão ou credenciais de gateway;
- saldos bancários, contas, títulos e pagamentos concluídos;
- IDs internos de autenticação de outro sistema;
- logs de auditoria do sistema anterior;
- arquivos com macros, fórmulas ou links externos.

O financeiro legado permanece congelado. Uma futura migração financeira deverá ter reconciliação contábil própria e não será acoplada ao importador operacional.

## 3. Experiência no produto

Entrada: `Configurações > Migração de dados`.

Fluxo em sete etapas:

1. **Preparar:** selecionar “template genérico” ou um formato assistido e baixar o arquivo versionado.
2. **Enviar:** upload privado de `.xlsx`, com checksum, limite de tamanho e rejeição de macros.
3. **Validar:** parser grava somente em staging e apresenta progresso por aba.
4. **Resolver:** usuário corrige erros, decide duplicidades e escolhe a ação de cada conflito.
5. **Revisar:** resumo final de criar, atualizar, ignorar e impedir.
6. **Importar:** confirmação explícita e processamento em lotes idempotentes.
7. **Finalizar:** relatório, reconciliação, convites de acesso e prazo de reversão.

A interface deve mostrar um stepper, progresso persistente e permitir sair da tela sem perder o trabalho. Falhas devem ser retomáveis a partir do último lote confirmado.

## 4. Contrato do template

Os nomes das abas e cabeçalhos fazem parte do contrato `garagem-migracao-v1`. O importador deve recusar versões desconhecidas e oferecer o download da versão atual.

Cada entidade usa `codigo_externo`, único dentro daquela aba e daquele trabalho de importação. Referências terminadas em `_codigo` apontam para esse código, não para UUIDs do Garagem.

Ordem lógica das dependências:

1. profissionais e usuários de recepção;
2. clientes;
3. serviços;
4. produtos e movimento de saldo inicial;
5. materiais;
6. materiais por serviço;
7. jornadas;
8. bloqueios;
9. agenda futura;
10. convites de acesso.

O `barbearia_id` nunca vem da planilha. Ele é derivado no servidor a partir do usuário autenticado.

## 5. Validações

### Arquivo

- aceitar somente `.xlsx` sem VBA;
- rejeitar `.xlsm`, `.xls`, arquivos protegidos por senha e links externos;
- conferir MIME real, assinatura ZIP, tamanho descompactado e quantidade de células;
- rejeitar fórmulas em qualquer célula de dados;
- normalizar cabeçalhos sem aceitar substituições silenciosas;
- calcular SHA-256 para detectar reenvio do mesmo arquivo.

### Linha

- campos obrigatórios, tipos, limites e formatos;
- unicidade de `codigo_externo` na aba;
- referências cruzadas existentes;
- percentuais entre 0 e 100;
- preços e quantidades não negativos;
- duração entre 5 e 480 minutos;
- intervalos coerentes com a jornada;
- bloqueio com fim posterior ao início;
- agenda futura, serviço ativo, jornada válida e ausência de conflito.

### Duplicidades contra produção

- cliente: CPF protegido exato; depois telefone normalizado; por fim nome + telefone;
- profissional: e-mail de acesso exato; depois telefone;
- serviço: nome normalizado;
- produto: SKU exato; se ausente, nome normalizado;
- agendamento: `codigo_externo` + hash de profissional, cliente, serviço e início.

Correspondências ambíguas nunca são decididas automaticamente.

## 6. Estratégias de conflito

Padrão seguro: **criar sem sobrescrever**.

Por entidade, o administrador poderá escolher:

- criar apenas registros novos;
- preencher apenas campos vazios do registro existente;
- atualizar campos selecionados;
- ignorar a linha;
- vincular manualmente a um registro existente.

Alterações de nome, telefone, preço, comissão ou jornada devem aparecer na prévia lado a lado. Campos sensíveis e vínculos nunca são substituídos silenciosamente.

## 7. Modelo de dados da importação

### `importacoes`

- `id uuid`;
- `barbearia_id uuid not null`;
- `status text`: `rascunho`, `enviado`, `validando`, `requer_acao`, `pronto`, `importando`, `concluido`, `falhou`, `revertido`, `expirado`;
- `template_version text`;
- `arquivo_path text` privado;
- `arquivo_sha256 text`;
- `modo text`: `autosservico` ou `assistido`;
- `resumo jsonb` com totais por entidade e ação;
- `criado_por uuid`;
- `created_at`, `updated_at`, `confirmed_at`, `completed_at`;
- `rollback_until timestamptz`.

### `importacao_linhas`

- `id`, `importacao_id`, `aba`, `numero_linha`;
- `tipo_entidade`, `codigo_externo`;
- `raw_json`, `normalizado_json`;
- `status`: `valida`, `erro`, `conflito`, `ignorada`, `aplicada`;
- `acao`: `criar`, `mesclar`, `atualizar`, `vincular`, `ignorar`;
- `erros jsonb`, `avisos jsonb`;
- `target_id uuid` depois da vinculação.

### `importacao_vinculos`

Mapeia `importacao_id + tipo_entidade + codigo_externo` para o UUID real. A combinação deve ser única e é a base da idempotência e das referências entre abas.

### `importacao_eventos`

Log append-only com estado anterior, estado novo, ator, lote, contagens e erro técnico sanitizado.

RLS deve limitar leitura e ação ao administrador/master da própria barbearia. O worker usa `service_role` somente no servidor.

## 8. Processamento

1. O frontend cria `importacoes` por RPC.
2. O backend entrega uma URL assinada curta para o bucket privado `migracoes`.
3. O arquivo é validado estruturalmente e convertido em staging.
4. Um worker processa lotes de até 500 linhas e atualiza heartbeat/progresso.
5. As referências são resolvidas por `importacao_vinculos`.
6. A prévia é congelada com hash e exige nova validação se o arquivo ou as decisões mudarem.
7. A confirmação cria uma chave de idempotência por linha.
8. Cada lote roda em transação; uma falha não repete lotes já confirmados.
9. O encerramento executa consultas de reconciliação e só então marca `concluido`.

Para o MVP, o worker pode ser uma Edge Function acionada em lotes curtos e reentrantes. A fila pode ser uma tabela Postgres com `FOR UPDATE SKIP LOCKED`, evitando dependência externa. Volumes assistidos usam o mesmo pipeline com limites ampliados.

## 9. Escrita no domínio

O importador não deve inserir diretamente por meio do navegador. A aplicação final usa RPCs/serviço protegido que preservam as regras atuais.

- clientes: CPF é normalizado, convertido em hash/últimos dígitos e o valor integral não é persistido;
- produtos: `estoque_atual` gera movimento auditável de `saldo_inicial`;
- agenda: usa a mesma validação de disponibilidade do fluxo normal;
- profissionais e recepção: são criados sem vínculo de autenticação; convites são uma etapa posterior;
- comissões vazias preservam herança das regras existentes;
- snapshots de duração e valor do agendamento são calculados no servidor.

## 10. Idempotência e reversão

Cada linha recebe a chave:

`importacao_id + tipo_entidade + codigo_externo + hash_normalizado`.

Reprocessar o mesmo lote deve retornar o resultado anterior. Reenviar o mesmo arquivo cria uma nova revisão do trabalho, mas a prévia identifica que o conteúdo já foi importado.

A reversão fica disponível por 7 dias, desde que os registros importados ainda não tenham sido usados por vendas, atendimentos, pagamentos ou edições manuais. Ela ocorre em ordem inversa de dependência. Se houver uso posterior, a reversão é bloqueada e gera um roteiro de limpeza assistida.

Antes da confirmação, staging pode ser descartado sem efeito no sistema real.

## 11. Segurança e LGPD

- bucket privado com URL assinada curta;
- criptografia em trânsito e repouso da plataforma;
- tenant sempre derivado no servidor;
- nenhum segredo no frontend;
- proteção contra ZIP bomb e planilha excessiva;
- prevenção de CSV/Excel injection nos relatórios exportados;
- logs sem CPF, telefone completo ou conteúdo cru da linha;
- arquivo original excluído 7 dias após conclusão/reversão;
- staging purgado em 30 dias;
- trabalhos abandonados expiram em 30 dias;
- ação administrativa auditada e protegida contra CSRF/replay;
- suporte vê metadados e erros mascarados por padrão.

## 12. Relatórios e observabilidade

O encerramento produz:

- resumo por entidade e ação;
- arquivo de erros com aba, linha, campo, código e orientação;
- lista de conflitos resolvidos;
- registros criados/atualizados/ignorados;
- convites pendentes;
- reconciliação entre contagem de staging e produção.

Métricas mínimas: duração, linhas por minuto, taxa de erro, conflitos, reprocessamentos, falhas por regra, reversões e convites concluídos.

Alertas: job sem heartbeat, diferença de reconciliação, repetição de falha técnica e tentativa de acesso entre tenants.

## 13. Testes obrigatórios

- parser e normalizador por aba;
- cabeçalhos/versionamento;
- fórmulas, macros, links e payloads maliciosos;
- RLS e isolamento entre barbearias;
- duplicidade e resolução ambígua;
- referências cruzadas;
- idempotência de linha, lote e trabalho;
- concorrência entre duas importações;
- falha no meio do lote e retomada;
- agenda conflitante, fora da jornada e em bloqueio;
- CPF protegido e descarte do valor integral;
- saldo inicial com movimento auditável;
- reversão permitida e reversão bloqueada por uso posterior;
- desempenho com 5.000 clientes e 5.000 agendamentos;
- relatório sem fórmula injetável.

## 14. Plano de execução

### Fase A — fundação

- congelar o contrato v1 e publicar o template;
- criar migrations de staging, vínculos, eventos, RLS e bucket;
- implementar upload privado e parser seguro;
- validar profissionais, clientes, serviços e produtos.

### Fase B — operação mínima

- tela de prévia e conflitos;
- importação idempotente;
- saldo inicial de estoque;
- jornadas e bloqueios;
- relatório e purga.

### Fase C — agenda e acesso

- agenda futura com validação de disponibilidade;
- convites em lote usando o fluxo de e-mail já existente;
- reversão e reconciliação completas.

### Fase D — escala

- mapeador visual de colunas;
- presets por sistema de origem;
- histórico de cortes, fotos e grandes volumes;
- visão de acompanhamento no ADM do Garagem.

## 15. Critérios de aceite do MVP

- um administrador baixa, preenche, envia e conclui a migração sem suporte;
- nenhuma linha chega à produção antes da confirmação;
- erros apontam aba, linha, campo e correção;
- reprocessamento não duplica dados;
- nenhum dado cru de CPF é persistido;
- estoque inicial é auditável;
- agenda importada respeita disponibilidade;
- usuários recebem convite separado, sem senha migrada;
- todas as escritas ficam restritas à barbearia autenticada;
- reconciliação fecha sem diferença;
- arquivo e staging são purgados conforme retenção;
- rollback seguro funciona dentro da janela definida.
