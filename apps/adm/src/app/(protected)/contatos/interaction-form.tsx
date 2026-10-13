"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CONTACT_CHANNELS,
  CONTACT_CHANNEL_LABELS,
  CONTACT_INTERACTION_TYPES,
  CONTACT_INTERACTION_TYPE_LABELS,
  CONTACT_STAGES,
  CONTACT_STAGE_LABELS,
  type ContactActionState,
  type ContactStage,
} from "@/lib/commercial-contact-model";
import { registerInteractionAction } from "./actions";

const initialState: ContactActionState = { ok: false, message: "" };

function SubmitInteractionButton() {
  const { pending } = useFormStatus();
  return <button className="button contact-submit" type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar interação"}</button>;
}

export function InteractionForm({ contactId, currentStage }: { contactId: string; currentStage: ContactStage }) {
  const boundAction = registerInteractionAction.bind(null, contactId);
  const [state, action] = useActionState(boundAction, initialState);
  const [nextStage, setNextStage] = useState("");

  return <form action={action} className="interaction-form">
    {state.message ? <div className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</div> : null}
    <div className="form-grid">
      <label className="field"><span className="label">Canal</span><select name="canal" defaultValue="whatsapp">{CONTACT_CHANNELS.map((channel) => <option key={channel} value={channel}>{CONTACT_CHANNEL_LABELS[channel]}</option>)}</select></label>
      <label className="field"><span className="label">Tipo</span><select name="tipo" defaultValue={currentStage === "novo" ? "primeira_abordagem" : "retorno"}>{CONTACT_INTERACTION_TYPES.map((type) => <option key={type} value={type}>{CONTACT_INTERACTION_TYPE_LABELS[type]}</option>)}</select></label>
      <label className="field"><span className="label">Data e hora</span><input type="datetime-local" name="ocorrida_em" /><small>Deixe vazio para registrar agora.</small></label>
      <label className="field"><span className="label">Mover para</span><select name="etapa_nova" value={nextStage} onChange={(event) => setNextStage(event.target.value)}><option value="">Manter em {CONTACT_STAGE_LABELS[currentStage]}</option>{currentStage === "convertido" ? null : CONTACT_STAGES.filter((stage) => stage !== "convertido").map((stage) => <option key={stage} value={stage}>{CONTACT_STAGE_LABELS[stage]}</option>)}</select></label>
      <label className="field form-wide"><span className="label">Resumo</span><textarea name="resumo" rows={4} maxLength={2000} placeholder="O que foi conversado ou enviado?" /></label>
      <label className="field form-wide"><span className="label">Resultado</span><input name="resultado" maxLength={500} placeholder="Ex.: pediu uma demonstração na sexta-feira" /></label>
      {nextStage === "perdido" ? <label className="field form-wide"><span className="label">Motivo da perda</span><input name="motivo_perda" required minLength={2} maxLength={240} placeholder="Ex.: já utiliza outro sistema e não quer trocar agora" /></label> : null}
      <label className="field"><span className="label">Próxima ação</span><input name="proxima_acao" maxLength={200} placeholder="Ex.: enviar vídeo de demonstração" disabled={nextStage === "perdido"} /></label>
      <label className="field"><span className="label">Quando retornar</span><input type="datetime-local" name="proxima_acao_em" disabled={nextStage === "perdido"} /></label>
    </div>
    <div className="interaction-actions"><p>Para concluir uma venda, use a área de conversão e vincule a barbearia real.</p><SubmitInteractionButton /></div>
  </form>;
}
