export function createEnvelopeIntent(operation, target, uuidFactory = () => crypto.randomUUID()) {
  return { operation, target, key: `${operation}:${target}:${uuidFactory()}` }
}

export function envelopeIntentKeyFor(intent, operation, target, uuidFactory) {
  if (intent?.operation === operation && intent?.target === target) return intent
  return createEnvelopeIntent(operation, target, uuidFactory)
}
