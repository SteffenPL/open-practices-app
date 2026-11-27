import { useEffect, useState } from 'react'

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
