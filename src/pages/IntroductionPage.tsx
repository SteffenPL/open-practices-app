import { useEffect, useState } from 'react'
import { ToolMentionLink } from '../components/ToolMentionLink'
import { listTools, type CatalogTool } from '../lib/catalogService'
import { Link } from 'react-router-dom'
import { CopyCommandButton } from '../components/PracticeCommands'
import './introduction.css'

const examples = [
  { task: 'Shape an idea', tools: ['mattpocock/skills', 'Superpowers'], note: 'Have an agent question a plan before writing code.' },
  { task: 'Work with a document', tools: ['PDF', 'Word Documents', 'Spreadsheets'], note: 'Extract a table, revise a draft, or check a calculation.' },
  { task: 'Check your work', tools: ['Code Review', 'Playwright'], note: 'Review a change and try the interface a reader will see.' },
]

export function IntroductionPage() {
  const [catalog, setCatalog] = useState<CatalogTool[]>([])
  useEffect(() => {
    let active = true
    void listTools().then(tools => { if (active) setCatalog(tools) }).catch(() => {})
    return () => { active = false }
  }, [])
  function toolLink(name: string, label = name) {
    const tool = catalog.find(entry => entry.apm_id === name || entry.name.toLowerCase() === name.toLowerCase())
    return tool ? <ToolMentionLink key={name} tool={tool}>{label}</ToolMentionLink>
      : <Link key={name} to={'/tools?q='+encodeURIComponent(name)}>{label}</Link>
  }
  const command = 'apm install mattpocock/skills'
  return <main className="intro-page">
    <h1>Introduction</h1>
    <p className="intro-lead">A practice is a short account of how you work. Share the part someone else can try.</p>
    <section className="intro-example">
      <h2>A practice in two sentences</h2>
      <blockquote>Before I commit to a design, I use {toolLink('mattpocock/skills', '#mattpocock/skills::grill-me')}. I ask it to challenge one decision at a time and keep the answers in my project notes.</blockquote>
      <p>With Agent Package Manager (APM), install the whole collection once. The part after <code>::</code> names the command used in the practice.</p>
      <div className="intro-command"><pre>{command}</pre><CopyCommandButton text={command} label="Copy the Matt Pocock skills install command" /></div>
    </section>
    <section className="intro-outline"><h2>Tools to start with</h2>
      {examples.map(({task,note,tools}) => <div className="intro-row" key={task}>
        <div><h3>{task}</h3><p>{note}</p></div>
        <div className="intro-links">{tools.map(tool => toolLink(tool))}</div>
      </div>)}
    </section>
    <div className="intro-next"><Link to="/new" className="primary-as-link">Write a practice</Link><Link to="/my-skills">Build your own skills collection</Link><Link to="/agents">Use an agent →</Link></div>
  </main>
}
