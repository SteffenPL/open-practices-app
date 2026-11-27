import type { CatalogTool } from './catalogService'

export const toolFields = [
  ['name', 'Tool name'],
  ['description', 'Description'],
  ['apm_id', 'APM package identifier'],
  ['repo_url', 'Source repository or package URL'],
  ['website_url', 'Website'],
  ['install_command', 'Install command'],
] as const

export type ToolField = typeof toolFields[number][0]
export type ToolDraft = Record<ToolField, string>


const key = (s: string | null | undefined) => (s || '').trim().toLowerCase().replace(/\/+$/, '')
const words = (s: string) => key(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

type Candidate = Pick<CatalogTool, 'name' | 'apm_id' | 'repo_url' | 'website_url'>

function packageIdentity(input: string | null) {
  const [owner, repo, ...path] = (input || '').trim().replace(/^\/+|\/+$/g, '').split('/')
  return [owner.toLowerCase(), ...(repo ? [repo.toLowerCase(), ...path] : [])].join('/')
}

export function exactPackageMatch(draft: ToolDraft, tool: CatalogTool) {
  const id = packageIdentity(draft.apm_id)
  return !!id && [tool, ...(tool.aliases || [])].some(candidate => id === packageIdentity(candidate.apm_id))
}

function sameSource(a: string | null, b: string | null) {
  const root = (url: string | null) => key(url).match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)/)?.[1].replace(/\.git$/, '')
  return !!root(a) && root(a) === root(b)
}

function similar(draft: ToolDraft, candidate: Candidate) {
  if (sameSource(draft.repo_url, candidate.repo_url)) return true
  if (key(draft.website_url) && key(draft.website_url) === key(candidate.website_url)) return true
  const name = words(draft.name)
  const other = words(candidate.name)
  if (!name || !other) return false
  if (name === other || (Math.min(name.length, other.length) >= 4 && (name.includes(other) || other.includes(name)))) return true
  const tokens = new Set(name.split(' ').filter(s => s.length > 2))
  return other.split(' ').some(s => tokens.has(s))
}

export function catalogMatches(draft: ToolDraft, tools: CatalogTool[]) {
  return tools.filter(tool => exactPackageMatch(draft,tool) || [tool,...(tool.aliases || [])].some(candidate => similar(draft,candidate)))
    .sort((a,b) => Number(exactPackageMatch(draft,b)) - Number(exactPackageMatch(draft,a)) || a.name.localeCompare(b.name))
}

