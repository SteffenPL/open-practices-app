import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, teaser } from '../lib/markdown'
import { imageUrl, isSignificantUpdate } from '../lib/practiceService'
import type { FeedDetails, PracticeSkillTag } from '../lib/elementService'
import type { Practice } from '../lib/types'
import { CopyCommandButton } from '../components/PracticeCommands'
import { splitGuidedPracticeBody, type PracticeCommand } from './guidedPracticeContent'
import './timeline.css'

type Props = {
  practices: Practice[]
  details: Record<string, FeedDetails>
  searchQuery: string
  loading: boolean
  loadingMore: boolean
  error: string | null
  onLoadMore: () => void
  hasMore: boolean
}

function hashtag(name: string): string {
  return name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function PracticePost({
  practice,
  tags,
  commands,
  selectedTopic,
  onSelectTopic,
}: {
  practice: Practice
  commands: PracticeCommand[]
  tags: PracticeSkillTag[]
  selectedTopic: string
  onSelectTopic: (topic: string) => void
}) {
  const image = imageUrl(practice.image_path)
  const date = isSignificantUpdate(practice) ? practice.last_significant_at : practice.published_at
  const authorName = practice.author?.display_name || 'Open Practices'
  const bodyParts = splitGuidedPracticeBody(practice.body)

  const cli = bodyParts.guided
    ? commands.map(({ command }) => command.trim()).filter(Boolean).join('\n')
    : ''

  return <article className="timeline-post">
    <div className="timeline-post-lead">
      <Link to={`/practice/${practice.id}`} className="timeline-post-title"><h2>{practice.title}</h2></Link>
    </div>
    <div className="timeline-post-content">
      <p>{teaser(bodyParts.opening, 220)}</p>
      {cli && <div className="timeline-cli">
        <pre aria-label="CLI commands">{cli}</pre>
        <CopyCommandButton text={cli} label={`Copy commands for ${practice.title}`} />
      </div>}
      {image && <Link to={`/practice/${practice.id}`} className="timeline-post-image-link" tabIndex={-1} aria-hidden="true"><img className="timeline-post-image" src={image} alt="" loading="lazy" /></Link>}
      <div className="timeline-post-foot">
      {practice.author?.avatar_url
        ? <img className="timeline-avatar" src={practice.author.avatar_url} alt="" />
        : <span className="timeline-avatar timeline-avatar-initial" aria-hidden="true">{authorName.slice(0, 1)}</span>}
      <span className="timeline-post-author">{authorName}</span>
        {tags.length > 0 && <div className="timeline-post-tags" aria-label="Skills and packages linked to this practice">
          {tags.slice(0, 4).map((tag) => <button key={`${tag.packageId}:${tag.name}`} type="button" title={`APM package: ${tag.packageId}`} aria-pressed={selectedTopic === tag.name.toLowerCase()} onClick={() => onSelectTopic(tag.name)}>#{hashtag(tag.name)}</button>)}
          {tags.length > 4 && <span>+{tags.length - 4}</span>}
        </div>}
        <time className="timeline-post-date" dateTime={date}>{formatDate(date)}</time>
        <Link to={`/practice/${practice.id}`} className="timeline-post-action">Read more <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  </article>
}

export function TimelineFeed({ practices, details, searchQuery, loading, loadingMore, error, onLoadMore, hasMore }: Props) {
  const [selectedTopic, setSelectedTopic] = useState('all')

  const tagsFor = (practice: Practice) => details[practice.id]?.tags ?? []
  const topics = useMemo(() => Array.from(new Map(practices.flatMap(practice => details[practice.id]?.tags ?? []).map((tag) => [tag.name.toLowerCase(), tag.name])).values()), [practices, details])
  const query = searchQuery.trim().toLowerCase()
  const visibleItems = practices.filter((practice) => {
    const matchesTopic = selectedTopic === 'all' || tagsFor(practice).some((tag) => tag.name.toLowerCase() === selectedTopic)
    const bodyParts = splitGuidedPracticeBody(practice.body)
    const searchText = [practice.title, bodyParts.opening, bodyParts.closing, practice.author?.display_name ?? '', ...tagsFor(practice).map((tag) => tag.name)].join(' ').toLowerCase()
    return matchesTopic && (!query || searchText.includes(query))
  })

  const selectTopic = (topic: string) => setSelectedTopic(topic === 'all' ? 'all' : topic.toLowerCase())

  return <main className="timeline-page">
    <div className="timeline-shell">
      <Link className="timeline-compose" to="/new"><span className="timeline-compose-plus" aria-hidden="true">＋</span><span>Share a practice…</span><b>Post</b></Link>
      <div className="timeline-layout">
        <section className="timeline-feed" aria-label="Practices">
          {loading && practices.length === 0 && <p className="timeline-state">Loading practices…</p>}
          {error && <p className="timeline-error" role="alert">{error}</p>}
          {!loading && !error && practices.length === 0 && <div className="timeline-empty"><h1>Nothing here yet</h1><p>Be the first to share a practice.</p><Link to="/new">Share a practice</Link></div>}
          {!loading && practices.length > 0 && visibleItems.map((practice) => <PracticePost key={practice.id} practice={practice} tags={tagsFor(practice)} commands={details[practice.id]?.commands ?? []} selectedTopic={selectedTopic} onSelectTopic={selectTopic} />)}
          {!loading && practices.length > 0 && visibleItems.length === 0 && <p className="timeline-state">No matching practices. Try another search or topic.</p>}
          {hasMore && <button className="timeline-load-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more practices'}</button>}
        </section>
        <aside className="timeline-topic-sidebar">
          <p className="timeline-sidebar-label">Explore topics</p>
          <nav aria-label="Filter by skill topic">
            <button className={`timeline-topic-option${selectedTopic === 'all' ? ' is-active' : ''}`} onClick={() => selectTopic('all')}><b>All practices</b><span>{practices.length}</span></button>
            {topics.map((topic, index) => <button key={topic} className={`timeline-topic-option${selectedTopic === topic.toLowerCase() ? ' is-active' : ''}`} onClick={() => selectTopic(topic)}><i className={`timeline-topic-swatch timeline-topic-swatch-${index % 4}`} /><b>#{hashtag(topic)}</b><span>{practices.filter((practice) => tagsFor(practice).some((tag) => tag.name.toLowerCase() === topic.toLowerCase())).length}</span></button>)}
          </nav>
        </aside>
      </div>
    </div>
  </main>
}
