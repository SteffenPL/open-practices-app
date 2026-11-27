import { useEffect, useState } from 'react'
import type { PracticeCommand } from '../pages/guidedPracticeContent'

export function CopyCommandButton({ text, label }: { text: string; label: string }) {
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setFeedback('Copied')
    } catch {
      setFeedback('Select text to copy')
    }
  }

  return <>
    <button type="button" onClick={copy} aria-label={label}>{feedback || 'Copy'}</button>
    <span className="command-feedback" role="status">{feedback}</span>
  </>
}

function CommandRow({ name, command }: PracticeCommand) {
  return <li className="practice-command-row">
    <div className="practice-command-name">{name}</div>
    <div className="practice-command-line">
      <pre><code>{command}</code></pre>
      <CopyCommandButton text={command} label={`Copy command for ${name}`} />
    </div>
  </li>
}

export function PracticeCommands({ commands }: { commands: PracticeCommand[] }) {
  const authored = commands.filter(({ command }) => command.trim())
  if (!authored.length) return null
  return <ul className="practice-commands" aria-label="CLI commands">
    {authored.map((item, index) => <CommandRow key={`${index}:${item.command}`} {...item} />)}
  </ul>
}
