import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { tokenizePracticeText } from '../lib/practiceText'

type LinkedMention = { token: string; tool: { id: string; name: string } }

/** Only stored links resolve. Unknown hashtags stay literal. */
export function PracticeText({ text, mentions, preview = false }: { text: string; mentions: LinkedMention[]; preview?: boolean }) {
  const linked = new Map(mentions.map(mention => [mention.token.toLowerCase(), mention.tool]))
  const limit = preview && text.length > 240 ? 240 : text.length
  return <span className="practice-text">{tokenizePracticeText(text).filter(token => token.start < limit).map(token => {
    if (token.end > limit) return <Fragment key={token.start}>{text.slice(token.start, limit)}…</Fragment>
    if (token.kind === 'code') {
      const fence = token.text.match(/^`+/)![0].length
      return <code key={token.start}>{token.text.slice(fence, -fence)}</code>
    }
    if (token.kind === 'quote') return <span key={token.start} className="practice-quote">{token.text}</span>
    const tool = token.kind === 'mention' ? linked.get(token.text.toLowerCase()) : undefined
    if (tool) return <Link key={token.start} className="practice-mention" title={tool.name} to={`/tools/${tool.id}`}>{token.text}</Link>
    return <Fragment key={token.start}>{token.text}</Fragment>
  })}</span>
}
