import { Fragment, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { distinctPracticeTools } from '../lib/distinctPracticeTools'
import { toolURLs } from '../lib/catalogDetails'
import type { LinkedTool } from './ToolMentionLink'
import type { PracticeMention } from '../lib/mentionService'
import type { PracticeToolLink } from '../lib/elementService'
import { mentionInstallCommand, installOSLabels, toolInstallCommand, useInstallOS, type InstallCommands, type InstallOS } from '../lib/installCommands'
import { CopyCommandButton } from './PracticeCommands'
import { InstallOSPicker } from './InstallOSPicker'

function CommandSegment({ text, tools }: {text:string; tools:LinkedTool[]}) {
  const id = useId()
  const [point, setPoint] = useState<{left:number; top:number; above:boolean} | null>(null)
  function show(element: HTMLElement) {
    const bounds = element.getBoundingClientRect()
    const top = Math.min(bounds.bottom, element.closest('pre')!.getBoundingClientRect().bottom)
    const above = top > window.innerHeight / 2
    setPoint({left: Math.max(8, Math.min(bounds.left, window.innerWidth - 264)), top: above ? bounds.top : top, above})
  }
  return <><span tabIndex={0} className="install-segment" aria-describedby={point ? id : undefined}
    onMouseEnter={e => show(e.currentTarget)} onMouseLeave={() => setPoint(null)}
    onFocus={e => show(e.currentTarget)} onBlur={() => setPoint(null)}
    onKeyDown={e => { if (e.key === 'Escape') setPoint(null) }}>{text}</span>
    {point && createPortal(<span id={id} role="tooltip" className="install-segment-info"
      style={{left:point.left, top:point.top, transform:point.above ? 'translateY(-100%)' : undefined}}>
      {tools.map(tool => <span key={tool.id}>{tool.name}<small>{toolURLs(tool)[0]}</small></span>)}
    </span>, document.querySelector('.app-shell') ?? document.body)}</>
}

export function InstallList({ mentions, title, overrides, legacyTools, compact = false }: {
  mentions: PracticeMention[]
  title: string
  overrides?: InstallCommands
  legacyTools?: PracticeToolLink[]
  compact?: boolean
}) {
  const [os] = useInstallOS()
  function segmentsFor(platform: InstallOS) {
    const override = overrides?.[platform]
    if (override !== undefined) return [{text:override, tools:[] as LinkedTool[]}]
    const entries = legacyTools
      ? legacyTools.map(tool => ({tool, text:toolInstallCommand(tool, platform)}))
      : distinctPracticeTools(mentions).map(mention => ({tool:mention.tool, text:mentionInstallCommand(mention, platform)}))
    const sources = new Map<string, LinkedTool[]>()
    for (const {tool, text} of entries) {
      if (!text) continue
      const associated = sources.get(text) ?? []
      if (!associated.some(source => source.id === tool.id)) associated.push(tool)
      sources.set(text, associated)
    }
    return [...sources].map(([text, tools]) => ({text, tools}))
  }
  const segments = segmentsFor(os)
  const text = segments.map(segment => segment.text).join('\n')
  if (!text.trim() && !(Object.keys(installOSLabels) as InstallOS[]).some(platform => segmentsFor(platform).some(segment => segment.text.trim()))) return null
  const lines = text.split(/\r?\n/)
  const clipped = compact && lines.length > 3
  let remaining = compact ? 3 : Infinity
  const visible = segments.flatMap(segment => {
    if (remaining <= 0) return []
    const segmentLines = segment.text.split(/\r?\n/)
    const value = segmentLines.length > remaining ? segmentLines.slice(0, remaining).join('\n') : segment.text
    remaining -= segmentLines.length
    return [{...segment, text:value}]
  })
  return <div className={compact ? 'install-block install-block-compact' : 'install-block'}>
    {text.trim()
      ? <pre aria-label="Install list">{visible.map((segment, index) => <Fragment key={index}>{index > 0 && '\n'}{segment.tools.length
        ? <CommandSegment text={segment.text} tools={segment.tools} /> : segment.text}</Fragment>)}</pre>
      : <p className="install-unavailable">No command for {installOSLabels[os]}</p>}
    <div className="install-block-actions">
      <InstallOSPicker />
      {text.trim() && <CopyCommandButton text={text} label={`Copy ${clipped ? 'all ' : ''}commands for ${title}`} />}
    </div>
  </div>
}
