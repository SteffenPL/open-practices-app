import type { Element } from '../lib/types'
import { visibleElements, type Selection } from '../lib/visibility'

interface Props {
  elements: Element[]
  selection: Selection
  onSelect: (elementId: string, optionId: string) => void
}

export function ElementsReader({ elements, selection, onSelect }: Props) {
  const visible = visibleElements(elements, selection)

  if (elements.length === 0) return null

  return (
    <section className="elements-reader">
      <h2>Elements</h2>
      {visible.map((element) => (
        <div key={element.id} className="card element-card">
          <h3>{element.name}</h3>
          {element.description && <p className="muted">{element.description}</p>}
          <div className="option-cards">
            {element.options.map((option) => {
              const selected = selection[element.id] === option.id
              return (
                <label
                  key={option.id}
                  className={`option-card${selected ? ' selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={element.id}
                    checked={selected}
                    onChange={() => onSelect(element.id, option.id)}
                  />
                  <span className="option-card-name">{option.name}</span>
                  {option.description && (
                    <span className="option-card-desc">
                      {option.description}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {visible.length === 0 && (
        <p className="muted">No elements visible with your current picks.</p>
      )}
    </section>
  )
}
