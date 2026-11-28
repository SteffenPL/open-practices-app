import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExistingManifest } from '../components/ExistingManifest'
import { useAuth } from '../auth/useAuth'
import { CopyCommandButton } from '../components/PracticeCommands'
import { listTools, type CatalogTool } from '../lib/catalogService'
import { loadMySkills, saveMySkills, MySkillsConflictError, type MySkillsConfig } from '../lib/mySkillsService'
import { buildSkillsRepository, downloadRepositoryFile, githubNewFileURL, githubRepositoryURL, isGitHubRepository, isPackageIdentifier, type RepositoryFile } from '../lib/skillsRepository'
import { downloadRepositoryArchive } from '../lib/skillsArchive'
import './my-skills.css'

const failure = (cause:unknown) => cause instanceof Error ? cause.message : 'Could not complete the request.'
const empty: MySkillsConfig = {repo:'', selected_packages:[], drafts:[]}

function FilePreview({file, repo, branch}: {file:RepositoryFile; repo:string; branch:string}) {
  const editor = githubNewFileURL(repo, file, branch)
  const emptyEditor = !editor && githubNewFileURL(repo,{...file,content:''},branch)
  const existingFile = (editor || emptyEditor) && githubRepositoryURL(repo) + '/edit/' +
    [...branch.split('/'), ...file.path.split('/')].map(encodeURIComponent).join('/')
  return <details className="skills-file">
    <summary>{file.path}</summary>
    <pre>{file.content}</pre>
    <div className="skills-actions">
      <button type="button" onClick={() => downloadRepositoryFile(file)}>Download file</button>
      <CopyCommandButton text={file.content} label={'Copy '+file.path}/>
      {(editor || emptyEditor) && <a href={editor || emptyEditor || undefined} target="_blank" rel="noreferrer">{editor ? 'Create file on GitHub ↗' : 'Open empty editor ↗'}</a>}
      {existingFile && <a href={existingFile} target="_blank" rel="noreferrer">Edit existing file ↗</a>}
    </div>
  </details>
}

function generate(config:MySkillsConfig) {
  const base = buildSkillsRepository(config.repo, config.selected_packages)
  const files: RepositoryFile[] = [base.manifest]
  const problems:string[] = []
  for (const [index,draft] of config.drafts.entries()) {
    try {
      const {skill} = buildSkillsRepository(config.repo,config.selected_packages,{name:draft.name,description:draft.description,instructions:draft.body})
      if (skill) {
        if (files.some(file => file.path === skill.path)) throw new Error('Give each skill a different name.')
        files.push(skill)
      }
    } catch(cause) {problems.push(`Skill ${index+1} · ${failure(cause)}`)}
  }
  return {files,problems}
}

function RepositoryPrivacy() {
  return <p className="muted">Choose Private on GitHub to limit access. Each person installing a private collection needs read access to the repository and its private dependencies.</p>
}

export function MySkillsPage() {
  const {session, loading, signInWithGoogle} = useAuth()
  if (loading) return <main className="page" role="status">Loading account…</main>
  if (!session) return <main className="page my-skills"><h1>My skills</h1><p className="skills-intro">Select catalog packages, write your own skills, then review and commit the generated files to your GitHub repository.</p><RepositoryPrivacy/><button onClick={() => void signInWithGoogle()}>Continue with Google</button></main>
  return <SkillsEditor key={session.user.id}/>
}

function SkillsEditor() {
  const [search] = useSearchParams()
  const requestedPackage = search.get('add')
  const [branch,setBranch] = useState('main')
  const [conflict,setConflict] = useState(false)
  const [config,setConfig] = useState<MySkillsConfig>(empty)
  const [saved,setSaved] = useState<MySkillsConfig>(empty)
  const [version,setVersion] = useState(0)
  const [tools,setTools] = useState<CatalogTool[]>([])
  const [query,setQuery] = useState('')
  const [ready,setReady] = useState(false)
  const [busy,setBusy] = useState(false)
  const [retry,setRetry] = useState(0)
  const [status,setStatus] = useState('')
  const [error,setError] = useState('')
  useEffect(() => {
    let active = true
    setError(''); setReady(false)
    Promise.all([loadMySkills(), listTools()]).then(([record,catalog]) => {
      if (!active) return
      const preselect = requestedPackage && catalog.some(tool => tool.apm_id === requestedPackage) && isPackageIdentifier(requestedPackage)
      const config = record.config
      setConfig(preselect && !config.selected_packages.includes(requestedPackage)
        ? {...config, selected_packages:[...config.selected_packages,requestedPackage]} : config)
      setSaved(config); setVersion(record.version); setConflict(false)
      setTools(catalog.filter(tool => tool.apm_id && isPackageIdentifier(tool.apm_id)))
      setReady(true)
    }).catch(cause => {if (active) setError(failure(cause))})
    return () => {active = false}
  }, [retry,requestedPackage])

  async function save() {
    setBusy(true); setError(''); setStatus('')
    try {
      const result = await saveMySkills(config,version)
      setVersion(result.version); setSaved(result.config); setConfig(result.config); setStatus('Saved to your account.')
    } catch (cause) { setError(failure(cause)); setConflict(cause instanceof MySkillsConflictError) }
    finally { setBusy(false) }
  }
  function change(next:MySkillsConfig) {
    setConfig(next); setStatus(''); if (!conflict) setError('')
  }
  function toggle(id:string) {
    change({...config, selected_packages:config.selected_packages.includes(id) ? config.selected_packages.filter(item => item !== id) : [...config.selected_packages,id]})
  }
  function updateDraft(id:string, field:'name'|'description'|'body', value:string) {
    change({...config, drafts:config.drafts.map(draft => draft.id===id ? {...draft,[field]:value} : draft)})
  }
  const packages = new Map(tools.map(tool => [tool.apm_id!,tool.name]))
  for (const id of config.selected_packages) if (!packages.has(id)) packages.set(id,id)
  const term = query.trim().toLowerCase()
  const filtered = [...packages].filter(([id,name]) => (id+' '+name).toLowerCase().includes(term))
  const validRepo = isGitHubRepository(config.repo)
  let bundle:ReturnType<typeof generate> | undefined
  let problem = ''
  if (validRepo) {
    try {bundle=generate(config)} catch(cause) {problem=failure(cause)}
  } else if (config.repo) problem='Enter your GitHub owner and repository as owner/repository.'
  const changed = JSON.stringify(saved) !== JSON.stringify(config)
  return <main className="page my-skills">
    <h1>My skills</h1>
    <p className="skills-intro">Build an installable collection of catalog packages and your own skills.</p>
    {!ready && !error && <p role="status">Loading your repository…</p>}
    {error && <p role="alert" className="error">{error} {(!ready || conflict) && <button onClick={() => setRetry(retry+1)}>{conflict ? 'Discard local edits and reload' : 'Retry'}</button>}</p>}
    {ready && <fieldset disabled={busy}>
      <section><h2>Repository</h2>
        <label>GitHub owner/repository<input value={config.repo} autoCapitalize="none" spellCheck={false} placeholder="octocat/my-skills" onChange={e => change({...config,repo:e.target.value})}/></label>
        <RepositoryPrivacy/>
        {validRepo && <div className="skills-actions">
          <a href={githubRepositoryURL(config.repo)} target="_blank" rel="noreferrer">View repository ↗</a>
          <a href={'https://github.com/new?'+new URLSearchParams({owner:config.repo.split('/')[0],name:config.repo.split('/')[1]})} target="_blank" rel="noreferrer">Create repository ↗</a>
        </div>}
      </section>
      <section><h2>Catalog packages</h2>
        <label>Find a package<input type="search" placeholder="Search names or package identifiers" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="skills-packages">{filtered.map(([id,name]) => <label key={id}>
          <input type="checkbox" checked={config.selected_packages.includes(id)} onChange={() => toggle(id)}/>
          <span><strong>{name}</strong><code>{id}</code></span>
        </label>)}{filtered.length === 0 && <p>No matching packages.</p>}</div>
        {config.selected_packages.length > 0 && <p className="muted">{config.selected_packages.length} selected</p>}
      </section>
      <section><h2>Your skills</h2>
        {config.drafts.map((draft,index) => <div className="skills-draft" key={draft.id}>
          <label>Skill name<input value={draft.name} placeholder="review-notes" aria-label={'Skill name '+(index+1)} onChange={e => updateDraft(draft.id,'name',e.target.value)}/></label>
          <label>Description<input value={draft.description} placeholder="When should someone use this skill?" onChange={e => updateDraft(draft.id,'description',e.target.value)}/></label>
          <label>Instructions<textarea rows={5} value={draft.body} placeholder="Write the steps in Markdown" onChange={e => updateDraft(draft.id,'body',e.target.value)}/></label>
          <button type="button" className="link-like" onClick={() => change({...config,drafts:config.drafts.filter(item => item.id!==draft.id)})}>Remove skill</button>
        </div>)}
        <button type="button" onClick={() => change({...config,drafts:[...config.drafts,{id:crypto.randomUUID(),name:'',description:'',body:''}]})}>Add a skill</button>
      </section>
      <div className="skills-actions"><button className="primary" disabled={!changed || busy || conflict} onClick={() => void save()}>{busy?'Saving…':'Save collection'}</button>{status && <span role="status">{status}</span>}</div>
      {problem && <p role="status" className="muted">{problem}</p>}
      {bundle?.problems.map(message => <p key={message} className="muted">{message}</p>)}
      {bundle && <section><h2>Repository files</h2>
        <p>Review each file, then commit it on GitHub. For an existing apm.yml, merge the dependencies into your manifest and keep its other settings.</p>
        <label>GitHub branch<input value={branch} onChange={e => setBranch(e.target.value)} placeholder="main"/></label>
        {bundle.files.map(file => <FilePreview key={file.path} file={file} repo={config.repo} branch={branch}/>)}
        <button type="button" onClick={() => downloadRepositoryArchive(config.repo,bundle.files)}>Download repository files (.zip)</button>
        <ExistingManifest repository={config.repo} packages={config.selected_packages} branch={branch}/>
        <h3>Install after committing</h3><div className="skills-install"><code>apm install {config.repo}</code><CopyCommandButton text={'apm install '+config.repo} label="Copy install command"/></div>
      </section>}
    </fieldset>}
  </main>
}
