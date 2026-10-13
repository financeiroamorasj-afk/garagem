"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CONTACT_ORIGINS,
  CONTACT_ORIGIN_LABELS,
  type CommercialContact,
  type ContactActionState,
} from "@/lib/commercial-contact-model";
import { createContactAction, updateContactAction } from "./actions";

const initialState: ContactActionState = { ok: false, message: "" };

function SubmitButton({ create }: { create: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button contact-submit" type="submit" disabled={pending}>{pending ? "Salvando…" : create ? "Criar contato" : "Salvar alterações"}</button>;
}

function localDateTime(iso: string | null) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function ContactFields({ contact, doNotContact, setDoNotContact }: { contact?: CommercialContact; doNotContact: boolean; setDoNotContact: (checked: boolean) => void }) {
  return <>
    <section className="form-section">
      <div className="form-section-heading"><span>1</span><div><h2>Barbearia e responsável</h2><p>Registre o mínimo necessário para reconhecer o prospect durante a abordagem.</p></div></div>
      <div className="form-grid">
        <label className="field"><span className="label">Nome da barbearia</span><input name="nome_barbearia" required minLength={2} maxLength={120} defaultValue={contact?.nome_barbearia ?? ""} autoComplete="organization" /></label>
        <label className="field"><span className="label">Nome do responsável</span><input name="nome_responsavel" minLength={2} maxLength={120} defaultValue={contact?.nome_responsavel ?? ""} autoComplete="name" /></label>
        <label className="field"><span className="label">Cidade</span><input name="cidade" maxLength={100} defaultValue={contact?.cidade ?? ""} autoComplete="address-level2" /></label>
        <label className="field"><span className="label">UF</span><input name="uf" maxLength={2} defaultValue={contact?.uf ?? ""} placeholder="RS" autoComplete="address-level1" /></label>
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-heading"><span>2</span><div><h2>Canais</h2><p>Informe ao menos o WhatsApp ou o Instagram. Links completos também são aceitos.</p></div></div>
      <div className="form-grid">
        <label className="field"><span className="label">WhatsApp com DDD</span><input type="tel" name="telefone" defaultValue={contact?.telefone ?? ""} placeholder="(51) 99999-9999" autoComplete="tel" /></label>
        <label className="field"><span className="label">Instagram</span><input name="instagram" defaultValue={contact?.instagram ?? ""} placeholder="@barbearia ou link do perfil" autoCapitalize="none" /></label>
        <label className="field"><span className="label">E-mail</span><input type="email" name="email" maxLength={254} defaultValue={contact?.email ?? ""} autoComplete="email" /></label>
        <label className="field"><span className="label">Origem</span><select name="origem" defaultValue={contact?.origem ?? "instagram"}>{CONTACT_ORIGINS.map((origin) => <option key={origin} value={origin}>{CONTACT_ORIGIN_LABELS[origin]}</option>)}</select></label>
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-heading"><span>3</span><div><h2>Acompanhamento</h2><p>Uma próxima ação com data faz o contato reaparecer no momento certo.</p></div></div>
      <div className="form-grid">
        <label className="field"><span className="label">Próxima ação</span><input name="proxima_acao" maxLength={200} defaultValue={contact?.proxima_acao ?? ""} placeholder="Ex.: enviar primeira mensagem" disabled={doNotContact} /></label>
        <label className="field"><span className="label">Quando</span><input type="datetime-local" name="proxima_acao_em" defaultValue={localDateTime(contact?.proxima_acao_em ?? null)} disabled={doNotContact} /></label>
        <label className="field form-wide"><span className="label">Observações</span><textarea name="observacoes" maxLength={3000} rows={4} defaultValue={contact?.observacoes ?? ""} placeholder="Perfil da barbearia, tamanho da equipe ou contexto para a abordagem." /></label>
        <label className="field form-wide"><span className="label">Etiquetas</span><input name="tags" defaultValue={contact?.tags.join(", ") ?? ""} placeholder="Ex.: premium, 3 cadeiras, porto alegre" /></label>
      </div>
      <label className="contact-checkbox"><input type="checkbox" name="nao_contatar" checked={doNotContact} onChange={(event) => setDoNotContact(event.target.checked)} /><span><strong>Não contatar</strong><small>Remove a próxima ação e sinaliza que novas abordagens devem ser evitadas.</small></span></label>
    </section>
  </>;
}

export function NewContactForm() {
  const router = useRouter();
  const [state, action] = useActionState(createContactAction, initialState);
  const [doNotContact, setDoNotContact] = useState(false);

  useEffect(() => {
    if (state.ok && state.contactId) router.push(`/contatos/${state.contactId}`);
  }, [router, state.contactId, state.ok]);

  return <form action={action} className="tenant-form contact-form">
    {state.message ? <div className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</div> : null}
    <ContactFields doNotContact={doNotContact} setDoNotContact={setDoNotContact} />
    <div className="form-actions"><p>O contato será criado na etapa <strong>Novo</strong>. Registre a abordagem no histórico depois de enviar a mensagem.</p><SubmitButton create /></div>
  </form>;
}

export function ContactEditor({ contact }: { contact: CommercialContact }) {
  const updateAction = updateContactAction.bind(null, contact.id);
  const [state, action] = useActionState(updateAction, initialState);
  const [doNotContact, setDoNotContact] = useState(contact.nao_contatar);
  const formRef = useRef<HTMLFormElement>(null);

  return <form ref={formRef} action={action} className="tenant-form contact-form compact-contact-form">
    {state.message ? <div className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</div> : null}
    <ContactFields contact={contact} doNotContact={doNotContact} setDoNotContact={setDoNotContact} />
    <div className="form-actions"><p>Alterações de etapa são registradas pela interação, preservando a linha do tempo.</p><SubmitButton create={false} /></div>
  </form>;
}
