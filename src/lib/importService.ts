import { resolveMentionTool } from './mentionIdentity'
import type { PracticeDefinition } from './practiceDefinition'
import { normalizeToolIdentifier } from './toolIdentifier'
import { provisionTool } from './toolService'
import { listTools } from './catalogService'
import type { MentionInput } from './mentionService'
import type { Practice } from './types'
import { saveMentionPractice } from './mentionService'

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

/** Resolve mentions without inventing a command. Legacy linked options may
 * provision by their explicit package identifier; new #slug mentions must
 * already exist in the shared catalog. */
export async function provisionMentions(definition: PracticeDefinition): Promise<MentionInput[]> {
  const catalog = await listTools()
  const byPackage = new Map(catalog.flatMap(tool => [tool, ...(tool.aliases ?? [])]
    .filter(entry => entry.apm_id).map(entry => [entry.apm_id, tool] as const)))
  const provisioned = new Map<string, string>()
  const result: MentionInput[] = []
  for (const mention of definition.mentions ?? []) {
    let tool: (typeof catalog)[number] | undefined
    if (mention.toolIdentifier) {
      const normalized = normalizeToolIdentifier(mention.toolIdentifier)
      tool = byPackage.get(normalized)
    } else {
      tool = resolveMentionTool(mention.token, catalog)
    }
    if (!tool && mention.toolIdentifier) {
      const key = normalizeToolIdentifier(mention.toolIdentifier)
      let id = provisioned.get(key)
      if (!id) {
        try { id = (await provisionTool(mention.toolIdentifier)).id; provisioned.set(key, id) }
        catch { /* an unavailable legacy tool remains an unlinked plain hashtag */ }
      }
      if (id) tool = catalog.find((item) => item.id === id) ?? (await listTools()).find((item) => item.id === id)
      // An unavailable legacy package remains plain text; never bind it to a
      // different catalog entry just because the generated display slug matches.
      if (!tool) continue
    }
    if (!tool) throw new Error(`Tool #${mention.slug} is not in the catalog. Add it to the catalog, then retry the import.`)
    result.push({ tool_id: tool.id, token: mention.token, install_command: mention.installCommand, notes: mention.notes })
  }
  return result
}

/** Create an imported post through the atomic mention RPC with a stable retry key. */
export async function publishImportedPractice(input: {
  requestId: string; title: string; body: string; image_path: string | null;
  mentions: MentionInput[]; source_url: string | null
}): Promise<Practice> {
  return saveMentionPractice({
    title: input.title, body: input.body, image_path: input.image_path,
    mentions: input.mentions, source_url: input.source_url, request_id: input.requestId,
  })
}
