"use client";

import { useFormStatus } from "react-dom";

export function ResendInviteButton({ firstSend = false }: { firstSend?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="table-action-button" type="submit" disabled={pending}>
      {pending ? "Enviando…" : firstSend ? "Enviar convite" : "Reenviar convite"}
    </button>
  );
}
