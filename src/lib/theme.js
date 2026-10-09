const STORAGE_KEY = 'garagem:theme'
const EVENT_NAME = 'garagem:theme-change'

export function currentTheme() {
  if (typeof window === 'undefined') return 'dark'
  try { return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* Persistência indisponível. */ }
  window.dispatchEvent(new Event(EVENT_NAME))
  return next
}

export function watchTheme(listener) {
  window.addEventListener(EVENT_NAME, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT_NAME, listener)
    window.removeEventListener('storage', listener)
  }
}
