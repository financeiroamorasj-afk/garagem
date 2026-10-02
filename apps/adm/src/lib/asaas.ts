import "server-only";

const isProdKey = process.env.ASAAS_API_KEY?.includes('_prod_');
const API_URL = isProdKey 
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

async function fetchAsaas(endpoint: string, options: RequestInit = {}) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[ASAAS ERROR] ${endpoint}:`, errorBody);
    throw new Error(`Asaas API Error: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

export async function createCustomer(name: string, cpfCnpj: string, email: string, phone: string, externalReference: string) {
  const cleanCpf = cpfCnpj.replace(/\D/g, '');
  
  // Verifica se o cliente já existe no Asaas pelo CPF para não duplicar
  if (cleanCpf) {
    const search = await fetchAsaas(`/customers?cpfCnpj=${cleanCpf}`);
    if (search.data && search.data.length > 0) {
      // Atualiza a referência externa no cliente existente se necessário
      const existing = search.data[0];
      await fetchAsaas(`/customers/${existing.id}`, {
        method: 'POST',
        body: JSON.stringify({ externalReference })
      });
      return existing;
    }
  }

  const payload: any = {
    name,
    email,
    mobilePhone: phone.replace(/\D/g, ''),
    externalReference
  };

  if (cleanCpf) {
    payload.cpfCnpj = cleanCpf;
  }

  return fetchAsaas('/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createSubscription(
  customerId: string, 
  value: number, 
  description: string, 
  cycle: 'MONTHLY' | 'YEARLY', 
  externalReference: string
) {
  
  const today = new Date();
  
  const payload: any = {
    customer: customerId,
    billingType: 'UNDEFINED', // Permite Cartão, PIX ou Boleto no link do Asaas
    value,
    nextDueDate: today.toISOString().split('T')[0],
    cycle,
    description,
    externalReference
  };

  const response = await fetchAsaas('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  
  return response;
}
