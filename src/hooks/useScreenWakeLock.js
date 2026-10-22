import { useEffect, useState } from 'react'

export default function useScreenWakeLock(enabled) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled || !supported) return undefined

    let cancelled = false
    let sentinel = null

    async function requestLock() {
      if (cancelled || document.visibilityState !== 'visible' || sentinel) return
      try {
        const nextSentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await nextSentinel.release().catch(() => {})
          return
        }
        sentinel = nextSentinel
        setActive(true)
        nextSentinel.addEventListener('release', () => {
          if (sentinel === nextSentinel) sentinel = null
          if (!cancelled) setActive(false)
        }, { once: true })
      } catch {
        if (!cancelled) setActive(false)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') requestLock()
    }

    requestLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (sentinel) sentinel.release().catch(() => {})
      sentinel = null
    }
  }, [enabled, supported])

  return { active: enabled && active, supported }
}
