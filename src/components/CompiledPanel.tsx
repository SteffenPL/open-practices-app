import { useState } from 'react'
import type { Element } from '../lib/types'
import { compilePractice } from '../lib/compiler'
import type { Selection } from '../lib/visibility'
import { getInstallCommand } from '../pages/guidedPracticeContent'

interface Props {
  elements: Element[]
  selection: Selection
  guidedPractice?: boolean
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

export function CompiledPanel({ elements, selection, guidedPractice = false }: Props) {
  const compiled = compilePractice(elements, selection)
  const guidedCommands = guidedPractice
    ? Array.from(new Set(
      elements.flatMap((element) => element.options
        .map((option) => getInstallCommand(option.description))
        .filter((command): command is string => Boolean(command))),
    )).join('\n')
    : ''

  return (
    <section className="card compiled-panel">
      <h2>{guidedPractice ? 'Install commands' : 'Compiled practice'}</h2>
      <p className="muted">{guidedPractice
        ? 'Copy the commands for every tool in this practice.'
        : 'Generated from your picks — paste this to recreate the session environment.'}</p>
      <div className="compiled-block">
        <div className="compiled-block-head">
          <span className="muted">Terminal</span>
          <CopyButton
            text={guidedPractice ? guidedCommands : compiled.command}
            label="Copy command"
            disabled={guidedPractice ? guidedCommands.length === 0 : compiled.apmIds.length === 0}
          />
        </div>
        <pre>
          <code>{guidedPractice ? guidedCommands || '# add an install command to each tool tab' : compiled.command}</code>
        </pre>
      </div>
      {!guidedPractice && <div className="compiled-block">
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
      </div>}
    </section>
  )
}
