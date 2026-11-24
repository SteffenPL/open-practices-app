import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  createComment,
  deleteComment,
  listCommentVersions,
  listComments,
  updateComment,
} from '../lib/commentService'
import { formatDate } from '../lib/markdown'
import type { Comment, CommentVersion } from '../lib/types'

interface Props {
  practiceId: string
  practiceAuthorId: string
}

function CommentRow({
  comment,
  canDelete,
  onChanged,
}: {
  comment: Comment
  canDelete: boolean
  onChanged: () => void
}) {
  const { session } = useAuth()
  const isOwn = session?.user?.id === comment.author_id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [versions, setVersions] = useState<CommentVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    try {
      await updateComment(comment.id, comment.body, draft)
      setEditing(false)
      onChanged() // triggers a reload of the comment list
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const remove = async () => {
    await deleteComment(comment.id)
    onChanged()
  }

  const toggleHistory = async () => {
    if (versions) {
      setVersions(null)
      return
    }
    setVersions(await listCommentVersions(comment.id))
  }

  return (
    <div className="comment">
      <p className="comment-meta muted">
        <strong>{comment.author?.display_name || 'Unknown'}</strong> ·{' '}
        {formatDate(comment.created_at)}
        {comment.updated_at !== comment.created_at && ' (edited)'}
      </p>
      {editing ? (
        <div className="comment-edit">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
          <div className="editor-actions">
            <button className="primary" onClick={() => void save()}>
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setDraft(comment.body)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="comment-body">{comment.body}</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="comment-actions">
        {isOwn && !editing && (
          <>
            <button className="link-like" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="link-like" onClick={() => void remove()}>
              Delete
            </button>
          </>
        )}
        {!isOwn && canDelete && (
          <button className="link-like" onClick={() => void remove()}>
            Delete
          </button>
        )}
        <button className="link-like" onClick={() => void toggleHistory()}>
          {versions ? 'Hide history' : 'History'}
        </button>
      </div>
      {versions && (
        <div className="comment-versions">
          {versions.length === 0 && (
            <p className="muted">No previous versions.</p>
          )}
          {versions.map((version) => (
            <p key={version.id} className="comment-version">
              <span className="muted">{formatDate(version.created_at)}:</span>{' '}
              {version.body}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentsSection({ practiceId, practiceAuthorId }: Props) {
  const { session } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    listComments(practiceId)
      .then(setComments)
      .catch(() => setComments([]))
  }, [practiceId])

  useEffect(() => {
    reload()
  }, [reload])

  const post = async () => {
    if (!session?.user || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createComment(practiceId, session.user.id, body.trim())
      setBody('')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Posting failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card comments-section">
      <h2>Comments</h2>
      {session?.user ? (
        <div className="comment-composer">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your view…"
            rows={3}
          />
          <button
            className="primary"
            disabled={busy || !body.trim()}
            onClick={() => void post()}
          >
            {busy ? 'Posting…' : 'Comment'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <p className="muted">Sign in to comment.</p>
      )}
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          canDelete={session?.user?.id === practiceAuthorId}
          onChanged={reload}
        />
      ))}
    </section>
  )
}
