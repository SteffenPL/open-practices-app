import { useState } from 'react'
import type { Element } from '../lib/types'
import { visibleElements, type Selection } from '../lib/visibility'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cleanOptionDescription, getInstallCommand } from '../pages/guidedPracticeContent'

interface Props {
  elements: Element[]
  selection: Selection
  onSelect: (elementId: string, optionId: string) => void
  guidedPractice?: boolean
}

export function ElementsReader({ elements, selection, onSelect, guidedPractice = false }: Props) {
  const visible = visibleElements(elements, selection)

  if (elements.length === 0) return null

  return (
    <section className="elements-reader">
      <h2>{guidedPractice ? 'Tools for this practice' : 'Elements'}</h2>
      {visible.map((element) => (
        <div key={element.id} className="card element-card">
          {!guidedPractice && <h3>{element.name}</h3>}
          {element.description && <p className="muted">{element.description}</p>}
          {guidedPractice
            ? <OptionTabs element={element} selectedId={selection[element.id]} onSelect={onSelect} />
            : <LegacyOptions element={element} selection={selection} onSelect={onSelect} />}
        </div>
      ))}
      {visible.length === 0 && (
        <p className="muted">No elements visible with your current picks.</p>
      )}
    </section>
  )
}

function LegacyOptions({ element, selection, onSelect }: { element: Element; selection: Selection; onSelect: Props['onSelect'] }) {
  return <div className="option-cards">
    {element.options.map((option) => {
      const selected = selection[element.id] === option.id
      return <label key={option.id} className={`option-card${selected ? ' selected' : ''}`}>
        <input type="radio" name={element.id} checked={selected} onChange={() => onSelect(element.id, option.id)} />
        <span className="option-card-name">{option.name}</span>
        {option.description && <span className="option-card-desc">{option.description}</span>}
        {option.tool && <span className="option-card-tool">📦 {option.tool.name}{option.tool.apm_id && <code>{option.tool.apm_id}</code>}</span>}
      </label>
    })}
  </div>
}

function OptionTabs({ element, selectedId, onSelect }: { element: Element; selectedId?: string; onSelect: Props['onSelect'] }) {
  const initial = element.options.find((option) => option.id === selectedId)?.id ?? element.options[0]?.id ?? ''
  const [activeId, setActiveId] = useState(initial)
  const active = element.options.find((option) => option.id === selectedId)
    ?? element.options.find((option) => option.id === activeId)
    ?? element.options[0]

  if (element.options.length === 0) return null
  return <div className="practice-option-tabs">
    <div className="practice-option-tab-list" role="tablist" aria-label={`${element.name} options`}>
      {element.options.map((option) => {
        const isActive = active?.id === option.id
        return <button key={option.id} type="button" role="tab" aria-selected={isActive} className={isActive ? 'is-active' : ''} onClick={() => { setActiveId(option.id); onSelect(element.id, option.id) }}>{option.name}</button>
      })}
    </div>
    {active && <div className="practice-option-tab-panel" role="tabpanel">
      {active.tool && <p className="practice-option-tool">{active.tool.name}</p>}
      {getInstallCommand(active.description) && <pre className="practice-option-command"><code>{getInstallCommand(active.description)}</code></pre>}
      <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm]}>{cleanOptionDescription(active.description)}</Markdown></div>
    </div>}
  </div>
}
