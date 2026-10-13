"use server";

import { revalidatePath } from "next/cache";
import type { ContactActionState } from "@/lib/commercial-contact-model";
import {
  commercialContactErrorMessage,
  convertCommercialContact,
  createCommercialContact,
  registerCommercialInteraction,
  updateCommercialContact,
} from "@/lib/commercial-contacts";

function contactInput(formData: FormData) {
  return {
    nomeBarbearia: formData.get("nome_barbearia"),
    nomeResponsavel: formData.get("nome_responsavel"),
    telefone: formData.get("telefone"),
    instagram: formData.get("instagram"),
    email: formData.get("email"),
    cidade: formData.get("cidade"),
    uf: formData.get("uf"),
    origem: formData.get("origem"),
    proximaAcao: formData.get("proxima_acao"),
    proximaAcaoEm: formData.get("proxima_acao_em"),
    observacoes: formData.get("observacoes"),
    tags: formData.get("tags"),
    naoContatar: formData.get("nao_contatar"),
  };
}

export async function createContactAction(_state: ContactActionState, formData: FormData): Promise<ContactActionState> {
  try {
    const result = await createCommercialContact(contactInput(formData));
    revalidatePath("/contatos");
    return {
      ok: true,
      contactId: result.contactId,
      message: result.duplicateInstagram
        ? "Contato criado. Atenção: já existia outro registro com este Instagram; confira antes da abordagem."
        : "Contato criado com sucesso.",
    };
  } catch (error) {
    return { ok: false, message: commercialContactErrorMessage(error) };
  }
}

export async function updateContactAction(contactId: string, _state: ContactActionState, formData: FormData): Promise<ContactActionState> {
  try {
    await updateCommercialContact(contactId, contactInput(formData));
    revalidatePath("/contatos");
    revalidatePath(`/contatos/${contactId}`);
    return { ok: true, message: "Dados do contato atualizados." };
  } catch (error) {
    return { ok: false, message: commercialContactErrorMessage(error) };
  }
}

export async function registerInteractionAction(contactId: string, _state: ContactActionState, formData: FormData): Promise<ContactActionState> {
  try {
    await registerCommercialInteraction(contactId, {
      canal: formData.get("canal"),
      tipo: formData.get("tipo"),
      resumo: formData.get("resumo"),
      resultado: formData.get("resultado"),
      etapaNova: formData.get("etapa_nova"),
      ocorridaEm: formData.get("ocorrida_em"),
      proximaAcao: formData.get("proxima_acao"),
      proximaAcaoEm: formData.get("proxima_acao_em"),
      motivoPerda: formData.get("motivo_perda"),
    });
    revalidatePath("/contatos");
    revalidatePath(`/contatos/${contactId}`);
    return { ok: true, message: "Interação registrada e acompanhamento atualizado." };
  } catch (error) {
    return { ok: false, message: commercialContactErrorMessage(error) };
  }
}

export async function convertContactAction(contactId: string, _state: ContactActionState, formData: FormData): Promise<ContactActionState> {
  try {
    const checkoutId = String(formData.get("checkout_id") ?? "").trim() || null;
    const subscriptionId = String(formData.get("assinatura_id") ?? "").trim() || null;
    await convertCommercialContact(contactId, String(formData.get("barbearia_id") ?? ""), checkoutId, subscriptionId);
    revalidatePath("/contatos");
    revalidatePath(`/contatos/${contactId}`);
    revalidatePath("/barbearias");
    revalidatePath("/assinaturas");
    return { ok: true, message: "Contato convertido e vinculado à contratação real." };
  } catch (error) {
    return { ok: false, message: commercialContactErrorMessage(error) };
  }
}
