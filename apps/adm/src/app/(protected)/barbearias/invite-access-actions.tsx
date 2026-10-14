"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  generateBarbershopAdminInviteLink,
  resendBarbershopAdminInvite,
  type GenerateInviteLinkState,
} from "./actions";

const initialLinkState: GenerateInviteLinkState = { status: "idle", message: "" };

function ResendInviteButton({ firstSend }: { firstSend: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="table-action-button" type="submit" disabled={pending}>
      {pending ? "Enviando…" : firstSend ? "Enviar convite" : "Reenviar convite"}
    </button>
  );
}

export function InviteAccessActions({
  barbershopId,
  userId,
  firstSend,
}: {
  barbershopId: string;
  userId: string;
  firstSend: boolean;
}) {
  const [state, generateAction, generating] = useActionState(generateBarbershopAdminInviteLink, initialLinkState);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    setCopied(false);
    setCopyError(false);
  }, [state.actionLink]);

  async function copyLink() {
    if (!state.actionLink) return;
    try {
      await navigator.clipboard.writeText(state.actionLink);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  const expiresLabel = state.expiresAt
    ? new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(state.expiresAt))
    : null;

  return <div className="invite-action-stack">
    <div className="invite-action-buttons">
      <form action={resendBarbershopAdminInvite}>
        <input type="hidden" name="barbearia_id" value={barbershopId} />
        <input type="hidden" name="user_id" value={userId} />
        <ResendInviteButton firstSend={firstSend} />
      </form>
      <form
        action={generateAction}
        onSubmit={(event) => {
          if (!window.confirm("Gerar um novo link invalidará os convites anteriores. Deseja continuar?")) event.preventDefault();
        }}
      >
        <input type="hidden" name="barbearia_id" value={barbershopId} />
        <input type="hidden" name="user_id" value={userId} />
        <button className="table-action-button generate-link-button" type="submit" disabled={generating}>
          {generating ? "Gerando…" : "Gerar link"}
        </button>
      </form>
    </div>
    <span className="invite-action-warning">Um novo envio ou link substitui os anteriores.</span>
    {state.message ? <div className={`invite-link-result ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      <p>{state.message}</p>
      {state.actionLink ? <>
        <div className="invite-link-copy-row">
          <input
            aria-label="Link de primeiro acesso"
            readOnly
            value={state.actionLink}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={copyLink}>{copied ? "Copiado" : "Copiar link"}</button>
        </div>
        <small>Válido até {expiresLabel}. Compartilhe somente com o administrador deste cliente.</small>
        {copyError ? <small className="copy-error">Não foi possível copiar automaticamente. Selecione o campo e copie manualmente.</small> : null}
      </> : null}
    </div> : null}
  </div>;
}
