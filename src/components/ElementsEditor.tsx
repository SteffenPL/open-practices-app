import {
  emptyElementDraft,
  emptyOptionDraft,
  type ElementDraft,
} from '../lib/practiceService'

interface Props {
  drafts: ElementDraft[]
  onChange: (drafts: ElementDraft[]) => void
}

type VisibilityChoice = 'none' | 'require' | 'reject'

function choiceFor(draft: ElementDraft, optionId: string): VisibilityChoice {
  if (draft.require_options.includes(optionId)) return 'require'
  if (draft.reject_options.includes(optionId)) return 'reject'
  return 'none'
}

export function ElementsEditor({ drafts, onChange }: Props) {
  const update = (index: number, patch: Partial<ElementDraft>) => {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= drafts.length) return
    const next = [...drafts]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  const setChoice = (
    elementIndex: number,
    optionId: string,
    choice: VisibilityChoice,
  ) => {
    const draft = drafts[elementIndex]
    const require = draft.require_options.filter((id) => id !== optionId)
    const reject = draft.reject_options.filter((id) => id !== optionId)
    if (choice === 'require') require.push(optionId)
    if (choice === 'reject') reject.push(optionId)
    update(elementIndex, {
      require_options: require,
      reject_options: reject,
    })
  }

  const earlierOptions = (index: number) =>
    drafts.slice(0, index).flatMap((draft) =>
      draft.options
        .filter((o) => o.name.trim())
        .map((o) => ({
          id: o.id,
          label: `${draft.name.trim() || 'Element'}: ${o.name.trim()}`,
        })),
    )

  return (
    <div className="elements-editor">
      <label>Elements (optional decision points for readers)</label>
      {drafts.map((draft, index) => (
        <div key={draft.id} className="card element-editor">
          <div className="element-editor-head">
            <input
              value={draft.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="Element name (e.g. Which orchestration skill?)"
            />
            <div className="element-editor-actions">
              <button onClick={() => move(index, -1)} aria-label="Move up">
                ↑
              </button>
              <button onClick={() => move(index, 1)} aria-label="Move down">
                ↓
              </button>
              <button
                className="danger"
                onClick={() =>
                  onChange(drafts.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          </div>
          <textarea
            value={draft.description}
            onChange={(e) => update(index, { description: e.target.value })}
            placeholder="When does this decision matter?"
            rows={2}
          />
          <div className="options-editor">
            {draft.options.map((option, optionIndex) => (
              <div key={option.id} className="option-editor">
                <input
                  value={option.name}
                  onChange={(e) =>
                    update(index, {
                      options: draft.options.map((o, i) =>
                        i === optionIndex
                          ? { ...o, name: e.target.value }
                          : o,
                      ),
                    })
                  }
                  placeholder="Option name (e.g. superpowers)"
                />
                <input
                  value={option.description}
                  onChange={(e) =>
                    update(index, {
                      options: draft.options.map((o, i) =>
                        i === optionIndex
                          ? { ...o, description: e.target.value }
                          : o,
                      ),
                    })
                  }
                  placeholder="When is this the right choice?"
                />
                <button
                  className="danger"
                  onClick={() =>
                    update(index, {
                      options: draft.options.filter(
                        (_, i) => i !== optionIndex,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                update(index, {
                  options: [...draft.options, emptyOptionDraft()],
                })
              }
            >
              Add option
            </button>
          </div>
          {index > 0 && (
            <details className="visibility-rules">
              <summary>Visibility rules</summary>
              {earlierOptions(index).map((option) => (
                <label key={option.id} className="visibility-rule">
                  <span>{option.label}</span>
                  <select
                    value={choiceFor(draft, option.id)}
                    onChange={(e) =>
                      setChoice(
                        index,
                        option.id,
                        e.target.value as VisibilityChoice,
                      )
                    }
                  >
                    <option value="none">always shown</option>
                    <option value="require">show only if picked</option>
                    <option value="reject">hide if picked</option>
                  </select>
                </label>
              ))}
            </details>
          )}
        </div>
      ))}
      <button onClick={() => onChange([...drafts, emptyElementDraft()])}>
        Add element
      </button>
    </div>
  )
}
