import { supabase } from './supabase'
import type { Tool } from './types'

/** Identifiers must not be able to alter PostgREST filter syntax. */
const SAFE_IDENTIFIER = /^[\w@.-]+\/[\w@.-]+$/

/**
 * Normalize what the author typed into a canonical identifier:
 * "owner/repo" is used as-is; a GitHub URL becomes "owner/repo";
 * anything else (e.g. an npm-style id) is kept if it is filter-safe.
 */
export function normalizeToolIdentifier(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/,
  )
  if (urlMatch) return `${urlMatch[1]}/${urlMatch[2]}`
  if (!SAFE_IDENTIFIER.test(trimmed)) {
    throw new Error(`Invalid tool identifier: "${trimmed}"`)
  }
  return trimmed
}

async function findTool(identifier: string, repoUrl: string | null): Promise<Tool | null> {
  if (!supabase) return null
  const filter = repoUrl
    ? `apm_id.eq.${identifier},repo_url.eq.${repoUrl}`
    : `apm_id.eq.${identifier}`
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .or(filter)
    .maybeSingle()
  if (error) throw error
  return (data as Tool) ?? null
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

  const existing = await findTool(id, `https://github.com/${id}`)
  if (existing) return existing

  let name = id
  let description: string | null = null
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

  const { data, error } = await supabase
    .from('tools')
    .insert({ apm_id: id, repo_url: `https://github.com/${id}`, name, description })
    .select()
    .single()
  if (error) {
    // Lost a race against another author provisioning the same tool:
    // fall back to the row that won.
    if (error.code === '23505') {
      const raced = await findTool(id, `https://github.com/${id}`)
      if (raced) return raced
    }
    throw error
  }
  return data as Tool
}
