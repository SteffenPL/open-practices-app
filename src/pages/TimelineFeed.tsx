import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, teaser } from '../lib/markdown'
import { imageUrl, isSignificantUpdate } from '../lib/practiceService'
import type { PracticeToolLink } from '../lib/elementService'
import type { Practice } from '../lib/types'
import { InstallList } from '../components/MentionSetup'
import { PracticeText } from '../components/PracticeText'
import type { PracticeMention } from '../lib/mentionService'
import { splitGuidedPracticeBody } from './guidedPracticeContent'
import './timeline.css'

type Props = {
  practices: Practice[]
  tools: Record<string, PracticeToolLink[]>
  mentions: Record<string, PracticeMention[]>
  searchQuery: string
  loading: boolean
  loadingMore: boolean
  error: string | null
  onLoadMore: () => void
  hasMore: boolean
}

function PracticePost({ practice, tools, mentions }: {
  practice: Practice
  tools: PracticeToolLink[]
  mentions: PracticeMention[]
}) {
  const image = imageUrl(practice.image_path)
  const date = isSignificantUpdate(practice) ? practice.last_significant_at : practice.published_at
  const authorName = practice.author?.display_name || 'Open Practices'
  const bodyParts = splitGuidedPracticeBody(practice.body)

  return <article className="timeline-post">
    <div className="timeline-post-lead">
      <Link to={`/practice/${practice.id}`} className="timeline-post-title"><h2>{practice.title}</h2></Link>
    </div>
    <div className="timeline-post-content">
      <p>{practice.mention_format
        ? <PracticeText text={practice.body} mentions={mentions} preview />
        : teaser(bodyParts.opening, 220)}</p>
      <InstallList compact legacyTools={practice.mention_format ? undefined : tools} mentions={mentions} title={practice.title} overrides={practice.install_overrides} />
      {image && <Link to={`/practice/${practice.id}`} className="timeline-post-image-link" tabIndex={-1} aria-hidden="true"><img className="timeline-post-image" src={image} alt="" loading="lazy" /></Link>}
      <div className="timeline-post-foot">
      {practice.author?.avatar_url
        ? <img className="timeline-avatar" src={practice.author.avatar_url} alt="" />
        : <span className="timeline-avatar timeline-avatar-initial" aria-hidden="true">{authorName.slice(0, 1)}</span>}
      <span className="timeline-post-author">{authorName}</span>
        {!practice.mention_format && tools.length > 0 && <div className="timeline-post-tags" aria-label="Mentioned tools">
          {tools.map(tool => <Link className="practice-mention" key={tool.id} to={`/tools/${tool.id}`}>#{tool.slug}</Link>)}
        </div>}
        <time className="timeline-post-date" dateTime={date}>{formatDate(date)}</time>
        <Link to={`/practice/${practice.id}`} className="timeline-post-action">Read more <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  </article>
}

export function TimelineFeed({ practices, tools, mentions, searchQuery, loading, loadingMore, error, onLoadMore, hasMore }: Props) {
  const [selectedTopic, setSelectedTopic] = useState('all')

  const toolsFor = (practice: Practice) => tools[practice.id] ?? []
  const topics = useMemo(() => [...new Map(Object.values(tools).flat().map(tool => [tool.id, tool])).values()], [tools])
  const query = searchQuery.trim().toLowerCase()
  const visibleItems = practices.filter((practice) => {
    const matchesTopic = selectedTopic === 'all' || toolsFor(practice).some(tool => tool.id === selectedTopic)
    const bodyParts = splitGuidedPracticeBody(practice.body)
    const searchText = [practice.title, bodyParts.opening, bodyParts.closing, practice.author?.display_name ?? '', ...toolsFor(practice).flatMap(tool => [tool.name, tool.slug])].join(' ').toLowerCase()
    return matchesTopic && (!query || searchText.includes(query))
  })


  return <main className="timeline-page">
    <div className="timeline-shell">
      <header className="feed-heading">
        <div className="feed-views">
          <h1>Practices</h1>
          <Link to="/tools">Tools</Link>
        </div>
        <nav className="practice-compose-nav" aria-label="Create">
          <Link to="/tools/new">New tool</Link>
          <Link className="practice-compose-primary" to="/new">New practice</Link>
        </nav>
      </header>
      <div className="timeline-layout">
        <section className="timeline-feed" aria-label="Practices">
          {loading && practices.length === 0 && <p className="timeline-state">Loading practices…</p>}
          {error && <p className="timeline-error" role="alert">{error}</p>}
          {!loading && !error && practices.length === 0 && <div className="timeline-empty"><h2>Nothing here yet</h2><p>Be the first to share a practice.</p><Link to="/new">Share a practice</Link></div>}
          {!loading && practices.length > 0 && visibleItems.map((practice) => <PracticePost key={practice.id} practice={practice} tools={toolsFor(practice)} mentions={mentions[practice.id] ?? []} />)}
          {!loading && practices.length > 0 && visibleItems.length === 0 && <p className="timeline-state">No matching practices. Try another search or topic.</p>}
          {hasMore && <button className="timeline-load-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more practices'}</button>}
        </section>
        <aside className="timeline-topic-sidebar">
          <p className="timeline-sidebar-label">Mentioned tools</p>
          <nav aria-label="Filter by tool">
            <button className={`timeline-topic-option${selectedTopic === 'all' ? ' is-active' : ''}`} aria-pressed={selectedTopic === 'all'} onClick={() => setSelectedTopic('all')}><b>All practices</b><span>{practices.length}</span></button>
            {topics.map((topic, index) => <button key={topic.id} className={`timeline-topic-option${selectedTopic === topic.id ? ' is-active' : ''}`} aria-pressed={selectedTopic === topic.id} onClick={() => setSelectedTopic(topic.id)}><i className={`timeline-topic-swatch timeline-topic-swatch-${index % 4}`} /><b>#{topic.slug}</b><span>{practices.filter((practice) => toolsFor(practice).some(tool => tool.id === topic.id)).length}</span></button>)}
          </nav>
        </aside>
      </div>
    </div>
  </main>
}
