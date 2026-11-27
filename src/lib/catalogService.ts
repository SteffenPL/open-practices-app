import { supabase } from './supabase'
import { AUTHOR_SELECT } from './selects'
import type { Practice, Tool } from './types'

export interface CatalogTool extends Tool {
  slug: string
  website_url: string | null
  install_command: string | null
  merged_into: string | null
  updated_at: string
  aliases?: Pick<CatalogTool, 'id' | 'name' | 'slug' | 'apm_id' | 'repo_url' | 'website_url'>[]
}

export interface ToolInput {
  name: string
  description?: string | null
  apm_id?: string | null
  repo_url?: string | null
  website_url?: string | null
  install_command?: string | null
}

export interface ToolRevision {
  id: string
  tool_id: string
  editor_id: string | null
  editor?: {display_name:string; avatar_url:string|null} | null
  action: 'create' | 'edit' | 'merge'
  before: CatalogTool | null
  after: CatalogTool
  created_at: string
}

function database() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function listTools(query = ''): Promise<CatalogTool[]> {
  if (!supabase) return []
  const result: CatalogTool[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('tools').select('*').order('name').order('id').range(offset, offset + 499)
    if (error) throw error
    result.push(...(data as CatalogTool[]))
    if (data.length < 500) break
  }
  const catalog = new Map(result.filter((tool) => !tool.merged_into).map((tool) => [tool.id,tool]))
  for (const alias of result) {
    if (!alias.merged_into) continue
    const canonical = catalog.get(alias.merged_into)
    if (canonical) {
      canonical.aliases ??= []
      canonical.aliases.push(alias)
    }
  }
  const term = query.trim().toLowerCase().replace(/^#/, '')
  if (!term) return [...catalog.values()]
  const ids = new Set(result.filter((tool) =>
    [tool.name, tool.slug, tool.apm_id, tool.repo_url, tool.website_url, tool.description]
      .some((value) => value?.toLowerCase().includes(term)),
  ).map((tool) => tool.merged_into ?? tool.id))
  return result.filter((tool) => !tool.merged_into && ids.has(tool.id))
}

export async function getTool(id: string): Promise<CatalogTool | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('tools').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as CatalogTool | null
}

export async function createTool(input: ToolInput): Promise<CatalogTool> {
  const { data, error } = await database().from('tools').insert(input).select().single()
  if (error) throw error
  return data as CatalogTool
}

export async function updateTool(id: string, input: ToolInput, expectedUpdatedAt: string): Promise<CatalogTool> {
  const { data, error } = await database().rpc('edit_catalog_tool', {
    p_id: id, p_fields: input, p_expected_updated_at: expectedUpdatedAt,
  }).single()
  if (error) throw error
  return data as CatalogTool
}

export async function mergeTools(sourceId: string, targetId: string): Promise<CatalogTool> {
  const { data, error } = await database().rpc('merge_catalog_tools', { p_source: sourceId, p_target: targetId }).single()
  if (error) throw error
  return data as CatalogTool
}

export async function listToolHistory(id: string): Promise<ToolRevision[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('tool_revisions').select('*,editor:profiles(display_name,avatar_url)').eq('tool_id', id).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ToolRevision[]
}

export async function listToolPractices(id: string): Promise<Practice[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('catalog_tool_practices', { p_id: id }).select(AUTHOR_SELECT)
  if (error) throw error
  return (data ?? []) as Practice[]
}
