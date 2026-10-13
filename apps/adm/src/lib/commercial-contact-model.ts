export const CONTACT_STAGES = [
  "novo",
  "contatado",
  "respondeu",
  "qualificado",
  "proposta",
  "convertido",
  "perdido",
] as const;

export type ContactStage = (typeof CONTACT_STAGES)[number];

export const CONTACT_STAGE_LABELS: Record<ContactStage, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondeu: "Respondeu",
  qualificado: "Qualificado",
  proposta: "Proposta",
  convertido: "Convertido",
  perdido: "Perdido",
};

export const ACTIVE_CONTACT_STAGES = CONTACT_STAGES.filter((stage) => !["convertido", "perdido"].includes(stage));

export const CONTACT_ORIGINS = ["instagram", "google_maps", "indicacao", "inbound", "whatsapp", "outro"] as const;
export type ContactOrigin = (typeof CONTACT_ORIGINS)[number];
export const CONTACT_ORIGIN_LABELS: Record<ContactOrigin, string> = {
  instagram: "Pesquisa no Instagram",
  google_maps: "Google / Maps",
  indicacao: "Indicação",
  inbound: "Contato recebido",
  whatsapp: "Pesquisa no WhatsApp",
  outro: "Outra origem",
};

export const CONTACT_CHANNELS = ["whatsapp", "instagram", "telefone", "email", "reuniao", "nota"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telefone: "Telefone",
  email: "E-mail",
  reuniao: "Reunião",
  nota: "Nota interna",
};

export const CONTACT_INTERACTION_TYPES = ["primeira_abordagem", "retorno", "resposta_recebida", "demonstracao", "proposta", "anotacao"] as const;
export type ContactInteractionType = (typeof CONTACT_INTERACTION_TYPES)[number];
export const CONTACT_INTERACTION_TYPE_LABELS: Record<ContactInteractionType, string> = {
  primeira_abordagem: "Primeira abordagem",
  retorno: "Retorno",
  resposta_recebida: "Resposta recebida",
  demonstracao: "Demonstração",
  proposta: "Proposta enviada",
  anotacao: "Anotação",
};

export type CommercialContact = {
  id: string;
  nome_barbearia: string;
  nome_responsavel: string | null;
  telefone: string | null;
  telefone_normalizado: string | null;
  instagram: string | null;
  instagram_normalizado: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  origem: ContactOrigin;
  etapa: ContactStage;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  ultima_interacao_em: string | null;
  motivo_perda: string | null;
  observacoes: string | null;
  tags: string[];
  nao_contatar: boolean;
  barbearia_id: string | null;
  checkout_id: string | null;
  assinatura_id: string | null;
  convertido_em: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialInteraction = {
  id: string;
  canal: ContactChannel;
  tipo: ContactInteractionType;
  resumo: string | null;
  resultado: string | null;
  etapa_anterior: ContactStage;
  etapa_nova: ContactStage | null;
  ocorrida_em: string;
  autor_user_id: string;
};

export type ContactActionState = {
  ok: boolean;
  message: string;
  contactId?: string;
};
