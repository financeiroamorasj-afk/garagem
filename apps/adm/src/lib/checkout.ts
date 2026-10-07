import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export type CheckoutModuleInput = { codigo: string; quantidade: number };

export function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("CHECKOUT_EMAIL_INVALIDO");
  }
  return email;
}

export function normalizePhone(value: unknown) {
  const phone = String(value ?? "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 13) throw new Error("CHECKOUT_TELEFONE_INVALIDO");
  return phone;
}

export function normalizeName(value: unknown, field: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new Error(`${field}_INVALIDO`);
  return name;
}

export function normalizeModules(value: unknown): CheckoutModuleInput[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error("CHECKOUT_MODULOS_INVALIDOS");

  const merged = new Map<string, number>();
  for (const item of value) {
    const codigo = typeof item === "string" ? item : String(item?.codigo ?? "");
    const requested = typeof item === "string" ? 1 : Number(item?.quantidade ?? 1);
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(codigo)) throw new Error("CHECKOUT_MODULOS_INVALIDOS");
    if (!Number.isInteger(requested) || requested < 1 || requested > 50) throw new Error("CHECKOUT_QUANTIDADE_INVALIDA");
    const quantity = codigo === "profissional_adicional" ? requested : 1;
    merged.set(codigo, Math.min(50, (merged.get(codigo) ?? 0) + quantity));
  }
  return [...merged].map(([codigo, quantidade]) => ({ codigo, quantidade }));
}

export function makeDesiredSlug(name: string) {
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "barbearia";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createCheckoutTokenHash() {
  return sha256(randomBytes(32).toString("hex"));
}

export function allowedCheckoutOrigins() {
  const configured = process.env.CHECKOUT_ALLOWED_ORIGINS
    ?.split(",").map((item) => item.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : [
    "https://garagemsystem.com.br",
    "https://www.garagemsystem.com.br",
  ]);
}

export function checkoutCorsOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (allowedCheckoutOrigins().has(origin)) return origin;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return origin;
  return null;
}

export function checkoutCallbackUrls() {
  const landingUrl = (process.env.GARAGEM_LANDING_URL ?? "https://garagemsystem.com.br").replace(/\/$/, "");
  return {
    successUrl: `${landingUrl}/checkout/sucesso.html`,
    cancelUrl: `${landingUrl}/checkout/cancelado.html`,
    expiredUrl: `${landingUrl}/checkout/expirado.html`,
  };
}
