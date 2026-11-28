import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { MySkillsConfig } from '../lib/mySkillsService'
import { githubRepositoryURL } from '../lib/skillsRepository'
import { loadGitHubSkills, pushGitHubSkills, type GitHubSkillsSnapshot } from '../lib/githubSkillsSync'
import { importSkillsRepository, planSkillsChanges } from '../lib/skillsSyncPlan'
import './github-skills-panel.css'

export interface GitHubSkillsPanelHandle {
  syncSaved(config:MySkillsConfig): Promise<void>
}

interface Props {
  config:MySkillsConfig
  branch:string
  token:string
  dirty:boolean
  onImport:(config:MySkillsConfig)=>void
  autoSync:boolean
  onAutoSyncChange:(enabled:boolean)=>void
  busy?:boolean
  onBusyChange?:(busy:boolean)=>void
}

export const GitHubSkillsPanel = forwardRef<GitHubSkillsPanelHandle,Props>(function GitHubSkillsPanel({
  config, branch, token, dirty, onImport, autoSync, onAutoSyncChange, busy, onBusyChange,
}, ref) {
  const source = useRef<GitHubSkillsSnapshot | null>(null)
  const baseline = useRef<MySkillsConfig | undefined>(undefined)
  const lock = useRef(false)
  const autoPaused = useRef(false)
  const [operation,setOperation] = useState('')
  const [error,setError] = useState('')
  const [status,setStatus] = useState('')
  const [commit,setCommit] = useState('')
  const credential = token.trim()

  function begin(name:string) {
    if (lock.current) throw new Error('A GitHub operation is already in progress.')
    lock.current=true
    setOperation(name); setError(''); setStatus(''); setCommit(''); onBusyChange?.(true)
  }

  function finish() {
    lock.current=false
    setOperation(''); onBusyChange?.(false)
  }

  async function pull() {
    if (lock.current || (dirty && !window.confirm('Replace your unsaved editor changes with the collection on GitHub?'))) return
    begin('Pulling from GitHub…')
    try {
      const incoming = await loadGitHubSkills(config.repo,branch,credential || undefined)
      const imported = importSkillsRepository(config.repo,incoming.files)
      source.current=incoming; baseline.current=imported; autoPaused.current=false
      onImport(imported)
      setStatus('Pulled '+incoming.branch+' into the editor.')
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'Could not pull from GitHub.')
    } finally { finish() }
  }

  async function push(collection:MySkillsConfig, automatic:boolean) {
    if (!credential) throw new Error('GitHub write access is required to push.')
    if (automatic && autoPaused.current) throw new Error('Automatic publishing is paused. Import from GitHub or choose Publish to GitHub to retry.')
    begin('Pushing to GitHub…')
    try {
      const snapshot = source.current ?? await loadGitHubSkills(collection.repo,branch,credential)
      source.current=snapshot
      const changes = planSkillsChanges(collection,snapshot.files,baseline.current)
      const files = changes.map(({path,after})=>({path,content:after}))
      const updated = new Map(snapshot.files.map(file=>[file.path,file]))
      for (const file of files) updated.set(file.path,file)
      const nextFiles = [...updated.values()]
      let nextBaseline = baseline.current
      if (files.length) {
        const before = importSkillsRepository(snapshot.repo,snapshot.files)
        const after = importSkillsRepository(snapshot.repo,nextFiles)
        const existing = new Set(before.selected_packages)
        const owned = new Set(baseline.current?.selected_packages)
        const managedDrafts = new Set([...files.map(file=>file.path),...(baseline.current?.drafts.map(draft=>draft.id) ?? [])])
        nextBaseline = {...after,selected_packages:after.selected_packages.filter(id=>owned.has(id) || !existing.has(id)),
          drafts:after.drafts.filter(draft=>managedDrafts.has(draft.id))}
      }
      // Even an unchanged collection must match the branch's current head.
      const sha = await pushGitHubSkills(snapshot,files,'Update my skills collection',credential)
      if (files.length) {
        source.current={...snapshot,sha,files:nextFiles}
        baseline.current=nextBaseline
        setCommit(githubRepositoryURL(snapshot.repo)+'/commit/'+sha)
      }
      autoPaused.current=false
      setStatus(files.length ? 'Pushed to '+branch+'.' : 'GitHub is up to date.')
    } catch(cause) {
      autoPaused.current=true
      const message = cause instanceof Error ? cause.message : 'Could not push to GitHub.'
      setError(message)
      throw new Error(message)
    } finally { finish() }
  }

  useImperativeHandle(ref,()=>({
    async syncSaved(collection) {
      if (autoSync && credential) await push(collection,true)
    },
  }))

  return <div className="skills-github-panel">
    <div className="skills-actions">
      <button type="button" disabled={Boolean(operation)||busy} onClick={()=>void pull()}>Import from GitHub</button>
      {credential && <button type="button" disabled={Boolean(operation)||busy} onClick={()=>void push(config,false).catch(()=>{})}>Publish to GitHub</button>}
    </div>
    {credential && <label className="skills-autosync"><input type="checkbox" checked={autoSync} disabled={Boolean(operation)||busy}
      onChange={event=>onAutoSyncChange(event.target.checked)}/> Publish when I save</label>}
    {(operation || status) && <p role="status">{operation || status}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {commit && <a href={commit} target="_blank" rel="noreferrer">View commit on GitHub ↗</a>}
  </div>
})
