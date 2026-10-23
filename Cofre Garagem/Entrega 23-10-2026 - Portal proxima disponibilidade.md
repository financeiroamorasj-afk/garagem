# Entrega — próxima disponibilidade explícita no Portal

Data: 23/10/2026

## Objetivo

Evitar que o cliente confunda a primeira data futura exibida pelo Portal com um horário para o mesmo dia. Quando não existe horário disponível hoje, a interface passa a informar a indisponibilidade e a próxima data aberta antes de apresentar os horários.

## Implementação

- A busca continua usando o motor real de disponibilidade e consultando os próximos 14 dias.
- Quando a busca começa em hoje e o primeiro horário retornado pertence a uma data futura, o Portal mostra um aviso específico antes da lista.
- Para um profissional escolhido, o aviso usa o nome dele e informa que não há horários disponíveis hoje.
- Em **Primeiro disponível**, o aviso informa que nenhum profissional possui horário disponível hoje.
- A primeira data futura recebe o rótulo **PRÓXIMA DATA DISPONÍVEL** e a data completa por extenso.
- O cliente pode acionar **Ver outro barbeiro disponível hoje** para buscar toda a equipe imediatamente.
- Horários do dia corrente recebem o rótulo **HOJE**.
- A confirmação de datas futuras mostra **ESTE AGENDAMENTO NÃO É PARA HOJE**, dá destaque à data completa e usa no botão o formato **Confirmar para DD/MM às HH:MM**.
- Trocar serviço, barbeiro ou data limpa corretamente o estado da busca anterior.

## Validação antes da publicação

- Teste direcionado do Portal do Cliente aprovado.
- ESLint aprovado.
- Build de produção aprovado, permanecendo apenas o aviso conhecido sobre tamanho do bundle.
- A suíte completa teve 133 testes aprovados; os testes de integração que dependem do Supabase local não executaram porque o PostgreSQL local em `127.0.0.1:54422` estava indisponível. Essa entrega não altera o motor de disponibilidade nem o schema operacional.
- Previews dos projetos `garagem-app` e `garagem-adm` concluídos com sucesso.

## Publicação do frontend

- PR: `#84 — Portal: destaca próxima data disponível`.
- Commit da implementação: `f75fe86c2a3efefebcb0fa60380fa8986a9f04b9`.
- Commit de merge na `main`: `a0c06d0f22eaf42d7bf1e8a2c9e46cfe6781b2f8`.
- Merge concluído em 23/10/2026 às 09:58, no horário de Brasília.
- Deploy de produção do `garagem-app`: `Bp8FfaXMxetHNhquFBTT2DR2sGjG`.
- Deploy de produção do `garagem-adm`: `F4aHYmbzuTSnTkfwvozVaMPGvdCY`.
- O domínio oficial respondeu com HTTP 200.
- O bundle `index-BGhZF2m7.js` contém **não tem horários disponíveis hoje**, **PRÓXIMA DATA DISPONÍVEL** e **ESTE AGENDAMENTO NÃO É PARA HOJE**.

## Comunicado dentro dos aplicativos

- Migration: `20261023130000_portal_proxima_disponibilidade_comunicado.sql`.
- A migration foi aplicada somente depois da validação do frontend oficial.
- A versão `20261023130000` foi registrada em `supabase_migrations.schema_migrations` com o nome `portal_proxima_disponibilidade_comunicado`.
- Comunicado: **Portal destaca a próxima data disponível**.
- Público: gestão e barbeiros.
- Rotas: `/admin/configuracoes` e `/barber/dashboard`.
- Publicado em 23/10/2026 às 10:02:01, no horário de Brasília.
- A leitura posterior confirmou `ativo = true`, público `ambos`, rotas corretas e a migration registrada.

## Resultado

Publicação concluída. O Portal deixa explícito quando não há horário hoje, identifica a próxima data disponível e repete a data futura no momento de maior risco de erro: a confirmação final.
