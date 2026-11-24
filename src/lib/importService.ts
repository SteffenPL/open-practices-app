import type { PracticeDefinition } from './practiceDefinition'
import type { ElementDraft } from './elementService'
import { provisionTool } from './toolService'

/** Parse owner/repo out of a GitHub URL. */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl
    .trim()
    .replace(/\/+$/, '')
    .match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) {
    throw new Error('Enter a GitHub repository URL like https://github.com/owner/repo')
  }
  return { owner: match[1], repo: match[2] }
}

export function toRawUrl(owner: string, repo: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path.replace(/^\/+/, '')}`
}

/** Human-facing repo URL for an imported practice's stored raw file URL. */
export function sourceDisplayUrl(rawUrl: string): string {
  const match = rawUrl.match(
    /^https?:\/\/raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\/[^/]+\/.*$/,
  )
  if (match) return `https://github.com/${match[1]}/${match[2]}`
  return rawUrl
}

/**
 * The URL Sync fetches a definition from. Practices store a raw file URL;
 * if a frontmatter `source` gave a repo URL (or repo path), derive the raw
 * default-branch file URL from it.
 */
export function toFetchableSourceUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\/raw\.githubusercontent\.com\//.test(trimmed)) {
    return trimmed
  }
  const blob = trimmed.match(
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/]+\/(.+)$/,
  )
  if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/HEAD/${blob[3]}`
  const repo = trimmed.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (repo) {
    return `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/HEAD/${DEFAULT_PATH}`
  }
  return trimmed
}

export const DEFAULT_PATH = 'practice.md'
export const FALLBACK_PATH = 'README.md'

/**
 * Fetch a Practice Definition from a public GitHub repository.
 * Tries the given path; when the default path isn't found, falls back
 * to README.md.
 */
export async function fetchDefinition(
  repoUrl: string,
  path: string,
): Promise<{ markdown: string; rawUrl: string; path: string }> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const effectivePath = path.trim() || DEFAULT_PATH

  const attempt = async (p: string) => {
    const rawUrl = toRawUrl(owner, repo, p)
    const res = await fetch(rawUrl)
    if (!res.ok) return null
    return { markdown: await res.text(), rawUrl, path: p }
  }

  const first = await attempt(effectivePath)
  if (first) return first

  if (effectivePath === DEFAULT_PATH) {
    const fallback = await attempt(FALLBACK_PATH)
    if (fallback) return fallback
  }

  throw new Error(
    `No definition found in ${owner}/${repo}: tried ${effectivePath}` +
      (effectivePath === DEFAULT_PATH ? ` and ${FALLBACK_PATH}` : ''),
  )
}

/**
 * Convert a parsed definition into editor drafts, resolving tool
 * identifiers to Tool catalog ids (with per-identifier caching; failed
 * lookups leave the option unlinked rather than failing the whole import).
 */
export async function provisionDrafts(
  definition: PracticeDefinition,
): Promise<ElementDraft[]> {
  const cache = new Map<string, string | null>()
  const resolve = async (identifier: string) => {
    if (!cache.has(identifier)) {
      try {
        cache.set(identifier, (await provisionTool(identifier)).id)
      } catch {
        cache.set(identifier, null)
      }
    }
    return cache.get(identifier) ?? null
  }

  const drafts: ElementDraft[] = []
  for (const element of definition.elements) {
    const options = []
    for (const option of element.options) {
      options.push({
        id: option.id,
        name: option.name,
        description: option.description,
        tool_id: option.toolIdentifier ? await resolve(option.toolIdentifier) : null,
      })
    }
    drafts.push({
      id: element.id,
      name: element.name,
      description: element.description,
      require_options: element.require_options,
      reject_options: element.reject_options,
      options,
    })
  }
  return drafts
}
