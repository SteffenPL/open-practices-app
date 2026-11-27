import { supabase } from './supabase'
import type { Tool } from './types'

import { normalizeToolIdentifier } from './toolIdentifier'

async function findTool(identifier: string): Promise<Tool | null> {
  if (!supabase) return null
  // A repository may contain multiple APM packages; match only the package itself.
  const { data, error } = await supabase.from('tools').select('*').eq('apm_id', identifier).maybeSingle()
  if (error) throw error
  if (!data?.merged_into) return data as Tool | null
  const canonical = await supabase.from('tools').select('*').eq('id', data.merged_into).single()
  if (canonical.error) throw canonical.error
  return canonical.data as Tool
}

/**
 * Resolve a Tool by its identifier, provisioning it on first use.
 * The identifier is an APM package ID; "owner/repo" shaped IDs double as
 * GitHub repositories (fallback identity), with metadata fetched from the
 * GitHub API. Provisioned rows are never edited afterwards.
 */
export async function provisionTool(identifier: string): Promise<Tool> {
  if (!supabase) throw new Error('Supabase is not configured')
  const id = normalizeToolIdentifier(identifier)

  const existing = await findTool(id)
  if (existing) return existing

  const [owner, repository, ...path] = id.split('/')
  const repo = `${owner}/${repository}`
  const repoUrl = `https://github.com/${repo}${path.length ? '/tree/HEAD/' + path.join('/') : ''}`
  let name = path.at(-1) || id
  let description: string | null = null
  try {
    const res = path.length ? null : await fetch(`https://api.github.com/repos/${repo}`)
    if (res?.ok) {
      const repo = (await res.json()) as { name?: string; description?: string }
      if (repo.name) name = repo.name
      if (repo.description) description = repo.description
    }
  } catch {
    // Metadata fetch is best-effort; the identifier is the fallback name.
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
      const raced = await findTool(id)
      if (raced) return raced
    }
    throw error
  }
  return data as Tool
}
