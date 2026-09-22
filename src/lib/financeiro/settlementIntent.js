export function createSettlementIntent(type, titleId, uuidFactory = () => crypto.randomUUID()) {
  return { type, titleId, key: `${type}:${titleId}:${uuidFactory()}` }
}

export function settlementKeyFor(intent, type, titleId, uuidFactory) {
  if (intent?.type === type && intent?.titleId === titleId) return intent
  return createSettlementIntent(type, titleId, uuidFactory)
}
