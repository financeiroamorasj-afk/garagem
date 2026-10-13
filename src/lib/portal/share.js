const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/

export function criarLinkPortal(slug, origin = window.location.origin) {
  const normalizedSlug = String(slug ?? '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(normalizedSlug)) return ''
  return new URL(`/portal/${normalizedSlug}`, origin).toString()
}

export function criarMensagemPortal({ nomeBarbearia, portalUrl }) {
  if (!portalUrl) return ''
  const nome = String(nomeBarbearia ?? '').trim() || 'nossa barbearia'
  return `Olá! A agenda online da ${nome} está disponível no Portal do Cliente.\n\nConsulte seus horários e faça um novo agendamento por aqui:\n${portalUrl}\n\nNo primeiro acesso, informe seu CPF e complete o cadastro.`
}
