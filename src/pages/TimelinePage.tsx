import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPractices } from '../lib/practiceService'
import { isSignificantUpdate } from '../lib/practiceService'
import { imageUrl } from '../lib/practiceService'
import { teaser, formatDate } from '../lib/markdown'
import type { Practice } from '../lib/types'

const PAGE_SIZE = 10

export function TimelinePage() {
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  const load = async (from: number, replace: boolean) => {
    try {
      const page = await listPractices(from, PAGE_SIZE)
      setPractices((prev) => (replace ? page : [...prev, ...page]))
      setMore(page.length === PAGE_SIZE)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(0, true)
  }, [])

  return (
    <main className="page">
      <div className="timeline">
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && practices.length === 0 && (
          <div className="card">
            <h1>Nothing here yet</h1>
            <p className="muted">
              Be the first to publish a Practice about your setup.
            </p>
            <Link className="primary-as-link" to="/new">
              Write a practice
            </Link>
          </div>
        )}
        {practices.map((practice) => (
          <Link
            key={practice.id}
            to={`/practice/${practice.id}`}
            className="card practice-card"
          >
            {imageUrl(practice.image_path) && (
              <img
                className="practice-card-image"
                src={imageUrl(practice.image_path) as string}
                alt=""
              />
            )}
            <div className="practice-card-body">
              <h2>{practice.title}</h2>
              <p className="teaser">{teaser(practice.body)}</p>
              <p className="muted practice-card-meta">
                {practice.author?.avatar_url && (
                  <img
                    className="avatar avatar-sm"
                    src={practice.author.avatar_url}
                    alt=""
                  />
                )}
                <span>
                  {practice.author?.display_name || 'Unknown'} ·{' '}
                  {formatDate(
                    isSignificantUpdate(practice)
                      ? practice.last_significant_at
                      : practice.published_at,
                  )}
                  {isSignificantUpdate(practice) && (
                    <span className="updated-badge">updated</span>
                  )}
                </span>
              </p>
            </div>
          </Link>
        ))}
        {more && (
          <button
            className="load-more"
            onClick={() =>
              void load(practices.length, false)
            }
          >
            Load more
          </button>
        )}
      </div>
    </main>
  )
}
