import { useState } from 'react'
import {
  emptyElementDraft,
  emptyOptionDraft,
  type ElementDraft,
} from '../lib/elementService'
import type { Tool } from '../lib/types'

interface Props {
  drafts: ElementDraft[]
  onChange: (drafts: ElementDraft[]) => void
  toolsById: Record<string, Tool>
  linkTool: (identifier: string) => Promise<Tool>
}

type VisibilityChoice = 'none' | 'require' | 'reject'

function choiceFor(draft: ElementDraft, optionId: string): VisibilityChoice {
  if (draft.require_options.includes(optionId)) return 'require'
  if (draft.reject_options.includes(optionId)) return 'reject'
  return 'none'
}

export function ElementsEditor({ drafts, onChange, toolsById, linkTool }: Props) {
  const update = (index: number, patch: Partial<ElementDraft>) => {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  const updateOption = (
    elementIndex: number,
    optionIndex: number,
    patch: Partial<ElementDraft['options'][number]>,
  ) => {
    const draft = drafts[elementIndex]
    update(elementIndex, {
      options: draft.options.map((o, i) =>
        i === optionIndex ? { ...o, ...patch } : o,
      ),
    })
  }

  const moveOption = (elementIndex: number, optionIndex: number, delta: number) => {
    const draft = drafts[elementIndex]
    const target = optionIndex + delta
    if (target < 0 || target >= draft.options.length) return
    const options = [...draft.options]
    const [item] = options.splice(optionIndex, 1)
    options.splice(target, 0, item)
    update(elementIndex, { options })
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
                    updateOption(index, optionIndex, { name: e.target.value })
                  }
                  placeholder="Option name (e.g. superpowers)"
                />
                <input
                  value={option.description}
                  onChange={(e) =>
                    updateOption(index, optionIndex, {
                      description: e.target.value,
                    })
                  }
                  placeholder="When is this the right choice?"
                />
                <div className="option-editor-actions">
                  <button
                    onClick={() => moveOption(index, optionIndex, -1)}
                    aria-label="Move option up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveOption(index, optionIndex, 1)}
                    aria-label="Move option down"
                  >
                    ↓
                  </button>
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
                <ToolLinker
                  option={option}
                  tool={option.tool_id ? toolsById[option.tool_id] : undefined}
                  onLink={async (identifier) => {
                    const tool = await linkTool(identifier)
                    updateOption(index, optionIndex, { tool_id: tool.id })
                  }}
                  onUnlink={() =>
                    updateOption(index, optionIndex, { tool_id: null })
                  }
                />
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

function ToolLinker({
  option,
  tool,
  onLink,
  onUnlink,
}: {
  option: { name: string }
  tool: Tool | undefined
  onLink: (identifier: string) => Promise<void>
  onUnlink: () => void
}) {
  const [identifier, setIdentifier] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (tool) {
    return (
      <span className="tool-chip">
        <strong>{tool.name}</strong>
        {tool.apm_id && <code>{tool.apm_id}</code>}
        <button className="link-like" onClick={onUnlink}>
          unlink
        </button>
      </span>
    )
  }

  return (
    <span className="tool-linker">
      <input
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="APM id or owner/repo"
        aria-label={`Tool identifier for ${option.name || 'option'}`}
      />
      <button
        disabled={busy || !identifier.trim()}
        onClick={() => {
          setBusy(true)
          setError(null)
          onLink(identifier)
            .catch((e) =>
              setError(e instanceof Error ? e.message : 'Lookup failed'),
            )
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Linking…' : 'Link tool'}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  )
}
