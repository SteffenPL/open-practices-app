import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GitHubSkillsPanel, type GitHubSkillsPanelHandle } from '../components/GitHubSkillsPanel'
import { generateSkillsExport } from '../lib/mySkillsExport'
import { useAuth } from '../auth/useAuth'
import { listTools, type CatalogTool } from '../lib/catalogService'
import { DEFAULT_SKILLS_SETUP_ID, listMySkillsSetups, createMySkillsSetup, renameMySkillsSetup, deleteMySkillsSetup, type MySkillsSetup, loadMySkills, saveMySkills, MySkillsConflictError, type MySkillsConfig } from '../lib/mySkillsService'
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
  if (!session) return <main className="page my-skills"><h1>My setups</h1><p className="skills-intro">Keep a personal collection of packages and skills. Export it as a ZIP, use it with an agent, or connect a GitHub repository.</p><button onClick={() => void signInWithGoogle()}>Continue with Google</button></main>
  return <Setups key={session.user.id} owner={session.user.id}/>
}

function Setups({owner}:{owner:string}) {
  const [search,setSearch]=useSearchParams()
  const [setups,setSetups]=useState<MySkillsSetup[]>([])
  const [visited,setVisited]=useState<string[]>([])
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  const requested=search.get('setup')
  const activeKey='op-active-setup/'+owner
  const active=setups.find(item=>item.id===(requested || preference(activeKey))) ?? setups.find(item=>item.is_default) ?? setups[0]
  const pendingPackage=search.get('add')
  useEffect(()=>{
    let live=true
    setError('')
    listMySkillsSetups().then(rows=>{if(live)setSetups(rows)}).catch(cause=>{if(live)setError(failure(cause))})
    return ()=>{live=false}
  },[retry])
  useEffect(()=>{
    if(active) {
      remember(activeKey,active.id)
      setVisited(ids=>ids.includes(active.id) ? ids : [...ids,active.id])
    }
  },[active,activeKey])
  function select(id:string, clearPackage=false) {
    setSearch(previous=>{
      const next=new URLSearchParams(previous)
      next.set('setup',id)
      if(clearPackage)next.delete('add')
      return next
    })
  }
  return <main className="page my-skills"><h1>My setups</h1>
    <p className="skills-intro">Build an installable collection of catalog packages and your own skills.</p>
    {error && <p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!active && !error && <p role="status">Loading setups…</p>}
    {active && requested && requested!==active.id && <p role="status">That setup is unavailable. Showing {active.name}. <button className="link-like" onClick={()=>select(active.id)}>Use this setup</button></p>}
    {setups.filter(item=>item.id===active?.id || visited.includes(item.id)).map(item=><div key={item.id} hidden={item.id!==active?.id}>
      <SkillsEditor owner={owner} setup={item} setups={setups}
        requestedPackage={item.id===active?.id && (!requested || requested===item.id) ? pendingPackage : null}
        onSelect={select} onConsume={()=>select(item.id,true)}
        onCreated={created=>{setSetups(rows=>[...rows,created]);select(created.id)}}
        onRenamed={renamed=>setSetups(rows=>rows.map(row=>row.id===renamed.id?renamed:row))}
        onDeleted={()=>{setSetups(rows=>rows.filter(row=>row.id!==item.id));select(DEFAULT_SKILLS_SETUP_ID,true)}}/>
    </div>)}
  </main>
}

function SkillsEditor({ owner, setup, setups, requestedPackage, onSelect, onConsume, onCreated, onRenamed, onDeleted }: {
  owner:string;setup:MySkillsSetup;setups:MySkillsSetup[];requestedPackage:string|null;onSelect:(id:string)=>void;onConsume:()=>void
  onCreated:(row:MySkillsSetup)=>void;onRenamed:(row:MySkillsSetup)=>void;onDeleted:()=>void
}) {
  const [manage,setManage]=useState<'create'|'rename'|'delete'|null>(null)
  const [name,setName]=useState('')
  const managementLock=useRef(false)
  const createRequest=useRef<{name:string;id:string}|null>(null)
  const [managing,setManaging]=useState(false)
  const ownerScope=owner+(setup.is_default ? '' : '/setup/'+setup.id)
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
    Promise.all([loadMySkills(setup.id), listTools()]).then(([record,catalog]) => {
      if (!active) return
      const config = record.config
      setConfig(config)
      setBranch(preference('op-branch/'+ownerScope+'/'+config.repo.toLowerCase()) || 'main')
      setSaved(config); setVersion(record.version); setConflict(false)
      setTools(catalog.filter(tool => tool.apm_id && isPackageIdentifier(tool.apm_id)))
      setReady(true)
    }).catch(cause => {if (active) setError(failure(cause))})
    return () => {active = false}
  }, [retry,setup.id,ownerScope])

  const pendingPackage=ready && requestedPackage && isPackageIdentifier(requestedPackage) && tools.some(tool=>tool.apm_id===requestedPackage) ? requestedPackage : null
  useEffect(()=>{
    if (pendingPackage && setups.length===1) {
      setConfig(previous=>previous.selected_packages.includes(pendingPackage) ? previous : {...previous,selected_packages:[...previous.selected_packages,pendingPackage]})
      onConsume()
    }
  },[pendingPackage,setups.length,onConsume])

  async function manageSetup() {
    if (!manage || managementLock.current) return
    managementLock.current=true; setManaging(true);setError('')
    try {
      if (manage==='create') {
        const label=name.trim()
        if (createRequest.current?.name!==label) createRequest.current={name:label,id:crypto.randomUUID()}
        const row=await createMySkillsSetup(label,createRequest.current.id)
        createRequest.current=null
        onCreated(row)
      }
      if (manage==='rename') {const row=await renameMySkillsSetup(setup.id,name.trim(),version);setVersion(row.version);onRenamed(row)}
      if (manage==='delete') {await deleteMySkillsSetup(setup.id,version);onDeleted()}
      setManage(null)
    } catch(cause) {setError(failure(cause));if(cause instanceof MySkillsConflictError)setConflict(true)}
    finally {managementLock.current=false;setManaging(false)}
  }

  const validRepo = isGitHubRepository(config.repo)
  const connection = validRepo ? (token.trim() ? 'Import & publish' : 'Import only') : 'Off'
  const autoKey = 'op-publish-on-save/'+ownerScope+'/'+config.repo.toLowerCase()+'/'+branch
  const publishOnSave = validRepo && !!branch.trim() && !!token.trim() &&
    (autoChoice?.key === autoKey ? autoChoice.enabled : preference(autoKey) === 'on')
  function updateRepo(repo:string) {
    setToken(''); usedCredential.current=false
    setBranch(preference('op-branch/'+ownerScope+'/'+repo.toLowerCase()) || 'main')
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
      const result = await saveMySkills(config,version,setup.id)
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
  return <>
    {!ready && !error && <p role="status">Loading your repository…</p>}
    {error && <p role="alert" className="error">{error} {(!ready || conflict) && <button onClick={() => setRetry(retry+1)}>{conflict ? 'Discard local edits and reload' : 'Retry'}</button>}</p>}
    {ready && <fieldset disabled={busy || syncBusy || managing}>
      <div className="setup-toolbar">
        {setups.length>1 ? <label>Setup <select aria-label="Setup" value={setup.id} onChange={e=>{setManage(null);onSelect(e.target.value)}}>{setups.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
          : <strong>{setup.name}</strong>}
        <button className="link-like" type="button" onClick={()=>{setName('');setManage('create')}}>New setup</button>
        <button className="link-like" type="button" onClick={()=>{setName(setup.name);setManage('rename')}}>Manage setup</button>
      </div>
      {manage && <div className="setup-management">
        {manage==='delete' ? <>
          <p>Delete “{setup.name}” and its local edits from My setups? Files on GitHub are kept.</p>
          <button type="button" onClick={()=>void manageSetup()}>Confirm deletion</button>
        </> : <>
          <label>Setup name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label>
          <button type="button" disabled={!name.trim()} onClick={()=>void manageSetup()}>{manage==='create' ? 'Create setup' : 'Rename setup'}</button>
          {manage==='rename' && !setup.is_default && <button type="button" className="link-like" onClick={()=>setManage('delete')}>Delete setup</button>}
        </>}
        <button type="button" className="link-like" onClick={()=>setManage(null)}>Cancel</button>
      </div>}
      {pendingPackage && setups.length>1 && <div className="setup-package-choice"><p>Add <code>{pendingPackage}</code> to the selected setup?</p>
        <button onClick={()=>{if(!config.selected_packages.includes(pendingPackage))change({...config,selected_packages:[...config.selected_packages,pendingPackage]});onConsume()}}>Add to {setup.name}</button>
        <button className="link-like" onClick={onConsume}>Dismiss</button></div>}
      <section className="collection-connection">
        <div className="connection-heading"><h2>GitHub</h2><span>{connection}</span></div>
        <div className="connection-fields">
          <label>Repository <input type="search" value={config.repo} autoCapitalize="none" spellCheck={false} placeholder="Optional · owner/repository" onChange={e => updateRepo(e.target.value)}/></label>
          {validRepo && <label>Branch<input value={branch} onChange={e => {const next=e.target.value;setBranch(next);remember('op-branch/'+ownerScope+'/'+config.repo.toLowerCase(),next)}} placeholder="main"/></label>}
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
        <Link to={'/agents?'+new URLSearchParams({scope:'my-skills',setup:setup.id})}>API access</Link>
      </div>
      {status && <p role="status">{status}</p>}
      {validRepo && <p className="collection-install">Install from the default branch <code>apm install {config.repo}</code></p>}
      {bundle.problems.map(message => <p key={message} className="muted">{message}</p>)}
    </fieldset>}
  </>
}
