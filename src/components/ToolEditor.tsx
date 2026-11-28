import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { createTool, listTools, mergeTools, updateTool, type CatalogTool, type ToolInput } from '../lib/catalogService'
import { catalogMatches, exactPackageMatch, platformFields, toolFields, type ToolDraft } from '../lib/toolMatching'
import type { InstallCommands, InstallOS } from '../lib/installCommands'
import { readToolMetadata } from '../lib/toolMetadata'
import '../pages/tool-catalog.css'

type Props = { tool?: CatalogTool; initialName?: string; onSaved: (tool: CatalogTool) => void; onCancel: () => void }

function errorText(cause: unknown) {
  return cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Could not save this tool.'
}

export function ToolEditor({ tool, initialName = '', onSaved, onCancel }: Props) {
  const { session, loading, signInWithGoogle } = useAuth()
  const [draft, setDraft] = useState<ToolDraft>(() => ({
    name: tool?.name || initialName, description: tool?.description || '',
    apm_id: tool?.apm_id || '', repo_url: tool?.repo_url || '', website_url: tool?.website_url || '',
    install_command: tool?.install_command || '',
  }))
  const [commands, setCommands] = useState<InstallCommands>(() => ({ ...tool?.install_commands }))
  const [matches, setMatches] = useState<CatalogTool[] | null>(null)
  const [merge, setMerge] = useState<CatalogTool | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')
  const matchHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (matches) matchHeading.current?.focus() }, [matches])
  useEffect(() => { setMatches(null); setMerge(null); setError('') }, [draft, commands])

  const filledCommands = Object.fromEntries(Object.entries(commands).flatMap(([os, value]) =>
    value?.trim() ? [[os, value.trim()]] : []))

  function mergedDraft(target: CatalogTool): ToolInput {
    // A proposed merge can fill missing fields or explicitly replace existing ones.
    return { install_commands: { ...target.install_commands, ...filledCommands }, ...Object.fromEntries(toolFields.map(([field]) => [field, draft[field].trim() || target[field]])), name: draft.name.trim() || target.name }
  }

  async function save(action: 'check' | 'separate' | 'merge') {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (action === 'merge' && merge) {
        onSaved(tool ? await mergeTools(tool.id, merge.id) : await updateTool(merge.id, mergedDraft(merge), merge.updated_at))
        return
      }
      const checkingIdentity = !tool || (['name', 'apm_id', 'repo_url', 'website_url'] as const)
        .some(field => draft[field].trim() !== (tool[field] || ''))
      if (action === 'check' && checkingIdentity) {
        const found = catalogMatches(draft, (await listTools()).filter(t => t.id !== tool?.id && !t.merged_into))
        if (found.length) { setMatches(found); return }
      }
      const input = { ...draft, install_commands: filledCommands }
      const saved = tool ? await updateTool(tool.id, input, tool.updated_at) : await createTool(input)
      onSaved(saved)
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  async function lookup() {
    setBusy(true); setError(''); setLookupStatus('')
    try {
      const suggested = await readToolMetadata(draft.apm_id, draft.repo_url)
      setDraft(previous => Object.fromEntries(toolFields.map(([field]) => [field, previous[field] || suggested[field] || ''])) as ToolDraft)
      setLookupStatus('Source details loaded. Review the fields before saving.')
    } catch(cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  function submit(event: FormEvent) { event.preventDefault(); void save('check') }
  if (loading) return <p role="status">Checking sign-in…</p>
  if (!session) return <div className="tool-editor tool-signin"><p>Sign in to contribute to the tool catalog.</p><div className="tool-actions"><button className="primary" type="button" onClick={() => void signInWithGoogle()}>Sign in with Google</button><button type="button" onClick={onCancel}>Cancel</button></div></div>

  function changeCommand(os: InstallOS, value: string) {
    setCommands(previous => {
      const next = { ...previous }
      if (value) next[os] = value
      else delete next[os]
      return next
    })
  }

  function change(field: keyof ToolDraft, value: string) {
    setLookupStatus('')
    setDraft(previous => ({ ...previous, [field]: value }))
  }

  return <form className="tool-editor" onSubmit={submit} onInvalid={event => {
    const disclosure = (event.target as HTMLElement).closest('details')
    if (disclosure) disclosure.open = true
  }}>
    <div className="tool-writing">
      <label className="tool-title-field"><span>Tool name</span>
        <input type="text" placeholder="Name your tool" required maxLength={160} value={draft.name} onChange={e => change('name', e.target.value)}/>
      </label>
      <label className="tool-description-field"><span>Description</span>
        <textarea rows={3} placeholder="What does this tool help people do?" maxLength={12000} value={draft.description} onChange={e => change('description', e.target.value)}/>
      </label>
    </div>
    <div className="tool-disclosures">
      <details className="tool-disclosure">
        <summary>Sources and links</summary>
        <div className="tool-disclosure-content">
          <label>APM package identifier<input placeholder="owner/repository/path/to/skill" value={draft.apm_id} onChange={e => change('apm_id', e.target.value)}/></label>
          <label>Source repository or package URL<input type="url" placeholder="https://github.com/…" value={draft.repo_url} onChange={e => change('repo_url', e.target.value)}/></label>
          <div className="tool-actions"><button type="button" disabled={busy || !(draft.apm_id.trim() || draft.repo_url.trim())} onClick={() => void lookup()}>Look up source details</button></div>
          {lookupStatus && <p role="status" className="muted">{lookupStatus}</p>}
          <label>Website<input type="url" placeholder="https://" value={draft.website_url} onChange={e => change('website_url', e.target.value)}/></label>
        </div>
      </details>
      <details className="tool-disclosure">
        <summary>Install command</summary>
        <div className="tool-disclosure-content">
          <label>Default install command<textarea rows={2} className="tool-command-field" placeholder="apm install owner/repository" value={draft.install_command} onChange={e => change('install_command', e.target.value)}/></label>
          {platformFields.map(([os, label]) => <label key={os}>{label} install command
            <textarea rows={2} maxLength={8000} className="tool-command-field" value={commands[os] ?? ''} onChange={event => changeCommand(os, event.target.value)}/>
          </label>)}
        </div>
      </details>
    </div>
    {matches && <section className="tool-matches" aria-label="Possible duplicate tools">
      <h3 ref={matchHeading} tabIndex={-1}>Possible duplicates</h3>
      {matches.map(candidate => <div key={candidate.id} className="tool-match">
        <strong>{candidate.name}</strong><small>{candidate.apm_id || candidate.repo_url || candidate.website_url}</small>
        <div className="tool-actions"><button type="button" disabled={busy} onClick={() => onSaved(candidate)}>Use existing</button>
        <button type="button" disabled={busy} onClick={() => setMerge(candidate)}>{tool ? 'Merge tools' : 'Merge details'}</button></div>
      </div>)}
      {merge && <div className="tool-merge-confirm"><h3>Merge details into {merge.name}?</h3>
        {tool ? <p>Practice references will move from {tool.name} to {merge.name}. Both entries will retain the merge in their history.</p> : <dl>{toolFields.map(([field,label]) => <div key={field}><dt>{label}</dt><dd>{mergedDraft(merge)[field] || '—'}</dd></div>)}{platformFields.map(([os,label]) => {
          const command = mergedDraft(merge).install_commands?.[os]
          return command && <div key={os}><dt>{label} install command</dt><dd>{command}</dd></div>
        })}</dl>}
        <button type="button" disabled={busy} onClick={() => void save('merge')}>Confirm merge</button>
      </div>}
      {matches.some(t => exactPackageMatch(draft,t)) ? <p>The package identifier already belongs to a tool.</p> :
      <button type="button" disabled={busy} onClick={() => void save('separate')}>Keep separate</button>}
    </section>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="tool-actions tool-save-actions">{!matches && <button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : tool ? 'Save changes' : 'Create tool'}</button>}
      <button type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>
}
