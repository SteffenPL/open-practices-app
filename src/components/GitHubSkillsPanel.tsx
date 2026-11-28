import { useRef, useState } from 'react'
import type { MySkillsConfig } from '../lib/mySkillsService'
import { githubRepositoryURL } from '../lib/skillsRepository'
import { loadGitHubSkills, pushGitHubSkills, type GitHubSkillsSnapshot } from '../lib/githubSkillsSync'
import { importSkillsRepository, planSkillsChanges } from '../lib/skillsSyncPlan'

type Change = ReturnType<typeof planSkillsChanges>[number]
type ImportReview = { snapshot:GitHubSkillsSnapshot; config:MySkillsConfig }

export function GitHubSkillsPanel({config, branch, dirty, onImport}: {
  config:MySkillsConfig; branch:string; dirty:boolean; onImport:(config:MySkillsConfig)=>void
}) {
  const [token,setToken] = useState('')
  const [base,setBase] = useState<GitHubSkillsSnapshot | null>(null)
  const [baseline,setBaseline] = useState<MySkillsConfig>()
  const [incoming,setIncoming] = useState<ImportReview | null>(null)
  const [review,setReview] = useState<{source:string; changes:Change[]} | null>(null)
  const [message,setMessage] = useState('Update my skills collection')
  const [busy,setBusy] = useState(false)
  const lock = useRef(false)
  const [error,setError] = useState('')
  const [commit,setCommit] = useState('')
  const [status,setStatus] = useState('')
  const source = JSON.stringify(config)
  const currentReview = review?.source === source ? review : null

  function reset() {
    setToken(''); setBase(null); setBaseline(undefined); setIncoming(null); setReview(null)
    setError(''); setCommit(''); setStatus('')
  }

  async function load() {
    if (lock.current) return
    lock.current=true; setBusy(true); setError(''); setStatus(''); setReview(null); setIncoming(null); setBase(null)
    try {
      const snapshot = await loadGitHubSkills(config.repo,branch,token.trim() || undefined)
      const imported = importSkillsRepository(config.repo,snapshot.files)
      setIncoming({snapshot,config:imported})
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Could not read this branch.')}
    finally {lock.current=false;setBusy(false)}
  }

  function preview() {
    if (!base) return
    setError(''); setStatus(''); setReview(null)
    try {
      const changes = planSkillsChanges(config,base.files,baseline)
      setReview({source,changes})
      if (!changes.length) setStatus('The repository already matches your collection.')
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Could not prepare the changes.')}
  }

  async function publish() {
    if (!base || !currentReview?.changes.length || !token.trim() || !message.trim() || lock.current) return
    lock.current=true; setBusy(true); setError(''); setStatus('')
    try {
      const files = currentReview.changes.map(({path,after})=>({path,content:after}))
      const sha = await pushGitHubSkills(base,files,message.trim(),token.trim())
      setCommit(githubRepositoryURL(base.repo)+'/commit/'+sha)
      setStatus('Committed to '+base.branch+'.')
      const updated = new Map(base.files.map(file=>[file.path,file]))
      for (const file of files) updated.set(file.path,file)
      const next = {...base,sha,files:[...updated.values()]}
      setBase(next); setBaseline(baseline ? config : undefined); setReview(null)
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Could not commit the reviewed files.'); setReview(null)}
    finally {lock.current=false;setBusy(false)}
  }

  return <details className="skills-github-panel"><summary>Sync with GitHub</summary>
    <fieldset disabled={busy}>
      <label>Fine-grained GitHub token<input type="password" value={token} autoComplete="off" spellCheck={false}
        onChange={e=>{setToken(e.target.value);setError('')}}/></label>
      <a href={'https://github.com/settings/personal-access-tokens/new?'+new URLSearchParams({name:'Open Practices skills',target_name:config.repo.split('/')[0],expires_in:'7',contents:'write'})} target="_blank" rel="noreferrer">Create GitHub token ↗</a>
      <p className="muted">Select only this repository when creating your token. Public branches can be read without a token. For private reads, grant Contents read access to this repository. To commit, grant Contents read and write. The token stays in this tab.</p>
      <div className="skills-actions"><button type="button" onClick={()=>void load()}>Load from GitHub</button>
        {(token || base || incoming) && <button type="button" className="link-like" onClick={reset}>Disconnect</button>}</div>
      {incoming && <div className="skills-sync-review">
        <h3>Review incoming collection</h3>
        <p>{incoming.snapshot.repo} · {incoming.snapshot.branch} · <code>{incoming.snapshot.sha.slice(0,7)}</code></p>
        <p>{incoming.config.selected_packages.length} packages · {incoming.config.drafts.length} authored skills</p>
        <details><summary>Inspect incoming files ({incoming.snapshot.files.length})</summary>
          {incoming.snapshot.files.map(file=><details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}
        </details>
        <p className="muted">{dirty ? 'Importing replaces your unsaved editor changes.' : 'Importing replaces the collection in your editor.'} Save the collection separately to update your account.</p>
        <div className="skills-actions">
          <button type="button" onClick={()=>{onImport(incoming.config);setBase(incoming.snapshot);setBaseline(incoming.config);setIncoming(null);setStatus('Imported into the editor.')}}>
            {dirty ? 'Replace unsaved edits with import' : 'Import into editor'}
          </button>
          <button type="button" onClick={()=>{setBase(incoming.snapshot);setBaseline(undefined);setIncoming(null);setStatus('Kept your editor contents.')}}>Keep my editor contents</button>
        </div>
      </div>}
      {base && <div className="skills-sync-review">
        <p className="muted">Comparing against {base.repo} · {base.branch} · <code>{base.sha.slice(0,7)}</code></p>
        <button type="button" onClick={preview}>Preview changes</button>
        {currentReview && currentReview.changes.length>0 && <>
          <h3>Review commit to {base.branch}</h3>
          {currentReview.changes.map(change=><details key={change.path}><summary>{change.before===null?'Create':'Update'} · {change.path}</summary>
            {change.before!==null && <><h4>Current file</h4><pre>{change.before}</pre></>}
            <h4>Proposed file</h4><pre>{change.after}</pre>
          </details>)}
          <label>Commit message<input value={message} onChange={e=>setMessage(e.target.value)}/></label>
          {!token.trim() && <p className="muted">Enter a token with Contents write access to commit these files.</p>}
          <button type="button" className="primary" disabled={!token.trim() || !message.trim()} onClick={()=>void publish()}>Commit to GitHub</button>
        </>}
      </div>}
    </fieldset>
    {busy && <p role="status">Contacting GitHub…</p>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {commit && <a href={commit} target="_blank" rel="noreferrer">View commit on GitHub ↗</a>}
  </details>
}
