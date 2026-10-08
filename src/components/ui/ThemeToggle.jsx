import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, currentTheme, watchTheme } from '../../lib/theme'

export default function ThemeToggle({ showLabel = false }) {
  const [theme, setTheme] = useState(currentTheme)
  useEffect(() => watchTheme(() => setTheme(currentTheme())), [])
  const light = theme === 'light'
  const label = light ? 'Ativar modo escuro' : 'Ativar modo claro'
  return <button type="button" aria-label={label} title={label} onClick={() => setTheme(applyTheme(light ? 'dark' : 'light'))} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm border border-line px-2 text-body-sm text-steel hover:border-copper hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
    {light ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    {showLabel && <span>{light ? 'Modo escuro' : 'Modo claro'}</span>}
  </button>
}
