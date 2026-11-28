import { supabase } from './supabase'
import type { CatalogTool } from './catalogService'
import type { Element, Option } from './types'

/** Read historical option records as notes and tool references. */
type CatalogElement = Omit<Element, 'options'> & {options: (Omit<Option, 'tool'> & {tool: CatalogTool | null})[]}
export async function getElements(practiceId: string): Promise<CatalogElement[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('elements')
    .select('*, options(*, tool:tools(*))')
    .eq('practice_id', practiceId)
    .order('position', { ascending: true })
  if (error) throw error
  const elements = (data ?? []) as CatalogElement[]
  for (const element of elements) {
    element.options.sort((a, b) => a.position - b.position)
  }
  return elements
}

export type PracticeToolLink = Pick<CatalogTool, 'id' | 'name' | 'slug' | 'install_command' | 'install_commands'> & Partial<Pick<CatalogTool, 'apm_id' | 'urls' | 'repo_url' | 'website_url'>>

export async function listLegacyFeedTools(practiceIds: string[]): Promise<Record<string, PracticeToolLink[]>> {
  if (!supabase || !practiceIds.length) return {}
  const { data, error } = await supabase
    .from('elements')
    .select('practice_id, options(position, tool:tools(id,name,slug,apm_id,install_command,install_commands,repo_url,website_url,urls))')
    .in('practice_id', practiceIds)
    .order('position').order('position', { referencedTable: 'options' })
  if (error) throw error

  const byPractice: Record<string, PracticeToolLink[]> = {}
  for (const element of data ?? []) {
    const links = byPractice[element.practice_id] ??= []
    for (const option of element.options) {
      const tool = Array.isArray(option.tool) ? option.tool[0] : option.tool
      if (tool && !links.some(link => link.id === tool.id)) {
        links.push({ ...tool, slug: tool.slug ?? tool.name })
      }
    }
  }
  return byPractice
}
