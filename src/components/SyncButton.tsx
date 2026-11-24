import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePractice } from '../lib/practiceService'
import { saveElements } from '../lib/elementService'
import { provisionDrafts, sourceDisplayUrl, toFetchableSourceUrl } from '../lib/importService'
import { parseDefinition, type PracticeDefinition } from '../lib/practiceDefinition'
import type { Practice } from '../lib/types'

/**
 * Author-only re-pull of an imported practice's definition.
 * Fetches and parses the source first so the author confirms against the
 * real result; the repo is canonical, so the sync overwrites everything.
 */
export function SyncButton({ practice }: { practice: Practice }) {
  const navigate = useNavigate()
  const [parsed, setParsed] = useState<PracticeDefinition | null>(null)
  const [significant, setSignificant] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSource = async () => {
    setLoading(true)
    setError(null)
    setParsed(null)
    try {
      const res = await fetch(toFetchableSourceUrl(practice.source_url as string))
      if (!res.ok) {
        throw new Error(`Could not fetch the source file (HTTP ${res.status}).`)
      }
      setParsed(parseDefinition(await res.text()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetching the source failed.')
    } finally {
      setLoading(false)
    }
  }

  const sync = async () => {
    if (!parsed) return
    setSyncing(true)
    setError(null)
    try {
      const drafts = await provisionDrafts(parsed)
      await updatePractice(
        practice.id,
        {
          title: parsed.title,
          body: parsed.body,
          image_path: parsed.image,
        },
        significant,
      )
      await saveElements(practice.id, drafts)
      navigate(0) // reload the practice page
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.')
      setSyncing(false)
    }
  }

  return (
    <>
      <button disabled={loading} onClick={() => void loadSource()}>
        {loading ? 'Fetching…' : 'Sync now'}
      </button>
      {parsed && (
        <div className="sync-confirm">
          <p className="muted">
            From{' '}
            {sourceDisplayUrl(practice.source_url as string).replace(/^https?:\/\//, '')}{' '}
            — <strong>overwrites everything</strong>, including edits made here.
          </p>
          <p>
            <strong>{parsed.title}</strong> · {parsed.elements.length} element
            {parsed.elements.length === 1 ? '' : 's'}
            {parsed.elements.map((element) => (
              <span key={element.id} className="muted block">
                {element.name}: {element.options.map((o) => o.name).join(', ')}
              </span>
            ))}
          </p>
          <label>
            <input
              type="radio"
              name="sync-significance"
              checked={!significant}
              onChange={() => setSignificant(false)}
            />{' '}
            Silent (default) — keeps timeline position
          </label>
          <label>
            <input
              type="radio"
              name="sync-significance"
              checked={significant}
              onChange={() => setSignificant(true)}
            />{' '}
            Significant — bumps with an updated marker
          </label>
          <div className="editor-actions">
            <button
              className="primary"
              disabled={syncing}
              onClick={() => void sync()}
            >
              {syncing ? 'Syncing…' : 'Overwrite and sync'}
            </button>
            <button onClick={() => setParsed(null)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </>
  )
}
