import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { createTool, listTools, mergeTools, updateTool, type CatalogTool, type ToolInput } from '../lib/catalogService'
import { catalogMatches, exactPackageMatch, toolFields, type ToolDraft } from '../lib/toolMatching'
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
  const [matches, setMatches] = useState<CatalogTool[] | null>(null)
  const [merge, setMerge] = useState<CatalogTool | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')
  useEffect(() => { setMatches(null); setMerge(null); setError('') }, [draft])

  function mergedDraft(target: CatalogTool): ToolInput {
    // A proposed merge can fill missing fields or explicitly replace existing ones.
    return { ...Object.fromEntries(toolFields.map(([field]) => [field, draft[field].trim() || target[field]])), name: draft.name.trim() || target.name }
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
      const saved = tool ? await updateTool(tool.id, draft, tool.updated_at) : await createTool(draft)
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
  if (!session) return <div className="tool-editor"><p>Sign in to contribute to the tool catalog.</p><button type="button" onClick={() => void signInWithGoogle()}>Sign in with Google</button><button type="button" onClick={onCancel}>Cancel</button></div>
  return <form className="tool-editor" onSubmit={submit}>
    {toolFields.map(([field, label]) => <label key={field}>{label}
      {field === 'description'
        ? <textarea value={draft[field]} maxLength={4000} onChange={e => setDraft({ ...draft, [field]: e.target.value })}/>
        : <input type={field.endsWith('_url') ? 'url' : 'text'} required={field === 'name'} value={draft[field]} onChange={e => setDraft({ ...draft, [field]: e.target.value })} placeholder={field === 'apm_id' ? 'owner/repository/path/to/skill' : undefined}/>}
    </label>)}
    <div className="tool-actions"><button type="button" disabled={busy || !(draft.apm_id.trim() || draft.repo_url.trim())} onClick={() => void lookup()}>Look up source details</button></div>
    {lookupStatus && <p role="status" className="muted">{lookupStatus}</p>}
    {matches && <section className="tool-matches" aria-label="Possible duplicate tools">
      <h3>Possible duplicates</h3>
      {matches.map(candidate => <div key={candidate.id} className="tool-match">
        <strong>{candidate.name}</strong><small>{candidate.apm_id || candidate.repo_url || candidate.website_url}</small>
        <div className="tool-actions"><button type="button" disabled={busy} onClick={() => onSaved(candidate)}>Use existing</button>
        <button type="button" disabled={busy} onClick={() => setMerge(candidate)}>{tool ? 'Merge tools' : 'Merge details'}</button></div>
      </div>)}
      {merge && <div className="tool-merge-confirm"><h3>Merge details into {merge.name}?</h3>
        {tool ? <p>Practice references will move from {tool.name} to {merge.name}. Both entries will retain the merge in their history.</p> : <dl>{toolFields.map(([field,label]) => <div key={field}><dt>{label}</dt><dd>{mergedDraft(merge)[field] || '—'}</dd></div>)}</dl>}
        <button type="button" disabled={busy} onClick={() => void save('merge')}>Confirm merge</button>
      </div>}
      {matches.some(t => exactPackageMatch(draft,t)) ? <p>The package identifier already belongs to a tool.</p> :
      <button type="button" disabled={busy} onClick={() => void save('separate')}>Keep separate</button>}
    </section>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="tool-actions">{!matches && <button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : tool ? 'Save changes' : 'Create tool'}</button>}
      <button type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>
}
