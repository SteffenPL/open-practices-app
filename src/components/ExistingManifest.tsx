import { useEffect, useState } from 'react'
import { CopyCommandButton } from './PracticeCommands'
import { downloadRepositoryFile, githubRepositoryURL, isGitHubRepository } from '../lib/skillsRepository'
import { manifestByteLimit, mergeSkillsManifest } from '../lib/mergeSkillsManifest'

interface Props { repository: string; packages: string[]; branch: string }

export function ExistingManifest(props: Props) {
  return <ManifestForm key={props.repository + ':' + props.branch} {...props} />
}

function ManifestForm({ repository, packages, branch }: Props) {
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const validRepo = isGitHubRepository(repository)
  const [request, setRequest] = useState<AbortController | null>(null)
  useEffect(() => () => request?.abort(), [request])

  async function loadPublic() {
    const controller = new AbortController()
    setRequest(controller); setLoading(true); setError(''); setSource(null)
    try {
      const response = await fetch('https://api.github.com/repos/' + repository + '/contents/apm.yml?' + new URLSearchParams({ref:branch}), {
        headers: {Accept: 'application/vnd.github.raw+json'}, signal: controller.signal, credentials:'omit',
      })
      if (!response.ok) throw Error('Couldn’t load a public apm.yml. Choose the file from your checkout instead.')
      if (Number(response.headers.get('content-length')) > manifestByteLimit) throw Error('The manifest exceeds 512 KB.')
      const text = await response.text()
      if (!controller.signal.aborted) setSource(text)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read the manifest.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }

  let merged: ReturnType<typeof mergeSkillsManifest> | undefined
  let problem = error
  if (source !== null) {
    try { merged = mergeSkillsManifest(source, packages) }
    catch (cause) { problem = cause instanceof Error ? cause.message : 'Invalid manifest.' }
  }
  return <details className="existing-manifest"><summary>Update an existing apm.yml</summary>
    <p>Load the current file to add missing packages. Existing pins, skill filters, and other settings are preserved.</p>
    <div className="manifest-actions">
      {validRepo && <button type="button" disabled={loading || !branch.trim()} onClick={() => void loadPublic()}>{loading ? 'Loading…' : 'Load from public GitHub'}</button>}
      <label>Choose a local apm.yml <input type="file" accept=".yml,.yaml" disabled={loading} onChange={async event => {
        const file = event.target.files?.[0]
        if (!file) return
        setSource(null); setError('')
        if (file.size > manifestByteLimit) { setError('The manifest exceeds 512 KB.'); return }
        try { setSource(await file.text()) } catch { setError('Could not read the selected file.') }
      }}/></label>
    </div>
    {problem && <p role="alert">{problem}</p>}
    {merged && <><p role="status">{merged.added.length ? 'Packages to add: ' + merged.added.join(', ') : 'All selected packages are already accounted for.'}</p>
      <pre aria-label="Updated manifest">{merged.text}</pre>
      <div className="manifest-actions"><CopyCommandButton text={merged.text} label="Copy updated manifest" />
        <button type="button" onClick={() => downloadRepositoryFile({path:'apm.yml', content:merged.text})}>Download updated apm.yml</button>
        {validRepo && <a href={githubRepositoryURL(repository)+'/blob/'+branch.split('/').map(encodeURIComponent).join('/')+'/apm.yml'} target="_blank" rel="noreferrer">Review file on GitHub ↗</a>}
      </div></>}
  </details>
}
