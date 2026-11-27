import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ToolEditor } from '../components/ToolEditor'
import { toolFields } from '../lib/toolMatching'
import { CopyCommandButton } from '../components/PracticeCommands'
import { getTool, listToolHistory, listToolPractices, listTools, mergeTools, type CatalogTool, type ToolRevision } from '../lib/catalogService'
import type { Practice } from '../lib/types'
import './tool-catalog.css'

function message(cause: unknown) {
  return cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Could not load the catalog.'
}

function ToolLink({ tool }: { tool: CatalogTool }) {
  return <Link to={`/tools/${tool.id}`} className="tool-row">
    <strong>{tool.name}</strong>
    {tool.description && <p>{tool.description}</p>}
    {(tool.apm_id || tool.repo_url || tool.website_url) && <small>{tool.apm_id || tool.repo_url || tool.website_url}</small>}
  </Link>
}

function Frame({children}: {children: ReactNode}) {
  return <main className="page tool-page"><section className="tool-sheet">{children}</section></main>
}

export function CatalogPage() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<CatalogTool[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let live = true
    setError('')
    const timeout = setTimeout(() => {
      listTools(query.trim()).then(tools => { if(live) setRows(tools) }).catch(cause => { if(live) setError(message(cause)) })
    }, query ? 180 : 0)
    return () => { live = false; clearTimeout(timeout) }
  }, [query,retry])

  return <Frame><Link className="tool-back" to="/">← Practices</Link>
    <div className="tool-heading"><h1>Tool catalog</h1><Link className="primary-as-link" to="/tools/new">New tool</Link></div>
    <label className="tool-search tool-catalog-search"><span>Search the catalog</span><input type="search" value={query} placeholder="Name or package identifier" onChange={e => setQuery(e.target.value)}/></label>
    {error ? <p role="alert">{error} <button onClick={() => setRetry(retry + 1)}>Retry</button></p>
      : rows === null ? <p role="status">Loading tools…</p>
      : rows.length ? <div className="tool-list">{rows.map(tool => <ToolLink key={tool.id} tool={tool}/>)}</div>
      : <p>No matching tools.</p>}
  </Frame>
}

function revisionFields(revision: ToolRevision) {
  const before = revision.before
  const after = revision.after
  return [...toolFields, ['merged_into','Merged into'] as const].filter(([field]) => (before?.[field] ?? null) !== (after?.[field] ?? null))
    .map(([field,label]) => ({ field, label, before: String(before?.[field] ?? ''), after: String(after?.[field] ?? '') }))
}

function History({ revisions }: { revisions: ToolRevision[] }) {
  return <section className="tool-section"><h2>Version history</h2>
    {revisions.length === 0 ? <p className="muted">No revisions recorded.</p> : <ol className="tool-history">{revisions.map(revision =>
      <li key={revision.id}><details><summary><strong>{revision.action.replaceAll('_', ' ')}</strong> · {new Date(revision.created_at).toLocaleString()}</summary>
      <p className="muted">Editor · {revision.editor?.display_name || (revision.editor_id ? 'Unavailable account' : 'Catalog migration')}</p>
      {revision.action === 'merge' && revision.before && revision.before.id !== revision.after.id && <p>Merged from <Link to={`/tools/${revision.before.id}`}>{revision.before.name}</Link></p>}
      <dl>{revisionFields(revision).map(({field,label,before,after}) => <div key={field}><dt>{label}</dt><dd>{before && <del>{before}</del>}{after && (field === 'merged_into' ? <Link to={`/tools/${after}`}>View surviving tool</Link> : <ins>{after}</ins>)}</dd></div>)}</dl>
      </details></li>)}</ol>}
  </section>
}

function MergePanel({tool, onMerged}: {tool: CatalogTool; onMerged: (id: string) => void}) {
  const [query,setQuery] = useState('')
  const [options,setOptions] = useState<CatalogTool[]>([])
  const [target,setTarget] = useState<CatalogTool | null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  useEffect(() => {
    let live = true
    setOptions([])
    if (!query.trim()) return
    const timer = setTimeout(() => {
      listTools(query.trim()).then(results => { if(live) setOptions(results.filter(t => t.id !== tool.id && !t.merged_into)) })
        .catch(cause => { if(live) setError(message(cause)) })
    }, 200)
    return () => { live = false; clearTimeout(timer) }
  },[query,tool.id])
  async function merge() {
    if (!target || busy) return
    setBusy(true)
    try { await mergeTools(tool.id,target.id); onMerged(target.id) }
    catch(cause) { setError(message(cause)); setBusy(false) }
  }
  return <details className="tool-section"><summary>Merge with another tool</summary>
    <label className="tool-search">Find the tool to keep<input type="search" value={query} onChange={e => { setQuery(e.target.value); setTarget(null); setError('') }}/></label>
    {!target && <div className="tool-list">{options.map(t => <button type="button" key={t.id} onClick={() => setTarget(t)}>{t.name} · {t.apm_id || t.slug}</button>)}</div>}
    {target && <div className="tool-merge-confirm"><p>Merge <strong>{tool.name}</strong> into <strong>{target.name}</strong>? Practice references will point to {target.name}. The merge will appear in version history.</p>
      <button type="button" disabled={busy} onClick={() => void merge()}>Confirm merge</button></div>}
    {error && <p role="alert">{error}</p>}
  </details>
}

export function NewToolPage() {
  const navigate = useNavigate()
  return <Frame><Link className="tool-back" to="/tools">← Tool catalog</Link><h1>New tool</h1>
    <ToolEditor onCancel={() => navigate('/tools')} onSaved={tool => navigate(`/tools/${tool.id}`)}/></Frame>
}

export function ToolPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [data,setData] = useState<{ tool: CatalogTool; practices: Practice[]; history: ToolRevision[] } | null>(null)
  const [editing,setEditing] = useState(false)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)
  useEffect(() => {
    let live = true
    setData(null); setError(''); setEditing(false)
    Promise.all([getTool(id),listToolPractices(id),listToolHistory(id)]).then(([tool,practices,history]) => {
      if (!live) return
      if(tool) setData({tool,practices,history})
      else setError('Tool not found.')
    }).catch(cause => { if(live) setError(message(cause)) })
    return () => { live = false }
  },[id,refresh])
  const tool = data?.tool
  return <Frame><Link className="tool-back" to="/tools">← Tool catalog</Link>
    {error && <p role="alert">{error} <button onClick={() => setRefresh(refresh+1)}>Retry</button></p>}
    {!data && !error && <p role="status">Loading tool…</p>}
    {data && tool && (editing ? <><h1>Edit {tool.name}</h1><ToolEditor tool={tool} onCancel={() => setEditing(false)} onSaved={saved => {
      if(saved.id !== id) navigate(`/tools/${saved.id}`)
      else setRefresh(refresh+1)
    }}/></> : <>
      <div className="tool-heading"><h1>{tool.name}</h1>{!tool.merged_into && <button onClick={() => setEditing(true)}>Edit tool</button>}</div>
      {tool.merged_into && <p>This entry was merged. <Link to={`/tools/${tool.merged_into}`}>Open the surviving tool</Link></p>}
      {tool.description && <p className="tool-intro">{tool.description}</p>}
      {tool.apm_id && <p className="tool-package-id"><code>{tool.apm_id}</code></p>}
      <div className="tool-actions">{tool.repo_url && <a href={tool.repo_url} target="_blank" rel="noreferrer">Source ↗</a>}
        {tool.website_url && <a href={tool.website_url} target="_blank" rel="noreferrer">Website ↗</a>}</div>
      {tool.install_command && <section className="tool-section"><h2>Install command</h2><div className="tool-install"><pre><code>{tool.install_command}</code></pre><CopyCommandButton text={tool.install_command} label="Copy install command"/></div></section>}
      <section className="tool-section"><h2>Practices using this tool</h2>{data.practices.length ? data.practices.map(p => <Link key={p.id} to={`/practice/${p.id}`}>{p.title}</Link>) : <p className="muted">No practices cite this tool yet.</p>}</section>
      <History revisions={data.history}/>
      {session && !tool.merged_into && <MergePanel tool={tool} onMerged={id => navigate(`/tools/${id}`)}/>}
    </>)}
  </Frame>
}
