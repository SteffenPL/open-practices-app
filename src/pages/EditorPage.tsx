import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MDEditor from '@uiw/react-md-editor'
import { useAuth } from '../auth/useAuth'
import {
  createPractice,
  deletePracticeImage,
  getPractice,
  imageUrl,
  updatePractice,
  uploadPracticeImage,
} from '../lib/practiceService'

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { session } = useAuth()
  const user = session?.user

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [significant, setSignificant] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Load the existing practice once when editing.
  if (id && loadedId !== id && user) {
    setLoadedId(id)
    getPractice(id)
      .then((practice) => {
        if (!practice || practice.author_id !== user.id) {
          setError('You can only edit your own practices.')
          return
        }
        setTitle(practice.title)
        setBody(practice.body)
        setImagePath(practice.image_path)
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load practice'),
      )
  }

  if (!user) {
    return (
      <main className="page">
        <div className="card">
          <h1>Sign in to publish</h1>
          <p className="muted">
            You need an account to write a practice.
          </p>
        </div>
      </main>
    )
  }

  const onImagePicked = async (file: File | undefined) => {
    if (!file) return
    try {
      const previous = imagePath
      const path = await uploadPracticeImage(file)
      setImagePath(path)
      if (previous) await deletePracticeImage(previous)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed')
    }
  }

  const save = async () => {
    if (!title.trim()) {
      setError('A practice needs a title.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input = { title: title.trim(), body, image_path: imagePath }
      if (isEditing && id) {
        await updatePractice(id, input, significant)
        navigate(`/practice/${id}`)
      } else {
        const practice = await createPractice(user.id, input)
        navigate(`/practice/${practice.id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed')
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <div className="card editor">
        <h1>{isEditing ? 'Edit practice' : 'New practice'}</h1>
        {error && <p className="error">{error}</p>}
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is your practice about?"
        />

        <label>Image (optional)</label>
        {imageUrl(imagePath) && (
          <img
            className="practice-image"
            src={imageUrl(imagePath) as string}
            alt="Practice image preview"
          />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(e) => void onImagePicked(e.target.files?.[0])}
        />

        <label>Description</label>
        <MDEditor value={body} onChange={(v) => setBody(v ?? '')} height={300} />

        {isEditing && (
          <fieldset className="significance">
            <legend>This update is…</legend>
            <label>
              <input
                type="radio"
                name="significance"
                checked={significant}
                onChange={() => setSignificant(true)}
              />{' '}
              Significant — bumps to the top of the timeline with an updated
              marker
            </label>
            <label>
              <input
                type="radio"
                name="significance"
                checked={!significant}
                onChange={() => setSignificant(false)}
              />{' '}
              Silent — keeps its position, no marker
            </label>
          </fieldset>
        )}

        <div className="editor-actions">
          <button className="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : isEditing ? 'Save' : 'Publish'}
          </button>
          <button onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </div>
    </main>
  )
}
