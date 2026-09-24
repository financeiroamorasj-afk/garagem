/**
 * IconeMapa — ícones do Mapa da barbearia.
 *
 * Usa lucide-react (padrão do design system, seção 8) e acrescenta dois
 * ícones próprios do Garagem que a biblioteca não tem: o bigode (Clientes) e o
 * poste de barbeiro (centro do radar). Os próprios seguem a mesma grade 24×24,
 * traço e pontas arredondadas, e aceitam as mesmas props do lucide — inclusive
 * x/y, para serem posicionados dentro do SVG do radar.
 *
 * <IconeMapa name="equipe" size={16} color="#7f95a8" />
 */
import { createElement } from 'react'
import { CalendarDays, HandCoins, House, Landmark, ReceiptText, Scissors, Settings, Tag, Vault } from 'lucide-react'

function IconeProprio({ size = 24, color = 'currentColor', strokeWidth = 1.75, children, ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

function Bigode(props) {
  return (
    <IconeProprio {...props}>
      <path d="M12 10.5c-1.2-1.8-3.3-2.4-5-1.5-1.4.7-1.8 2.6-3.2 2.8-.7.1-1.3-.3-1.8-.9.2 2.6 2.5 4.4 5 4.1 2.2-.3 3.6-2.1 5-2.1s2.8 1.8 5 2.1c2.5.3 4.8-1.5 5-4.1-.5.6-1.1 1-1.8.9-1.4-.2-1.8-2.1-3.2-2.8-1.7-.9-3.8-.3-5 1.5z" />
    </IconeProprio>
  )
}

function PosteBarbeiro(props) {
  return (
    <IconeProprio {...props}>
      <rect x="8" y="4" width="8" height="16" rx="1.5" />
      <path d="M6.5 4h11M6.5 20h11M12 2v2M12 20v2M8 9.5l8-3.5M8 14l8-3.5M8 18.5l8-3.5" />
    </IconeProprio>
  )
}

const ICONES = {
  contas: Landmark,
  categorias: Tag,
  cofres: Vault,
  comissoes: HandCoins,
  equipe: Scissors,
  clientes: Bigode,
  agenda: CalendarDays,
  inicio: House,
  titulos: ReceiptText,
  configuracoes: Settings,
  barbearia: PosteBarbeiro,
}

export default function IconeMapa({ name, ...props }) {
  return createElement(ICONES[name] || Tag, { 'aria-hidden': true, ...props })
}
