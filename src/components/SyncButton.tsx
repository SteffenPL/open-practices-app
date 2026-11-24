import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePractice } from '../lib/practiceService'
import { saveElements } from '../lib/elementService'
import { provisionTool } from '../lib/toolService'
import { definitionToDrafts, sourceDisplayUrl } from '../lib/importService'
import { parseDefinition } from '../lib/practiceDefinition'
import type { Practice } from '../lib/types'

/**
 * Author-only re-pull of an imported practice's definition.
 * The repo is canonical: the sync overwrites the platform copy entirely.
 */
export function SyncButton({ practice }: { practice: Practice }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [significant, setSignificant] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(practice.source_url as string)
      if (!res.ok) throw new Error(`Could not fetch the source file (HTTP ${res.status}).`)
      const definition = parseDefinition(await res.text())
      const drafts = await definitionToDrafts(definition, async (identifier) => {
        try {
          return (await provisionTool(identifier)).id
        } catch {
          return null
        }
      })
      await updatePractice(
        practice.id,
        {
          title: definition.title,
          body: definition.body,
          image_path: definition.image,
        },
        significant,
      )
      await saveElements(practice.id, drafts)
      navigate(0) // reload the practice page
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.')
      setSyncing(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}>Sync now</button>
      {open && (
        <div className="sync-confirm">
          <p className="muted">
            Re-pulls the definition from{' '}
            {sourceDisplayUrl(practice.source_url as string).replace(/^https?:\/\//, '')}{' '}
            and <strong>overwrites everything</strong> — including edits made
            here.
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
            <button onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </>
  )
}
