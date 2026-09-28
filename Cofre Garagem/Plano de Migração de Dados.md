# Plano de Migração de Dados

Data da decisão: 27/09/2026  
Status: projeto fechado; implementação ainda não iniciada

## Por que existe

Barbearias maiores ou já atendidas por outro sistema precisam entrar no Garagem sem recadastro manual. A migração será parte do produto, não uma operação improvisada no banco.

## Decisões congeladas

- haverá template oficial Excel versionado;
- autosserviço cobre dados operacionais, profissionais, recepção e agenda futura;
- senhas nunca serão migradas; a equipe será convidada depois;
- financeiro histórico, fotos e histórico de cortes entram em migração assistida;
- o arquivo sempre passa por staging, validação, prévia e confirmação;
- o tenant é definido pelo servidor, nunca pela planilha;
- importações serão idempotentes, auditáveis e reversíveis enquanto os dados ainda não tiverem sido usados;
- CPF integral não será persistido;
- saldo inicial de estoque será um movimento auditável;
- o MVP aceita até 5.000 clientes e 5.000 agendamentos futuros por arquivo.

## Entregáveis deste projeto

- `docs/produto/MIGRACAO-DE-DADOS.md`: arquitetura e experiência ponta a ponta;
- `outputs/migracao-dados-20260927/template-migracao-garagem-v1.xlsx`: template preenchível.

## Ordem recomendada

1. fundação de staging, RLS, bucket privado e parser;
2. profissionais, clientes, serviços e produtos;
3. prévia, conflitos, idempotência e relatório;
4. jornadas, bloqueios e estoque inicial;
5. agenda futura;
6. convites em lote;
7. reversão e purga;
8. formatos assistidos e presets de sistemas terceiros.
