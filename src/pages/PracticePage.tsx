import { PracticeText } from '../components/PracticeText'
import { InstallList, MentionNotes } from '../components/MentionSetup'
import { LegacyPracticeNotes } from '../components/LegacyPracticeNotes'
import { listPracticeMentions, type PracticeMention } from '../lib/mentionService'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../auth/useAuth'
import {
  deletePractice,
  getPractice,
  imageUrl,
  isSignificantUpdate,
} from '../lib/practiceService'
import { getElements } from '../lib/elementService'
import { formatDate } from '../lib/markdown'
import { sourceDisplayUrl } from '../lib/importService'
import type { Element, Practice } from '../lib/types'
import { CommentsSection } from '../components/CommentsSection'
import { SyncButton } from '../components/SyncButton'
import { splitGuidedPracticeBody } from './guidedPracticeContent'

export function PracticePage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [practice, setPractice] = useState<Practice | null>(null)
  const [elements, setElements] = useState<Element[]>([])
  const [mentions, setMentions] = useState<PracticeMention[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    setPractice(null)
    setElements([])
    setMentions([])
    setError(null)
    getPractice(id)
      .then(async post => {
        const [originalElements, linked] = post ? await Promise.all([
          getElements(id), post.mention_format ? listPracticeMentions(id) : [],
        ]) : [[], []]
        if (active) {
          setPractice(post)
          setElements(originalElements)
          setMentions(linked)
          if (!post) setError('Practice not found.')
        }
      })
      .catch(error => {
        if (active) setError(error instanceof Error ? error.message : 'Failed to load practice')
      })
    return () => { active = false }
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
  const bodyParts = splitGuidedPracticeBody(practice.body)

  const onDelete = async () => {
    await deletePractice(practice)
    navigate('/')
  }

  return (
    <main className="page">
      <article className="practice-detail">
        <Link className="practice-back" to="/">← Practices</Link>
        <h1>{practice.title}</h1>
        {practice.mention_format
          ? <p className="practice-key-message"><PracticeText text={practice.body} mentions={mentions} /></p>
          : <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm]}>{bodyParts.opening}</Markdown></div>}
        {practice.mention_format && <InstallList mentions={mentions} title={practice.title} overrides={practice.install_overrides} />}
        {image && <img className="practice-image" src={image} alt="" />}
        <MentionNotes mentions={mentions} />
        <LegacyPracticeNotes elements={elements} />
        {!practice.mention_format && bodyParts.closing && <div className="markdown-body practice-closing">
          <Markdown remarkPlugins={[remarkGfm]}>{bodyParts.closing}</Markdown>
        </div>}
        <p className="muted practice-meta">
          {practice.author?.avatar_url && (
            <img
              className="avatar avatar-sm"
              src={practice.author.avatar_url}
              alt=""
            />
          )}
          <span>
            {practice.author?.display_name || 'Unknown'} · published{' '}
            {formatDate(practice.published_at)}
            {isSignificantUpdate(practice) &&
              ` · updated ${formatDate(practice.last_significant_at)}`}
            {practice.source_url && (
              <>
                {' '}· imported from{' '}
                <a href={sourceDisplayUrl(practice.source_url)} target="_blank" rel="noreferrer">
                  {sourceDisplayUrl(practice.source_url).replace(/^https?:\/\//, '')}
                </a>
              </>
            )}
          </span>
        </p>
        <CommentsSection
          practiceId={practice.id}
          practiceAuthorId={practice.author_id}
        />
        {isAuthor && (
          <div className="author-controls">
            <Link to={`/edit/${practice.id}`}>Edit</Link>
            {practice.source_url && <SyncButton practice={practice} />}
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
