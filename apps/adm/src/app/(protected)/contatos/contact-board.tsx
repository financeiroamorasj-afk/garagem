"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AtSign, Clock3, List, MessageCircle, Rows3, Search } from "lucide-react";
import {
  ACTIVE_CONTACT_STAGES,
  CONTACT_ORIGINS,
  CONTACT_ORIGIN_LABELS,
  CONTACT_STAGE_LABELS,
  type CommercialContact,
  type ContactStage,
} from "@/lib/commercial-contact-model";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function followUpTone(contact: CommercialContact) {
  if (!contact.proxima_acao_em) return "none";
  const date = new Date(contact.proxima_acao_em);
  const now = new Date();
  const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(value);
  if (date < now && dateKey(date) !== dateKey(now)) return "overdue";
  if (dateKey(date) === dateKey(now)) return "today";
  return "future";
}

function ContactCard({ contact }: { contact: CommercialContact }) {
  const tone = followUpTone(contact);
  return <article className={`contact-card stage-${contact.etapa}`}>
    <div className="contact-card-heading">
      <div><Link href={`/contatos/${contact.id}`}>{contact.nome_barbearia}</Link><span>{[contact.nome_responsavel, contact.cidade, contact.uf].filter(Boolean).join(" · ") || "Responsável não informado"}</span></div>
      {contact.nao_contatar ? <span className="badge red">Não contatar</span> : null}
    </div>
    <div className="contact-card-meta">
      <span>{CONTACT_ORIGIN_LABELS[contact.origem]}</span>
      {contact.tags.length ? <span>{contact.tags.slice(0, 3).map((tag) => `#${tag}`).join(" ")}</span> : null}
    </div>
    <div className={`contact-next ${tone}`}>
      <Clock3 size={15} />
      <div><strong>{contact.proxima_acao ?? (contact.nao_contatar ? "Abordagem bloqueada" : "Sem próxima ação")}</strong>{contact.proxima_acao_em ? <span>{dateTime.format(new Date(contact.proxima_acao_em))}</span> : null}</div>
    </div>
    <div className="contact-card-actions">
      {contact.telefone_normalizado ? <a href={`https://wa.me/${contact.telefone_normalizado}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a> : null}
      {contact.instagram_normalizado ? <a href={`https://instagram.com/${contact.instagram_normalizado}`} target="_blank" rel="noreferrer"><AtSign size={15} /> Instagram</a> : null}
      <Link href={`/contatos/${contact.id}`}>Abrir registro →</Link>
    </div>
  </article>;
}

export function ContactBoard({ contacts }: { contacts: CommercialContact[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ContactStage | "todos">("todos");
  const [origin, setOrigin] = useState("todos");
  const [view, setView] = useState<"funil" | "lista">("funil");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      const searchable = [contact.nome_barbearia, contact.nome_responsavel, contact.telefone, contact.instagram, contact.cidade, contact.uf].filter(Boolean).join(" ").toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (stage === "todos" || contact.etapa === stage)
        && (origin === "todos" || contact.origem === origin);
    });
  }, [contacts, origin, query, stage]);

  const outcomeContacts = filtered.filter((contact) => ["convertido", "perdido"].includes(contact.etapa));

  return <>
    <section className="contact-toolbar" aria-label="Filtros do funil">
      <label className="contact-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar barbearia, responsável, telefone…" /></label>
      <select aria-label="Filtrar por etapa" value={stage} onChange={(event) => setStage(event.target.value as ContactStage | "todos")}><option value="todos">Todas as etapas</option>{Object.entries(CONTACT_STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filtrar por origem" value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="todos">Todas as origens</option>{CONTACT_ORIGINS.map((value) => <option key={value} value={value}>{CONTACT_ORIGIN_LABELS[value]}</option>)}</select>
      <div className="view-toggle" aria-label="Formato de visualização"><button type="button" className={view === "funil" ? "active" : ""} onClick={() => setView("funil")}><Rows3 size={16} /> Funil</button><button type="button" className={view === "lista" ? "active" : ""} onClick={() => setView("lista")}><List size={16} /> Lista</button></div>
    </section>

    {view === "funil" ? <div className="contact-board">
      {ACTIVE_CONTACT_STAGES.map((columnStage) => {
        const stageContacts = filtered.filter((contact) => contact.etapa === columnStage);
        return <section className="contact-column" key={columnStage}><header><span>{CONTACT_STAGE_LABELS[columnStage]}</span><strong>{stageContacts.length}</strong></header><div className="contact-column-cards">{stageContacts.map((contact) => <ContactCard key={contact.id} contact={contact} />)}{!stageContacts.length ? <div className="contact-column-empty">Nenhum contato</div> : null}</div></section>;
      })}
    </div> : <section className="contact-list panel">
      {filtered.length ? filtered.map((contact) => <ContactCard key={contact.id} contact={contact} />) : <div className="empty">Nenhum contato corresponde aos filtros.</div>}
    </section>}

    {view === "funil" && outcomeContacts.length ? <section className="panel contact-outcomes"><div className="panel-heading"><h2>Encerrados</h2><span className="panel-link">{outcomeContacts.length} registro(s) filtrado(s)</span></div><div className="contact-list">{outcomeContacts.map((contact) => <ContactCard key={contact.id} contact={contact} />)}</div></section> : null}
  </>;
}
