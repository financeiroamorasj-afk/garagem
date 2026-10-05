import "server-only";

export type AsaasEnvironment = "sandbox" | "producao";

type CheckoutItem = {
  externalReference: string;
  name: string;
  description?: string;
  quantity: number;
  value: number;
};

type CreateCheckoutInput = {
  externalReference: string;
  cycle: "MONTHLY" | "YEARLY";
  items: CheckoutItem[];
  callback: {
    successUrl: string;
    cancelUrl: string;
    expiredUrl: string;
  };
};

export type AsaasCheckout = {
  id: string;
  link: string;
  status: string;
  externalReference?: string;
};

type AsaasListResponse<T> = {
  data: T[];
  hasMore?: boolean;
  totalCount?: number;
};

export type AsaasPayment = {
  id: string;
  customer?: string;
  subscription?: string;
  checkoutSession?: string;
  billingType?: string;
  status?: string;
  externalReference?: string;
};

export class AsaasApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AsaasApiError";
  }
}

export function getAsaasEnvironment(): AsaasEnvironment {
  const configured = process.env.ASAAS_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "sandbox") return "sandbox";
  if (configured === "producao" || configured === "production") return "producao";

  const key = process.env.ASAAS_API_KEY ?? "";
  if (key.startsWith("$aact_hmlg_")) return "sandbox";
  if (key.startsWith("$aact_prod_")) return "producao";
  throw new Error("ASAAS_ENVIRONMENT deve ser sandbox ou producao.");
}

function getApiUrl() {
  return getAsaasEnvironment() === "producao"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

async function fetchAsaas<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");

  const response = await fetch(`${getApiUrl()}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "GaragemSystem/1.0 (Roosh Studio; rooshstudioprojetos@gmail.com)",
      access_token: apiKey,
      ...options.headers,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as {
    errors?: Array<{ code?: string; description?: string }>;
  } | null;

  if (!response.ok) {
    const firstError = payload?.errors?.[0];
    throw new AsaasApiError(
      response.status,
      firstError?.code ?? "ASAAS_REQUEST_FAILED",
      firstError?.description ?? "Não foi possível concluir a comunicação com o Asaas.",
    );
  }

  return payload as T;
}

export async function createAsaasCheckout(input: CreateCheckoutInput) {
  return fetchAsaas<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["PIX", "CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 1440,
      externalReference: input.externalReference,
      callback: input.callback,
      items: input.items,
      subscription: {
        cycle: input.cycle,
        nextDueDate: new Date().toISOString().slice(0, 10),
      },
    }),
  });
}

export async function listAsaasPaymentsByCheckout(checkoutId: string) {
  const params = new URLSearchParams({ checkoutSession: checkoutId, limit: "10", offset: "0" });
  return fetchAsaas<AsaasListResponse<AsaasPayment>>(`/payments?${params.toString()}`);
}

export async function listAsaasPaymentsBySubscription(subscriptionId: string) {
  const params = new URLSearchParams({ subscription: subscriptionId, limit: "100", offset: "0" });
  return fetchAsaas<AsaasListResponse<AsaasPayment>>(`/payments?${params.toString()}`);
}

export async function updateAsaasSubscriptionValue(subscriptionId: string, value: number) {
  return fetchAsaas(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
