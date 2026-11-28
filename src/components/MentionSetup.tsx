import { Link } from 'react-router-dom'
import type { PracticeMention } from '../lib/mentionService'
import { generateInstallBlock, useInstallOS, type InstallCommands } from '../lib/installCommands'
import { CopyCommandButton } from './PracticeCommands'
import { PracticeText } from './PracticeText'

import { distinctPracticeTools } from '../lib/distinctPracticeTools'

export function InstallList({ mentions, title, overrides }: {
  mentions: PracticeMention[]
  title: string
  overrides?: InstallCommands
}) {
  const [os] = useInstallOS()
  const text = overrides?.[os] ?? generateInstallBlock(mentions, os)
  if (!text.trim()) return null
  return <div className="timeline-cli">
    <pre aria-label="Install list">{text}</pre>
    <CopyCommandButton text={text} label={`Copy commands for ${title}`} />
  </div>
}

export function MentionNotes({ mentions }: { mentions: PracticeMention[] }) {
  const setups = distinctPracticeTools(mentions).filter(mention => mention.notes?.trim())
  if (!setups.length) return null
  return <section className="practice-setup-notes" aria-label="Setup notes">
    <h2>Setup notes</h2>
    {setups.map(mention => <div className="practice-note" key={mention.tool_id}>
      <Link to={`/tools/${mention.tool.id}`}>{mention.tool.name}</Link>
      <p><PracticeText text={mention.notes!} mentions={mentions} /></p>
    </div>)}
  </section>
}
