import { useState } from 'react'
import type { Element } from '../lib/types'
import { compilePractice } from '../lib/compiler'
import type { Selection } from '../lib/visibility'

interface Props {
  elements: Element[]
  selection: Selection
}

function CopyButton({
  text,
  label,
  disabled,
}: {
  text: string
  label: string
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      disabled={disabled}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? 'Copied!' : label}
    </button>
  )
}

export function CompiledPanel({ elements, selection }: Props) {
  const compiled = compilePractice(elements, selection)

  return (
    <section className="card compiled-panel">
      <h2>Compiled practice</h2>
      <p className="muted">
        Generated from your picks — paste this to recreate the session
        environment.
      </p>
      <div className="compiled-block">
        <div className="compiled-block-head">
          <span className="muted">Terminal</span>
          <CopyButton
            text={compiled.command}
            label="Copy command"
            disabled={compiled.apmIds.length === 0}
          />
        </div>
        <pre>
          <code>{compiled.command}</code>
        </pre>
      </div>
      <div className="compiled-block">
        <div className="compiled-block-head">
          <span className="muted">apm.yml</span>
          <CopyButton
            text={compiled.yaml}
            label="Copy YAML"
            disabled={compiled.apmIds.length === 0}
          />
        </div>
        <pre>
          <code>{compiled.yaml}</code>
        </pre>
      </div>
    </section>
  )
}
