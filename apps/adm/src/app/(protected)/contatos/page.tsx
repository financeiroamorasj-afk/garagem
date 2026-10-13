import Link from "next/link";
import { commercialContactBoard } from "@/lib/commercial-contacts";
import { ContactBoard } from "./contact-board";

export default async function ContactsPage() {
  const data = await commercialContactBoard();
  return <>
    <header className="page-header"><div><div className="eyebrow">Prospecção direta</div><h1 className="page-title">Contatos</h1><p className="page-description">Acompanhe abordagens por WhatsApp e Instagram sem misturar prospects com barbearias já provisionadas.</p></div><Link className="button-link" href="/contatos/novo">Novo contato</Link></header>
    <section className="metrics contact-metrics" aria-label="Indicadores comerciais">
      <article className="metric"><span className="metric-label">Ativos</span><strong className="metric-value">{data.metrics.active}</strong><span className="metric-detail">em acompanhamento</span></article>
      <article className="metric"><span className="metric-label">Sem abordagem</span><strong className="metric-value">{data.metrics.waitingFirstContact}</strong><span className="metric-detail">na etapa novo</span></article>
      <article className="metric metric-alert"><span className="metric-label">Vencidos</span><strong className="metric-value">{data.metrics.overdue}</strong><span className="metric-detail">precisam de retorno</span></article>
      <article className="metric"><span className="metric-label">Hoje</span><strong className="metric-value">{data.metrics.today}</strong><span className="metric-detail">ações programadas</span></article>
      <article className="metric"><span className="metric-label">Respostas</span><strong className="metric-value">{data.metrics.responses}</strong><span className="metric-detail">interações registradas</span></article>
      <article className="metric"><span className="metric-label">Conversões</span><strong className="metric-value">{data.metrics.converted}</strong><span className="metric-detail">vinculadas à plataforma</span></article>
    </section>
    <ContactBoard contacts={data.contacts} />
  </>;
}
