import { Fragment } from 'react'
import { ToolMentionLink, type LinkedTool } from './ToolMentionLink'
import { tokenizePracticeText } from '../lib/practiceText'

type LinkedMention = { token: string; tool: LinkedTool }

/** Only stored links resolve. Unknown hashtags stay literal. */
export function PracticeText({ text, mentions, preview = false }: { text: string; mentions: LinkedMention[]; preview?: boolean }) {
  const linked = new Map(mentions.map(mention => [mention.token, mention.tool]))
  const limit = preview && text.length > 240 ? 240 : text.length
  return <span className="practice-text">{tokenizePracticeText(text).filter(token => token.start < limit).map(token => {
    if (token.end > limit) return <Fragment key={token.start}>{text.slice(token.start, limit)}…</Fragment>
    if (token.kind === 'code') {
      const fence = token.text.match(/^`+/)![0].length
      return <code key={token.start}>{token.text.slice(fence, -fence)}</code>
    }
    if (token.kind === 'quote') return <span key={token.start} className="practice-quote">{token.text}</span>
    const tool = token.kind === 'mention' ? linked.get(token.text) : undefined
    if (tool) return <ToolMentionLink key={token.start} tool={tool}>{token.text}</ToolMentionLink>
    return <Fragment key={token.start}>{token.text}</Fragment>
  })}</span>
}
