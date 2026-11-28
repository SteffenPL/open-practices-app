import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toolURLs } from '../lib/catalogDetails'
import './tool-mention.css'

export type LinkedTool = {id:string; name:string; urls?:string[]; website_url?:string|null; repo_url?:string|null}

export function ToolMentionLink({tool, children}: {tool:LinkedTool; children:ReactNode}) {
  const info = useId()
  const [left, setLeft] = useState<number | null>(null)
  const url = toolURLs(tool)[0]
  function show(link: HTMLElement) {
    const rect = link.getBoundingClientRect()
    const width = Math.min(256, window.innerWidth - 24)
    setLeft(Math.min(Math.max(rect.left, 12), window.innerWidth - width - 12) - rect.left)
  }
  return <span className="tool-mention-reference"
    onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setLeft(null)}
    onFocus={event => show(event.currentTarget)} onBlur={() => setLeft(null)}
    onKeyDown={event => { if (event.key === 'Escape') setLeft(null) }}>
    <Link className="practice-mention" aria-describedby={info} to={`/tools/${tool.id}`}>{children}</Link>
    <span className="tool-mention-info" role="tooltip" id={info} hidden={left === null} style={{left:left ?? 0}}>
      {tool.name}{url && <small>{url}</small>}
    </span>
  </span>
}
