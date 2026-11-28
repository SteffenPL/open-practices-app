import { useCallback, useEffect, useState } from 'react'
import { listPractices } from '../lib/practiceService'
import type { Practice } from '../lib/types'
import { TimelineFeed } from './TimelineFeed'
import { listLegacyFeedTools, type PracticeToolLink } from '../lib/elementService'
import { listFeedMentions, type PracticeMention } from '../lib/mentionService'

const PAGE_SIZE = 10

export function TimelinePage({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (value: string) => void }) {
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [tools, setTools] = useState<Record<string, PracticeToolLink[]>>({})
  const [mentions, setMentions] = useState<Record<string, PracticeMention[]>>({})

  const load = useCallback(async (from: number, replace: boolean) => {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    try {
      const page = await listPractices(from, PAGE_SIZE)
      const [pageMentions, oldTools] = await Promise.all([
        listFeedMentions(page.filter(post => post.mention_format).map(post => post.id)),
        listLegacyFeedTools(page.filter(post => !post.mention_format).map(post => post.id)),
      ])
      const pageTools = { ...oldTools }
      for (const [id, linked] of Object.entries(pageMentions)) {
        pageTools[id] = [...new Map(linked.map(mention => [mention.tool.id, mention.tool])).values()]
      }
      setTools(previous => replace ? pageTools : { ...previous, ...pageTools })
      setMentions(previous => replace ? pageMentions : { ...previous, ...pageMentions })
      setPractices(previous => replace ? page : [...previous, ...page])
      setMore(page.length === PAGE_SIZE)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load practices.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void load(0, true)
  }, [load])

  return (
    <TimelineFeed
      practices={practices}
      tools={tools}
      mentions={mentions}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      onLoadMore={() => void load(practices.length, false)}
      hasMore={more}
    />
  )
}
