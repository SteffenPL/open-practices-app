import { useCallback, useEffect, useState } from 'react'
import { listPractices } from '../lib/practiceService'
import type { Practice } from '../lib/types'
import { TimelineFeed } from './TimelineFeed'
import { getPracticeFeedDetails, type FeedDetails } from '../lib/elementService'

const PAGE_SIZE = 10

export function TimelinePage({ searchQuery }: { searchQuery: string }) {
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [details, setDetails] = useState<Record<string, FeedDetails>>({})

  const load = useCallback(async (from: number, replace: boolean) => {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    try {
      const page = await listPractices(from, PAGE_SIZE)
      setPractices((previous) => (replace ? page : [...previous, ...page]))
      setMore(page.length === PAGE_SIZE)
      setError(null)
      try {
        const pageDetails = await getPracticeFeedDetails(page.map((practice) => practice.id))
        setDetails((previous) => replace ? pageDetails : { ...previous, ...pageDetails })
      } catch {
        // Skill labels are supplementary; a tag lookup should not block the feed.
      }
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
      details={details}
      searchQuery={searchQuery}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      onLoadMore={() => void load(practices.length, false)}
      hasMore={more}
    />
  )
}
