export function money(value: number | string | null) {
  if (value === null) return "A definir";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function badgeTone(status: string) {
  if (["ativo", "concluido", "pago", "processado"].includes(status)) return "green";
  if (["cancelado", "falhou", "expirado"].includes(status)) return "red";
  if (["trial", "aguardando_pagamento", "provisionando", "recebido", "processando"].includes(status)) return "gold";
  if (["inadimplente", "suspenso", "ignorado"].includes(status)) return "blue";
  return "muted";
}
