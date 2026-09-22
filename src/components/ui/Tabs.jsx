/** Tabs — conjunto controlado de abas com navegação ARIA por setas, Home e End. */
import { useId, useRef } from 'react'

function Tabs({ items, value, onValueChange, label = 'Seções', className = '', ...props }) {
  const baseId = useId()
  const tabRefs = useRef([])
  const activeIndex = Math.max(0, items.findIndex((item) => item.value === value))

  function selectAt(index) {
    const normalized = (index + items.length) % items.length
    onValueChange(items[normalized].value)
    tabRefs.current[normalized]?.focus()
  }

  function handleKeyDown(event, index) {
    const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    selectAt(keys[event.key])
  }

  return (
    <div className={className} {...props}>
      <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-line">
        {items.map((item, index) => {
          const selected = index === activeIndex
          return (
            <button
              key={item.value}
              ref={(node) => { tabRefs.current[index] = node }}
              id={`${baseId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={[
                'relative min-h-10 shrink-0 px-4 text-body-sm font-semibold transition-colors duration-100 ease-brand',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper',
                selected ? 'text-copper after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-copper' : 'text-steel hover:bg-surface-2 hover:text-warm-white',
              ].join(' ')}
            >
              {item.label}{selected && <span className="sr-only">, selecionada</span>}
            </button>
          )
        })}
      </div>
      {items.map((item, index) => (
        <div
          key={item.value}
          id={`${baseId}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${index}`}
          tabIndex={0}
          hidden={index !== activeIndex}
          className="pt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}

export default Tabs
