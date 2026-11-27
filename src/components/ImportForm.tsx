import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { describeSaveError } from '../lib/saveError'
import {
  DEFAULT_PATH,
  fetchDefinition,
  provisionMentions,
  publishImportedPractice,
} from '../lib/importService'
import {
  parseDefinition,
  type PracticeDefinition,
} from '../lib/practiceDefinition'

export function ImportForm() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const user = session?.user

  const [repoUrl, setRepoUrl] = useState('')
  const [path, setPath] = useState('')
  const [parsed, setParsed] = useState<PracticeDefinition | null>(null)
  const [usedPath, setUsedPath] = useState<string | null>(null)
  const [rawUrl, setRawUrl] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPreview = async () => {
    setLoading(true)
    setError(null)
    setParsed(null)
    try {
      const { markdown, rawUrl: url, path: p } = await fetchDefinition(repoUrl, path)
      setParsed(parseDefinition(markdown))
      setUsedPath(p)
      setRawUrl(url)
      setRequestId(crypto.randomUUID())
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load the definition.',
      )
    } finally {
      setLoading(false)
    }
  }

  const publish = async () => {
    if (!parsed || !user || !requestId) return
    setPublishing(true)
    setError(null)
    try {
      const mentions = await provisionMentions(parsed)
      const practice = await publishImportedPractice({
        requestId,
        title: parsed.title,
        body: parsed.body,
        image_path: parsed.image,
        mentions,
        source_url: rawUrl,
      })
      navigate(`/practice/${practice.id}`)
    } catch (e) {
      console.error('Publishing failed:', e)
      setError(describeSaveError(e))
      setPublishing(false)
    }
  }

  if (!user) {
    return (
      <div className="card">
        <h1>Sign in to import</h1>
        <p className="muted">You need an account to import a practice.</p>
      </div>
    )
  }

  return (
    <div className="card import-form">
      <label htmlFor="repo-url">Repository URL</label>
      <input
        id="repo-url"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
      />
      <label htmlFor="repo-path">File path (optional)</label>
      <input
        id="repo-path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder={`${DEFAULT_PATH} (falls back to README.md)`}
      />
      <button
        className="primary"
        disabled={loading || !repoUrl.trim()}
        onClick={() => void loadPreview()}
      >
        {loading ? 'Loading…' : 'Preview'}
      </button>
      {error && <p className="error">{error}</p>}

      {parsed && (
        <div className="import-preview">
          <h2>{parsed.title}</h2>
          <p className="muted">
            From {usedPath} · {parsed.elements.length} element
            {parsed.elements.length === 1 ? '' : 's'}
          </p>
          {parsed.body && <p>{parsed.body.slice(0, 300)}</p>}
          {parsed.elements.map((element) => (
            <p key={element.id} className="muted">
              <strong>{element.name}</strong> —{' '}
              {element.options.map((o) => o.name).join(', ')}
            </p>
          ))}
          <button
            className="primary"
            disabled={publishing}
            onClick={() => void publish()}
          >
            {publishing ? 'Publishing…' : 'Publish import'}
          </button>
        </div>
      )}
    </div>
  )
}
