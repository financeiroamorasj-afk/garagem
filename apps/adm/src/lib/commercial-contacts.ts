import "server-only";

import { requirePlatformAdmin } from "@/lib/auth";
import {
  ACTIVE_CONTACT_STAGES,
  CONTACT_CHANNELS,
  CONTACT_INTERACTION_TYPES,
  CONTACT_ORIGINS,
  CONTACT_STAGES,
  type CommercialContact,
  type CommercialInteraction,
  type ContactChannel,
  type ContactInteractionType,
  type ContactOrigin,
  type ContactStage,
} from "@/lib/commercial-contact-model";
import { createAdminSupabase } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contactSelection = "id,nome_barbearia,nome_responsavel,telefone,telefone_normalizado,instagram,instagram_normalizado,email,cidade,uf,origem,etapa,proxima_acao,proxima_acao_em,ultima_interacao_em,motivo_perda,observacoes,tags,nao_contatar,barbearia_id,checkout_id,assinatura_id,convertido_em,created_at,updated_at";

export type CommercialContactInput = {
  nomeBarbearia: unknown;
  nomeResponsavel: unknown;
  telefone: unknown;
  instagram: unknown;
  email: unknown;
  cidade: unknown;
  uf: unknown;
  origem: unknown;
  proximaAcao: unknown;
  proximaAcaoEm: unknown;
  observacoes: unknown;
  tags: unknown;
  naoContatar?: unknown;
};

export type CommercialInteractionInput = {
  canal: unknown;
  tipo: unknown;
  resumo: unknown;
  resultado: unknown;
  etapaNova: unknown;
  ocorridaEm: unknown;
  proximaAcao: unknown;
  proximaAcaoEm: unknown;
  motivoPerda: unknown;
};

function requiredText(value: unknown, code: string, min: number, max: number) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) throw new Error(code);
  return normalized;
}

function optionalText(value: unknown, code: string, max: number, min = 2) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length < min || normalized.length > max) throw new Error(code);
  return normalized;
}

function normalizePhone(value: unknown) {
  const display = String(value ?? "").trim();
  if (!display) return { display: null, normalized: null };
  let normalized = display.replace(/\D/g, "");
  if (normalized.length === 10 || normalized.length === 11) normalized = `55${normalized}`;
  if (normalized.length < 8 || normalized.length > 15) throw new Error("CONTATO_TELEFONE_INVALIDO");
  return { display, normalized };
}

function normalizeInstagram(value: unknown) {
  const display = String(value ?? "").trim();
  if (!display) return { display: null, normalized: null };
  const normalized = display
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!/^[a-z0-9._]{1,30}$/.test(normalized)) throw new Error("CONTATO_INSTAGRAM_INVALIDO");
  return { display: `@${normalized}`, normalized };
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("CONTATO_EMAIL_INVALIDO");
  return email;
}

function normalizeUf(value: unknown) {
  const uf = String(value ?? "").trim().toUpperCase();
  if (!uf) return null;
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error("CONTATO_UF_INVALIDA");
  return uf;
}

function normalizeTags(value: unknown) {
  const tags = [...new Set(String(value ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 10 || tags.some((tag) => tag.length > 32)) throw new Error("CONTATO_TAGS_INVALIDAS");
  return tags;
}

function parseSaoPauloDateTime(value: unknown, code: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
    ? new Date(`${raw}:00-03:00`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(code);
  return date.toISOString();
}

function normalizeOrigin(value: unknown): ContactOrigin {
  const origin = String(value ?? "") as ContactOrigin;
  if (!CONTACT_ORIGINS.includes(origin)) throw new Error("CONTATO_ORIGEM_INVALIDA");
  return origin;
}

function normalizeStage(value: unknown, allowEmpty = false): ContactStage | null {
  const stage = String(value ?? "");
  if (allowEmpty && !stage) return null;
  if (!CONTACT_STAGES.includes(stage as ContactStage)) throw new Error("CONTATO_ETAPA_INVALIDA");
  return stage as ContactStage;
}

function normalizeChannel(value: unknown): ContactChannel {
  const channel = String(value ?? "") as ContactChannel;
  if (!CONTACT_CHANNELS.includes(channel)) throw new Error("CONTATO_CANAL_INVALIDO");
  return channel;
}

function normalizeInteractionType(value: unknown): ContactInteractionType {
  const type = String(value ?? "") as ContactInteractionType;
  if (!CONTACT_INTERACTION_TYPES.includes(type)) throw new Error("CONTATO_INTERACAO_TIPO_INVALIDO");
  return type;
}

function validateUuid(value: string, code = "CONTATO_ID_INVALIDO") {
  if (!uuidPattern.test(value)) throw new Error(code);
  return value;
}

async function garagemProductId() {
  const { data, error } = await createAdminSupabase().from("plataforma_produtos").select("id").eq("codigo", "garagem").eq("ativo", true).single();
  if (error || !data) throw new Error("CONTATO_PRODUTO_INDISPONIVEL");
  return String(data.id);
}

function normalizedContactInput(input: CommercialContactInput) {
  const phone = normalizePhone(input.telefone);
  const instagram = normalizeInstagram(input.instagram);
  if (!phone.normalized && !instagram.normalized) throw new Error("CONTATO_CANAL_OBRIGATORIO");
  const doNotContact = input.naoContatar === true || input.naoContatar === "on" || input.naoContatar === "true";
  return {
    nome_barbearia: requiredText(input.nomeBarbearia, "CONTATO_BARBEARIA_INVALIDA", 2, 120),
    nome_responsavel: optionalText(input.nomeResponsavel, "CONTATO_RESPONSAVEL_INVALIDO", 120),
    telefone: phone.display,
    telefone_normalizado: phone.normalized,
    instagram: instagram.display,
    instagram_normalizado: instagram.normalized,
    email: normalizeEmail(input.email),
    cidade: optionalText(input.cidade, "CONTATO_CIDADE_INVALIDA", 100),
    uf: normalizeUf(input.uf),
    origem: normalizeOrigin(input.origem),
    proxima_acao: doNotContact ? null : optionalText(input.proximaAcao, "CONTATO_PROXIMA_ACAO_INVALIDA", 200),
    proxima_acao_em: doNotContact ? null : parseSaoPauloDateTime(input.proximaAcaoEm, "CONTATO_PROXIMA_DATA_INVALIDA"),
    observacoes: optionalText(input.observacoes, "CONTATO_OBSERVACOES_INVALIDAS", 3000, 1),
    tags: normalizeTags(input.tags),
    nao_contatar: doNotContact,
  };
}

async function audit(productId: string, actorId: string, action: string, entityId: string, before: unknown, after: unknown) {
  const { error } = await createAdminSupabase().from("saas_auditoria").insert({
    produto_id: productId,
    ator_user_id: actorId,
    ator_role: "super_admin",
    acao: action,
    entidade: "saas_contatos_comerciais",
    entidade_id: entityId,
    estado_anterior: before,
    estado_novo: after,
  });
  if (error) throw new Error(`CONTATO_AUDITORIA_FALHOU:${error.message}`);
}

export async function commercialContactBoard() {
  await requirePlatformAdmin(["super_admin"]);
  const productId = await garagemProductId();
  const supabase = createAdminSupabase();
  const [{ data, error }, responses] = await Promise.all([
    supabase.from("saas_contatos_comerciais").select(contactSelection).eq("produto_id", productId).order("created_at", { ascending: false }),
    supabase.from("saas_contatos_interacoes").select("id", { count: "exact", head: true }).eq("produto_id", productId).eq("tipo", "resposta_recebida"),
  ]);
  if (error || responses.error) throw new Error("Não foi possível carregar o funil comercial.");
  const contacts = (data ?? []) as CommercialContact[];
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const dateKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const active = contacts.filter((contact) => ACTIVE_CONTACT_STAGES.includes(contact.etapa));
  return {
    contacts,
    metrics: {
      active: active.length,
      waitingFirstContact: active.filter((contact) => contact.etapa === "novo").length,
      overdue: active.filter((contact) => contact.proxima_acao_em && new Date(contact.proxima_acao_em) < now && dateKey(contact.proxima_acao_em) !== today).length,
      today: active.filter((contact) => contact.proxima_acao_em && dateKey(contact.proxima_acao_em) === today).length,
      responses: responses.count ?? 0,
      converted: contacts.filter((contact) => contact.etapa === "convertido").length,
    },
  };
}

export async function commercialContactDetail(contactId: string) {
  await requirePlatformAdmin(["super_admin"]);
  validateUuid(contactId);
  const productId = await garagemProductId();
  const supabase = createAdminSupabase();
  const [contactResult, interactionsResult, shopsResult, checkoutsResult, subscriptionsResult] = await Promise.all([
    supabase.from("saas_contatos_comerciais").select(contactSelection).eq("produto_id", productId).eq("id", contactId).maybeSingle(),
    supabase.from("saas_contatos_interacoes").select("id,canal,tipo,resumo,resultado,etapa_anterior,etapa_nova,ocorrida_em,autor_user_id").eq("produto_id", productId).eq("contato_id", contactId).order("ocorrida_em", { ascending: false }),
    supabase.from("barbearias").select("id,nome,slug").order("nome"),
    supabase.from("saas_checkouts").select("id,nome_barbearia,status,barbearia_id,created_at").eq("produto_id", productId).not("barbearia_id", "is", null).order("created_at", { ascending: false }).limit(100),
    supabase.from("saas_assinaturas").select("id,barbearia_id,status,created_at").eq("produto_id", productId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (contactResult.error || interactionsResult.error || shopsResult.error || checkoutsResult.error || subscriptionsResult.error) {
    throw new Error("Não foi possível carregar o contato comercial.");
  }
  return {
    contact: (contactResult.data ?? null) as CommercialContact | null,
    interactions: (interactionsResult.data ?? []) as CommercialInteraction[],
    shops: shopsResult.data ?? [],
    checkouts: checkoutsResult.data ?? [],
    subscriptions: subscriptionsResult.data ?? [],
  };
}

export async function createCommercialContact(input: CommercialContactInput) {
  const { user } = await requirePlatformAdmin(["super_admin"]);
  const productId = await garagemProductId();
  const values = normalizedContactInput(input);
  const supabase = createAdminSupabase();
  let duplicateInstagram = false;
  if (values.telefone_normalizado) {
    const { data } = await supabase.from("saas_contatos_comerciais").select("id").eq("produto_id", productId).eq("telefone_normalizado", values.telefone_normalizado).not("etapa", "in", "(convertido,perdido)").maybeSingle();
    if (data) throw new Error("CONTATO_TELEFONE_DUPLICADO");
  }
  if (values.instagram_normalizado) {
    const { data } = await supabase.from("saas_contatos_comerciais").select("id").eq("produto_id", productId).eq("instagram_normalizado", values.instagram_normalizado).not("etapa", "in", "(convertido,perdido)").limit(1);
    duplicateInstagram = Boolean(data?.length);
  }
  const { data, error } = await supabase.from("saas_contatos_comerciais").insert({
    produto_id: productId,
    ...values,
    etapa: "novo",
    responsavel_user_id: user.id,
    criado_por: user.id,
  }).select(contactSelection).single();
  if (error || !data) {
    if (error?.code === "23505") throw new Error("CONTATO_TELEFONE_DUPLICADO");
    throw new Error(`CONTATO_CRIACAO_FALHOU:${error?.message ?? "sem retorno"}`);
  }
  await audit(productId, user.id, "contato_criado", data.id, null, data);
  return { contactId: String(data.id), duplicateInstagram };
}

export async function updateCommercialContact(contactId: string, input: CommercialContactInput) {
  const { user } = await requirePlatformAdmin(["super_admin"]);
  validateUuid(contactId);
  const productId = await garagemProductId();
  const values = normalizedContactInput(input);
  const supabase = createAdminSupabase();
  const { data: before, error: beforeError } = await supabase.from("saas_contatos_comerciais").select(contactSelection).eq("produto_id", productId).eq("id", contactId).maybeSingle();
  if (beforeError || !before) throw new Error("CONTATO_NAO_ENCONTRADO");
  const { data, error } = await supabase.from("saas_contatos_comerciais").update(values).eq("produto_id", productId).eq("id", contactId).select(contactSelection).single();
  if (error || !data) {
    if (error?.code === "23505") throw new Error("CONTATO_TELEFONE_DUPLICADO");
    throw new Error(`CONTATO_ATUALIZACAO_FALHOU:${error?.message ?? "sem retorno"}`);
  }
  await audit(productId, user.id, "contato_atualizado", contactId, before, data);
}

export async function registerCommercialInteraction(contactId: string, input: CommercialInteractionInput) {
  const { user } = await requirePlatformAdmin(["super_admin"]);
  validateUuid(contactId);
  const productId = await garagemProductId();
  const channel = normalizeChannel(input.canal);
  const type = normalizeInteractionType(input.tipo);
  const summary = optionalText(input.resumo, "CONTATO_RESUMO_INVALIDO", 2000);
  const result = optionalText(input.resultado, "CONTATO_RESULTADO_INVALIDO", 500);
  if (!summary && !result) throw new Error("CONTATO_INTERACAO_VAZIA");
  const nextStage = normalizeStage(input.etapaNova, true);
  if (nextStage === "convertido") throw new Error("CONTATO_CONVERSAO_EXIGE_VINCULO");
  const occurredAt = parseSaoPauloDateTime(input.ocorridaEm, "CONTATO_INTERACAO_DATA_INVALIDA") ?? new Date().toISOString();
  if (new Date(occurredAt).getTime() > Date.now() + 5 * 60 * 1000) throw new Error("CONTATO_INTERACAO_DATA_FUTURA");
  const nextAction = optionalText(input.proximaAcao, "CONTATO_PROXIMA_ACAO_INVALIDA", 200);
  const nextActionAt = parseSaoPauloDateTime(input.proximaAcaoEm, "CONTATO_PROXIMA_DATA_INVALIDA");
  const lossReason = optionalText(input.motivoPerda, "CONTATO_MOTIVO_PERDA_INVALIDO", 240);
  if (nextStage === "perdido" && !lossReason) throw new Error("CONTATO_MOTIVO_PERDA_OBRIGATORIO");
  const supabase = createAdminSupabase();
  const { data: before, error: beforeError } = await supabase.from("saas_contatos_comerciais").select(contactSelection).eq("produto_id", productId).eq("id", contactId).maybeSingle();
  if (beforeError || !before) throw new Error("CONTATO_NAO_ENCONTRADO");
  if (before.etapa === "convertido" && nextStage) throw new Error("CONTATO_CONVERTIDO_TERMINAL");
  const { error } = await supabase.rpc("saas_contato_registrar_interacao", {
    p_produto_id: productId,
    p_contato_id: contactId,
    p_autor_user_id: user.id,
    p_canal: channel,
    p_tipo: type,
    p_resumo: summary,
    p_resultado: result,
    p_etapa_nova: nextStage,
    p_ocorrida_em: occurredAt,
    p_proxima_acao: nextAction,
    p_proxima_acao_em: nextActionAt,
    p_motivo_perda: lossReason,
  });
  if (error) throw new Error(`CONTATO_INTERACAO_FALHOU:${error.message}`);
  const { data: after } = await supabase.from("saas_contatos_comerciais").select(contactSelection).eq("produto_id", productId).eq("id", contactId).single();
  await audit(productId, user.id, "contato_interacao_registrada", contactId, before, after);
}

export async function convertCommercialContact(contactId: string, barbershopId: string, checkoutId: string | null, subscriptionId: string | null) {
  const { user } = await requirePlatformAdmin(["super_admin"]);
  validateUuid(contactId);
  validateUuid(barbershopId, "CONTATO_BARBEARIA_VINCULO_INVALIDA");
  if (checkoutId) validateUuid(checkoutId, "CONTATO_CHECKOUT_INVALIDO");
  if (subscriptionId) validateUuid(subscriptionId, "CONTATO_ASSINATURA_INVALIDA");
  const productId = await garagemProductId();
  const supabase = createAdminSupabase();
  const [contactResult, shopResult, checkoutResult, subscriptionResult] = await Promise.all([
    supabase.from("saas_contatos_comerciais").select(contactSelection).eq("produto_id", productId).eq("id", contactId).maybeSingle(),
    supabase.from("barbearias").select("id,nome").eq("id", barbershopId).maybeSingle(),
    checkoutId ? supabase.from("saas_checkouts").select("id,barbearia_id").eq("produto_id", productId).eq("id", checkoutId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    subscriptionId ? supabase.from("saas_assinaturas").select("id,barbearia_id").eq("produto_id", productId).eq("id", subscriptionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (contactResult.error || !contactResult.data) throw new Error("CONTATO_NAO_ENCONTRADO");
  if (shopResult.error || !shopResult.data) throw new Error("CONTATO_BARBEARIA_VINCULO_INVALIDA");
  if (checkoutId && (checkoutResult.error || !checkoutResult.data || checkoutResult.data.barbearia_id !== barbershopId)) throw new Error("CONTATO_CHECKOUT_INVALIDO");
  if (subscriptionId && (subscriptionResult.error || !subscriptionResult.data || subscriptionResult.data.barbearia_id !== barbershopId)) throw new Error("CONTATO_ASSINATURA_INVALIDA");
  const convertedAt = new Date().toISOString();
  const { data: after, error } = await supabase.from("saas_contatos_comerciais").update({
    etapa: "convertido",
    barbearia_id: barbershopId,
    checkout_id: checkoutId,
    assinatura_id: subscriptionId,
    convertido_em: convertedAt,
    proxima_acao: null,
    proxima_acao_em: null,
    motivo_perda: null,
  }).eq("produto_id", productId).eq("id", contactId).select(contactSelection).single();
  if (error || !after) throw new Error(`CONTATO_CONVERSAO_FALHOU:${error?.message ?? "sem retorno"}`);
  const { error: interactionError } = await supabase.from("saas_contatos_interacoes").insert({
    produto_id: productId,
    contato_id: contactId,
    canal: "nota",
    tipo: "anotacao",
    resumo: `Convertido e vinculado à barbearia ${shopResult.data.nome}.`,
    resultado: "Contratação vinculada aos registros reais da plataforma.",
    etapa_anterior: contactResult.data.etapa,
    etapa_nova: "convertido",
    ocorrida_em: convertedAt,
    autor_user_id: user.id,
  });
  if (interactionError) throw new Error(`CONTATO_CONVERSAO_HISTORICO_FALHOU:${interactionError.message}`);
  await audit(productId, user.id, "contato_convertido", contactId, contactResult.data, after);
}

export function commercialContactErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : "CONTATO_FALHOU";
  const code = detail.split(":")[0];
  const messages: Record<string, string> = {
    CONTATO_BARBEARIA_INVALIDA: "Informe o nome da barbearia.",
    CONTATO_RESPONSAVEL_INVALIDO: "Revise o nome do responsável.",
    CONTATO_TELEFONE_INVALIDO: "Informe um WhatsApp válido, de preferência com DDD.",
    CONTATO_INSTAGRAM_INVALIDO: "Informe um usuário ou link válido do Instagram.",
    CONTATO_CANAL_OBRIGATORIO: "Informe ao menos o WhatsApp ou o Instagram.",
    CONTATO_EMAIL_INVALIDO: "Informe um e-mail válido.",
    CONTATO_UF_INVALIDA: "Informe a UF com duas letras.",
    CONTATO_ORIGEM_INVALIDA: "Selecione uma origem válida.",
    CONTATO_TAGS_INVALIDAS: "Use no máximo 10 etiquetas curtas.",
    CONTATO_PROXIMA_ACAO_INVALIDA: "Revise a descrição da próxima ação.",
    CONTATO_PROXIMA_DATA_INVALIDA: "Informe uma data válida para a próxima ação.",
    CONTATO_TELEFONE_DUPLICADO: "Já existe um contato ativo com este WhatsApp.",
    CONTATO_NAO_ENCONTRADO: "Contato não encontrado.",
    CONTATO_INTERACAO_VAZIA: "Escreva um resumo ou resultado da interação.",
    CONTATO_INTERACAO_DATA_INVALIDA: "Informe uma data válida para a interação.",
    CONTATO_INTERACAO_DATA_FUTURA: "A interação não pode ser registrada no futuro.",
    CONTATO_MOTIVO_PERDA_OBRIGATORIO: "Informe o motivo da perda.",
    CONTATO_CONVERSAO_EXIGE_VINCULO: "Use a área de conversão para vincular a contratação real.",
    CONTATO_CONVERTIDO_TERMINAL: "Um contato convertido não pode voltar para o funil. Registre apenas anotações sem mudar a etapa.",
    CONTATO_BARBEARIA_VINCULO_INVALIDA: "Selecione uma barbearia válida.",
    CONTATO_CHECKOUT_INVALIDO: "O checkout selecionado não pertence à barbearia.",
    CONTATO_ASSINATURA_INVALIDA: "A assinatura selecionada não pertence à barbearia.",
  };
  return messages[code] ?? "Não foi possível concluir a operação. Tente novamente ou consulte os registros do ADM.";
}
