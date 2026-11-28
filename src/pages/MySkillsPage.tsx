import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GitHubSkillsPanel, type GitHubSkillsPanelHandle } from '../components/GitHubSkillsPanel'
import { generateSkillsExport } from '../lib/mySkillsExport'
import { useAuth } from '../auth/useAuth'
import { listTools, type CatalogTool } from '../lib/catalogService'
import { loadMySkills, saveMySkills, MySkillsConflictError, type MySkillsConfig } from '../lib/mySkillsService'
import { isGitHubRepository, isPackageIdentifier } from '../lib/skillsRepository'
import { downloadRepositoryArchive } from '../lib/skillsArchive'
import './my-skills.css'

const failure = (cause:unknown) => cause instanceof Error ? cause.message : 'Could not complete the request.'
const empty: MySkillsConfig = {repo:'', selected_packages:[], drafts:[]}

function preference(key:string) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function remember(key:string,value:string) {
  try { window.localStorage.setItem(key,value) } catch { /* Keep settings usable in this tab. */ }
}

export function MySkillsPage() {
  const {session, loading, signInWithGoogle} = useAuth()
  if (loading) return <main className="page" role="status">Loading account…</main>
  if (!session) return <main className="page my-skills"><h1>My skills</h1><p className="skills-intro">Keep a personal collection of packages and skills. Export it as a ZIP, use it with an agent, or connect a GitHub repository.</p><button onClick={() => void signInWithGoogle()}>Continue with Google</button></main>
  return <SkillsEditor key={session.user.id} owner={session.user.id}/>
}

function SkillsEditor({ owner }: {owner:string}) {
  const [search] = useSearchParams()
  const requestedPackage = search.get('add')
  const [branch,setBranch] = useState('main')
  const [token,setToken] = useState('')
  const [credentialEpoch,setCredentialEpoch] = useState(0)
  const usedCredential = useRef(false)
  const [syncBusy,setSyncBusy] = useState(false)
  const saving = useRef(false)
  const panel = useRef<GitHubSkillsPanelHandle>(null)
  const [autoChoice,setAutoChoice] = useState<{key:string;enabled:boolean} | null>(null)
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
      setBranch(preference('op-branch/'+owner+'/'+config.repo.toLowerCase()) || 'main')
      setSaved(config); setVersion(record.version); setConflict(false)
      setTools(catalog.filter(tool => tool.apm_id && isPackageIdentifier(tool.apm_id)))
      setReady(true)
    }).catch(cause => {if (active) setError(failure(cause))})
    return () => {active = false}
  }, [retry,requestedPackage,owner])

  const validRepo = isGitHubRepository(config.repo)
  const connection = validRepo ? (token.trim() ? 'Import & publish' : 'Import only') : 'Off'
  const autoKey = 'op-publish-on-save/'+owner+'/'+config.repo.toLowerCase()+'/'+branch
  const publishOnSave = validRepo && !!branch.trim() && !!token.trim() &&
    (autoChoice?.key === autoKey ? autoChoice.enabled : preference(autoKey) === 'on')
  function updateRepo(repo:string) {
    setToken(''); usedCredential.current=false
    setBranch(preference('op-branch/'+owner+'/'+repo.toLowerCase()) || 'main')
    change({...config,repo})
  }
  function updateToken(value:string) {
    if (usedCredential.current && value !== token) {
      setCredentialEpoch(epoch=>epoch+1)
      usedCredential.current=false
    }
    setToken(value)
  }
  function syncActivity(active:boolean) {
    if (active && token.trim()) usedCredential.current=true
    setSyncBusy(active)
  }
  async function save() {
    if (saving.current || syncBusy) return
    saving.current=true
    setBusy(true); setError(''); setStatus('')
    try {
      const result = await saveMySkills(config,version)
      setVersion(result.version); setSaved(result.config); setConfig(result.config); setStatus('Saved to your account.')
      if (publishOnSave && panel.current) {
        try { await panel.current.syncSaved(result.config) }
        catch { setStatus('Saved to your account. GitHub has not been updated.') }
      }
    } catch (cause) { setError(failure(cause)); setConflict(cause instanceof MySkillsConflictError) }
    finally { saving.current=false; setBusy(false) }
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
  const bundle = generateSkillsExport(validRepo ? config : {...config,repo:''})
  const changed = JSON.stringify(saved) !== JSON.stringify(config)
  return <main className="page my-skills">
    <h1>My skills</h1>
    <p className="skills-intro">Build an installable collection of catalog packages and your own skills.</p>
    {!ready && !error && <p role="status">Loading your repository…</p>}
    {error && <p role="alert" className="error">{error} {(!ready || conflict) && <button onClick={() => setRetry(retry+1)}>{conflict ? 'Discard local edits and reload' : 'Retry'}</button>}</p>}
    {ready && <fieldset disabled={busy || syncBusy}>
      <section className="collection-connection">
        <div className="connection-heading"><h2>GitHub</h2><span>{connection}</span></div>
        <div className="connection-fields">
          <label>Repository <input type="search" value={config.repo} autoCapitalize="none" spellCheck={false} placeholder="Optional · owner/repository" onChange={e => updateRepo(e.target.value)}/></label>
          {validRepo && <label>Branch<input value={branch} onChange={e => {const next=e.target.value;setBranch(next);remember('op-branch/'+owner+'/'+config.repo.toLowerCase(),next)}} placeholder="main"/></label>}
        </div>
        {!config.repo && <p className="muted">Leave this empty to use ZIP downloads or the API.</p>}
        {config.repo && !validRepo && <p className="muted">Enter the repository as owner/repository.</p>}
        {validRepo && <>
          <label>GitHub token <input type="password" value={token} onChange={e=>updateToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Optional · enable private access and publishing"/></label>
          <p className="muted">Public imports work without a token. To publish, use a token with Contents write access to this repository. It stays in this tab. <a target="_blank" rel="noreferrer" href={'https://github.com/settings/personal-access-tokens/new?'+new URLSearchParams({name:'Open Practices skills',target_name:config.repo.split('/')[0],expires_in:'7',contents:'write'})}>Create a token ↗</a></p>
          {branch.trim() && <GitHubSkillsPanel key={JSON.stringify([config.repo,branch,credentialEpoch])} ref={panel} config={config} branch={branch} token={token.trim()} dirty={changed} onImport={change}
            autoSync={publishOnSave} onAutoSyncChange={enabled=>{remember(autoKey,enabled?'on':'off');setAutoChoice({key:autoKey,enabled})}} onBusyChange={syncActivity}/>}
        </>}
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
      <div className="skills-actions collection-actions">
        <button className="primary" disabled={!changed || busy || conflict} onClick={() => void save()}>{busy?'Saving…':publishOnSave?'Save and publish':'Save collection'}</button>
        <button type="button" disabled={bundle.problems.length>0} onClick={() => downloadRepositoryArchive(validRepo?config.repo:'',bundle.files)}>Download ZIP</button>
        <Link to="/agents?scope=my-skills">API access</Link>
      </div>
      {status && <p role="status">{status}</p>}
      {validRepo && <p className="collection-install">Install from the default branch <code>apm install {config.repo}</code></p>}
      {bundle.problems.map(message => <p key={message} className="muted">{message}</p>)}
    </fieldset>}
  </main>
}
