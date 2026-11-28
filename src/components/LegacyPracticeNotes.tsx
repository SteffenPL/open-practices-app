import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import type { Element, Tool } from '../lib/types'
import { cleanOptionDescription, getInstallCommand } from '../pages/guidedPracticeContent'

function mentionLabel(tool: Tool) {
  return '#' + ('slug' in tool && typeof tool.slug === 'string' && tool.slug ? tool.slug : tool.name)
}

export function LegacyPracticeNotes({ elements }: { elements: Element[] }) {
  if (!elements.length) return null
  return <details className="practice-setup-notes" aria-label="Original practice notes">
    <summary>Original notes</summary>
    {elements.map(element => <section key={element.id}>
      <h3>{element.name}</h3>
      {element.description && <Markdown remarkPlugins={[remarkGfm]}>{element.description}</Markdown>}
      {element.options.map(option => {
        const hasCatalogCommand = option.tool && (
          ('install_command' in option.tool && option.tool.install_command) ||
          Object.values(option.tool.install_commands ?? {}).some(Boolean)
        )
        const command = hasCatalogCommand ? null : getInstallCommand(option.description)
        return <div className="practice-note" key={option.id}>
          <strong>{option.name}</strong>
          {option.tool && <Link className="practice-mention" to={`/tools/${option.tool.id}`}>{mentionLabel(option.tool)}</Link>}
          {command && <pre><code>{command}</code></pre>}
          <Markdown remarkPlugins={[remarkGfm]}>{cleanOptionDescription(option.description)}</Markdown>
        </div>
      })}
    </section>)}
  </details>
}
