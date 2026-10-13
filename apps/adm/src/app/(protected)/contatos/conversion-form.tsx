"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ContactActionState } from "@/lib/commercial-contact-model";
import { convertContactAction } from "./actions";

type Shop = { id: string; nome: string; slug: string };
type Checkout = { id: string; nome_barbearia: string; status: string; barbearia_id: string | null; created_at: string };
type Subscription = { id: string; barbearia_id: string; status: string; created_at: string };

const initialState: ContactActionState = { ok: false, message: "" };

function ConvertButton() {
  const { pending } = useFormStatus();
  return <button className="button contact-submit" type="submit" disabled={pending}>{pending ? "Convertendo…" : "Confirmar conversão"}</button>;
}

export function ConversionForm({ contactId, shops, checkouts, subscriptions }: { contactId: string; shops: Shop[]; checkouts: Checkout[]; subscriptions: Subscription[] }) {
  const boundAction = convertContactAction.bind(null, contactId);
  const [state, action] = useActionState(boundAction, initialState);
  const [shopId, setShopId] = useState("");
  const filteredCheckouts = useMemo(() => checkouts.filter((checkout) => checkout.barbearia_id === shopId), [checkouts, shopId]);
  const filteredSubscriptions = useMemo(() => subscriptions.filter((subscription) => subscription.barbearia_id === shopId), [shopId, subscriptions]);

  return <form action={action} className="conversion-form">
    {state.message ? <div className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</div> : null}
    <p className="section-description">Converta somente depois que a contratação existir. Isso preserva uma única identidade para a barbearia.</p>
    <div className="form-grid">
      <label className="field form-wide"><span className="label">Barbearia criada</span><select name="barbearia_id" required value={shopId} onChange={(event) => setShopId(event.target.value)}><option value="" disabled>Selecione a barbearia</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.nome} · /portal/{shop.slug}</option>)}</select></label>
      <label className="field"><span className="label">Checkout relacionado</span><select name="checkout_id" defaultValue="" disabled={!shopId}><option value="">Sem checkout vinculado</option>{filteredCheckouts.map((checkout) => <option key={checkout.id} value={checkout.id}>{checkout.nome_barbearia} · {checkout.status}</option>)}</select></label>
      <label className="field"><span className="label">Assinatura relacionada</span><select name="assinatura_id" defaultValue="" disabled={!shopId}><option value="">Sem assinatura vinculada</option>{filteredSubscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>Assinatura {subscription.id.slice(0, 8)} · {subscription.status}</option>)}</select></label>
    </div>
    <div className="interaction-actions"><Link className="secondary-button" href="/barbearias/nova">Criar barbearia primeiro</Link><ConvertButton /></div>
  </form>;
}
