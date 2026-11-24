import { supabase } from './supabase'
import type { Tool } from './types'

/**
 * Resolve a Tool by its identifier, provisioning it on first use.
 * The identifier is an APM package ID; "owner/repo" shaped IDs are also
 * treated as GitHub repositories (fallback identity), with metadata
 * fetched from the GitHub API. Provisioned rows are never edited afterwards.
 */
export async function provisionTool(identifier: string): Promise<Tool> {
  if (!supabase) throw new Error('Supabase is not configured')
  const id = identifier.trim()
  if (!id) throw new Error('Empty tool identifier')

  const isRepoShaped = /^[\w.-]+\/[\w.-]+$/.test(id)
  const repoUrl = isRepoShaped ? `https://github.com/${id}` : null

  const { data: existing, error: selectError } = await supabase
    .from('tools')
    .select('*')
    .or(`apm_id.eq.${id}${repoUrl ? `,repo_url.eq.${repoUrl}` : ''}`)
    .maybeSingle()
  if (selectError) throw selectError
  if (existing) return existing as Tool

  let name = id
  let description: string | null = null
  if (isRepoShaped) {
    try {
      const res = await fetch(`https://api.github.com/repos/${id}`)
      if (res.ok) {
        const repo = (await res.json()) as { name?: string; description?: string }
        if (repo.name) name = repo.name
        if (repo.description) description = repo.description
      }
    } catch {
      // Metadata fetch is best-effort; the identifier is the fallback name.
    }
  }

  const { data, error } = await supabase
    .from('tools')
    .insert({ apm_id: id, repo_url: repoUrl, name, description })
    .select()
    .single()
  if (error) {
    // Lost a race against another author provisioning the same tool:
    // fall back to the row that won.
    if (error.code === '23505') {
      const { data: raced, error: raceError } = await supabase
        .from('tools')
        .select('*')
        .or(`apm_id.eq.${id}${repoUrl ? `,repo_url.eq.${repoUrl}` : ''}`)
        .maybeSingle()
      if (raceError) throw raceError
      if (raced) return raced as Tool
    }
    throw error
  }
  return data as Tool
}
