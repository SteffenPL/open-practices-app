import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../auth/useAuth'
import {
  deletePractice,
  getElements,
  getPractice,
  imageUrl,
  isSignificantUpdate,
} from '../lib/practiceService'
import { formatDate } from '../lib/markdown'
import type { Element, Practice } from '../lib/types'
import type { Selection } from '../lib/visibility'
import { ElementsReader } from '../components/ElementsReader'

export function PracticePage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [practice, setPractice] = useState<Practice | null>(null)
  const [elements, setElements] = useState<Element[]>([])
  const [selection, setSelection] = useState<Selection>({})
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!id) return
    getPractice(id)
      .then(setPractice)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load practice'),
      )
    getElements(id)
      .then(setElements)
      .catch(() => setElements([]))
  }, [id])

  if (error) {
    return (
      <main className="page">
        <div className="card">
          <h1>Not found</h1>
          <p className="muted">{error}</p>
          <Link to="/">Back to the timeline</Link>
        </div>
      </main>
    )
  }

  if (!practice) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  const isAuthor = session?.user?.id === practice.author_id
  const image = imageUrl(practice.image_path)

  const onDelete = async () => {
    await deletePractice(practice.id)
    navigate('/')
  }

  return (
    <main className="page">
      <article className="card practice-detail">
        <h1>{practice.title}</h1>
        <p className="muted">
          {practice.author?.display_name || 'Unknown'} · published{' '}
          {formatDate(practice.published_at)}
          {isSignificantUpdate(practice) &&
            ` · updated ${formatDate(practice.last_significant_at)}`}
        </p>
        {image && <img className="practice-image" src={image} alt="" />}
        <div className="markdown-body">
          <Markdown remarkPlugins={[remarkGfm]}>{practice.body}</Markdown>
        </div>
        <ElementsReader
          elements={elements}
          selection={selection}
          onSelect={(elementId, optionId) =>
            setSelection((prev) => ({ ...prev, [elementId]: optionId }))
          }
        />
        {isAuthor && (
          <div className="author-controls">
            <Link to={`/edit/${practice.id}`}>Edit</Link>
            {confirmingDelete ? (
              <>
                <button className="danger" onClick={() => void onDelete()}>
                  Really delete
                </button>
                <button onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            )}
          </div>
        )}
      </article>
    </main>
  )
}
