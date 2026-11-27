import { supabase } from './supabase'
import type { Element } from './types'

/** Read historical option records as notes and tool references. */
export async function getElements(practiceId: string): Promise<Element[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('elements')
    .select('*, options(*, tool:tools(*))')
    .eq('practice_id', practiceId)
    .order('position', { ascending: true })
  if (error) throw error
  const elements = (data ?? []) as Element[]
  for (const element of elements) {
    element.options.sort((a, b) => a.position - b.position)
  }
  return elements
}

export type PracticeToolLink = { id: string; name: string; slug: string }

export async function listLegacyFeedTools(practiceIds: string[]): Promise<Record<string, PracticeToolLink[]>> {
  if (!supabase || !practiceIds.length) return {}
  const { data, error } = await supabase
    .from('elements')
    .select('practice_id, options(tool:tools(*))')
    .in('practice_id', practiceIds)
    .order('position')
  if (error) throw error

  const byPractice: Record<string, PracticeToolLink[]> = {}
  for (const element of data ?? []) {
    const links = byPractice[element.practice_id] ??= []
    for (const option of element.options) {
      const tool = Array.isArray(option.tool) ? option.tool[0] : option.tool
      if (tool && !links.some(link => link.id === tool.id)) {
        links.push({ id: tool.id, name: tool.name, slug: tool.slug ?? tool.name })
      }
    }
  }
  return byPractice
}
