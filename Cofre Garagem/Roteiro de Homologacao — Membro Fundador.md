# Roteiro de Homologação — Membro Fundador

> Criado em 26/09/2026. Este roteiro valida o menor ciclo real que precisa funcionar antes do início do ADM de assinaturas.

## Preparação da unidade

- [ ] Administrador consegue entrar e enxerga somente a própria barbearia.
- [ ] Existe ao menos um barbeiro ativo, vinculado ao próprio usuário.
- [ ] Jornada e intervalo do barbeiro estão configurados.
- [ ] Existe um serviço ativo com preço, duração e comissão.
- [ ] Existe um produto ativo com custo, preço, estoque e comissão.
- [ ] Existe uma conta financeira principal e categorias para serviços e produtos.
- [ ] A chave PIX da barbearia está cadastrada.

## Jornada principal — cliente até o financeiro

1. [ ] Cliente abre `/portal/:slug` no celular.
2. [ ] Cliente novo informa CPF, nome e WhatsApp e recebe uma sessão protegida.
3. [ ] Cliente escolhe serviço, barbeiro e horário disponível.
4. [ ] O mesmo horário não pode ser reservado novamente.
5. [ ] O dono recebe o aviso de novo agendamento sem recarregar a página.
6. [ ] O barbeiro recebe o aviso somente quando o horário pertence a ele.
7. [ ] O horário aparece na agenda do dono e na agenda do barbeiro.
8. [ ] O barbeiro inicia o atendimento.
9. [ ] O barbeiro registra a memória do corte e, se necessário, adiciona produto.
10. [ ] No pagamento por PIX, o sistema exibe o QR Code com o valor correto.
11. [ ] O operador confere o comprovante e conclui manualmente o pagamento.
12. [ ] O atendimento fica concluído e pago.
13. [ ] O estoque baixa uma única vez.
14. [ ] As comissões de serviço e produto são calculadas uma única vez.
15. [ ] O financeiro registra as entradas de serviço e produto uma única vez.
16. [ ] O último corte fica disponível na próxima visita do cliente.

## Variação com recepção

- [ ] Com o módulo ativo, o barbeiro envia o atendimento para a recepção sem movimentar estoque ou financeiro.
- [ ] A recepção pode conferir e complementar o carrinho.
- [ ] Somente a cobrança final movimenta estoque, comissão e financeiro.
- [ ] Dois operadores não conseguem cobrar o mesmo atendimento.
- [ ] A devolução ao barbeiro não gera movimentação financeira.
- [ ] O estorno recompõe estoque e preserva o histórico de auditoria.

## Recuperação e continuidade

- [ ] Reabrir a aba atualiza as agendas mesmo se o navegador suspendeu o Realtime.
- [ ] Erros de conexão oferecem tentativa novamente sem duplicar operações.
- [ ] Convite de equipe chega com a identidade do Garagem.
- [ ] Usuário confirmado consegue solicitar recuperação de senha.
- [ ] Usuário desativado não consegue entrar.

## Validação automatizada existente

O teste `tests/jornada-fundador-integracao-local.test.js` cobre em uma única execução:

- cadastro protegido pelo portal;
- criação real do agendamento;
- leitura pela agenda administrativa;
- leitura e início pelo barbeiro correto;
- checkout manual por PIX;
- conclusão e pagamento do atendimento;
- baixa de estoque;
- cálculo de comissão;
- criação da memória de corte;
- lançamentos financeiros de serviço e produto.

O teste automatizado reduz regressões, mas não substitui a homologação em aparelho real, a conferência visual do QR Code e o recebimento efetivo dos e-mails.

