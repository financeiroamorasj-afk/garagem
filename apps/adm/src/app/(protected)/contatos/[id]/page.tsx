import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, Clock3, MessageCircle, Store } from "lucide-react";
import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_INTERACTION_TYPE_LABELS,
  CONTACT_ORIGIN_LABELS,
  CONTACT_STAGE_LABELS,
} from "@/lib/commercial-contact-model";
import { commercialContactDetail } from "@/lib/commercial-contacts";
import { ContactEditor } from "../contact-form";
import { ConversionForm } from "../conversion-form";
import { InteractionForm } from "../interaction-form";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await commercialContactDetail(id);
  if (!data.contact) notFound();
  const contact = data.contact;

  return <>
    <header className="page-header contact-detail-header">
      <div><div className="eyebrow">Contato comercial</div><h1 className="page-title">{contact.nome_barbearia}</h1><p className="page-description">{[contact.nome_responsavel, contact.cidade, contact.uf].filter(Boolean).join(" · ") || "Responsável e localização ainda não informados."}</p></div>
      <div className="page-header-actions"><Link className="secondary-button" href="/contatos">Voltar ao funil</Link>{contact.telefone_normalizado ? <a className="button-link contact-channel-button" href={`https://wa.me/${contact.telefone_normalizado}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Abrir WhatsApp</a> : null}{contact.instagram_normalizado ? <a className="secondary-button contact-channel-button" href={`https://instagram.com/${contact.instagram_normalizado}`} target="_blank" rel="noreferrer"><AtSign size={17} /> Instagram</a> : null}</div>
    </header>

    <section className="contact-summary-grid">
      <article className="contact-summary-card"><span className="metric-label">Etapa atual</span><strong><span className={`badge contact-stage-badge stage-${contact.etapa}`}>{CONTACT_STAGE_LABELS[contact.etapa]}</span></strong><small>{contact.motivo_perda ?? (contact.nao_contatar ? "Marcado como não contatar" : "Funil comercial")}</small></article>
      <article className="contact-summary-card"><span className="metric-label">Próxima ação</span><strong>{contact.proxima_acao ?? "Não programada"}</strong><small>{contact.proxima_acao_em ? dateTime.format(new Date(contact.proxima_acao_em)) : "Defina um retorno na próxima interação"}</small></article>
      <article className="contact-summary-card"><span className="metric-label">Origem</span><strong>{CONTACT_ORIGIN_LABELS[contact.origem]}</strong><small>Cadastrado em {dateTime.format(new Date(contact.created_at))}</small></article>
      <article className="contact-summary-card"><span className="metric-label">Última interação</span><strong>{contact.ultima_interacao_em ? dateTime.format(new Date(contact.ultima_interacao_em)) : "Nenhuma"}</strong><small>{data.interactions.length} registro(s) na linha do tempo</small></article>
    </section>

    <div className="contact-detail-grid">
      <div>
        <section className="panel contact-panel">
          <div className="panel-heading"><div><span className="eyebrow">Acompanhamento</span><h2>Registrar interação</h2></div><Clock3 size={20} /></div>
          <InteractionForm contactId={contact.id} currentStage={contact.etapa} />
        </section>

        <section className="panel contact-panel">
          <div className="panel-heading"><div><span className="eyebrow">Histórico</span><h2>Linha do tempo</h2></div><span className="panel-link">{data.interactions.length} interação(ões)</span></div>
          {data.interactions.length ? <ol className="contact-timeline">{data.interactions.map((interaction) => <li key={interaction.id}>
            <div className="timeline-marker" />
            <div className="timeline-entry"><div className="timeline-heading"><strong>{CONTACT_INTERACTION_TYPE_LABELS[interaction.tipo]}</strong><span>{dateTime.format(new Date(interaction.ocorrida_em))}</span></div><div className="timeline-meta">{CONTACT_CHANNEL_LABELS[interaction.canal]}{interaction.etapa_nova ? ` · ${CONTACT_STAGE_LABELS[interaction.etapa_anterior]} → ${CONTACT_STAGE_LABELS[interaction.etapa_nova]}` : ""}</div>{interaction.resumo ? <p>{interaction.resumo}</p> : null}{interaction.resultado ? <small>Resultado: {interaction.resultado}</small> : null}</div>
          </li>)}</ol> : <div className="empty">Nenhuma interação registrada. Abra o canal, faça a abordagem e registre o resultado aqui.</div>}
        </section>
      </div>

      <aside>
        <section className="panel contact-panel contact-data-panel">
          <div className="panel-heading"><div><span className="eyebrow">Cadastro</span><h2>Dados comerciais</h2></div></div>
          <dl className="contact-data-list"><div><dt>WhatsApp</dt><dd>{contact.telefone ?? "Não informado"}</dd></div><div><dt>Instagram</dt><dd>{contact.instagram ?? "Não informado"}</dd></div><div><dt>E-mail</dt><dd>{contact.email ?? "Não informado"}</dd></div><div><dt>Etiquetas</dt><dd>{contact.tags.length ? contact.tags.map((tag) => `#${tag}`).join(" ") : "Nenhuma"}</dd></div></dl>
          {contact.observacoes ? <p className="contact-notes">{contact.observacoes}</p> : null}
        </section>

        {contact.etapa === "convertido" ? <section className="panel contact-panel converted-panel"><div className="panel-heading"><div><span className="eyebrow">Conversão concluída</span><h2>Contratação vinculada</h2></div><Store size={20} /></div><dl className="contact-data-list"><div><dt>Barbearia</dt><dd>{contact.barbearia_id}</dd></div><div><dt>Checkout</dt><dd>{contact.checkout_id ?? "Não vinculado"}</dd></div><div><dt>Assinatura</dt><dd>{contact.assinatura_id ?? "Não vinculada"}</dd></div><div><dt>Convertido em</dt><dd>{contact.convertido_em ? dateTime.format(new Date(contact.convertido_em)) : "—"}</dd></div></dl></section> : <section className="panel contact-panel"><div className="panel-heading"><div><span className="eyebrow">Fechamento</span><h2>Converter contato</h2></div><Store size={20} /></div><ConversionForm contactId={contact.id} shops={data.shops} checkouts={data.checkouts} subscriptions={data.subscriptions} /></section>}
      </aside>
    </div>

    <details className="contact-editor-disclosure"><summary>Editar dados do contato</summary><div className="contact-editor-body"><ContactEditor contact={contact} /></div></details>
  </>;
}
