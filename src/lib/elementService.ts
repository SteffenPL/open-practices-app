import { optionCommands, type PracticeCommand } from '../pages/guidedPracticeContent'
import { supabase } from './supabase'
import type { Element } from './types'

/** Authoring-time Element shape (client-generated ids, no rows yet). */
export interface OptionDraft {
  id: string
  name: string
  description: string
  tool_id: string | null
}

export interface ElementDraft {
  id: string
  name: string
  description: string
  require_options: string[]
  reject_options: string[]
  options: OptionDraft[]
}

export function emptyElementDraft(): ElementDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    require_options: [],
    reject_options: [],
    options: [
      { id: crypto.randomUUID(), name: '', description: '', tool_id: null },
      { id: crypto.randomUUID(), name: '', description: '', tool_id: null },
    ],
  }
}

export function emptyOptionDraft(): OptionDraft {
  return { id: crypto.randomUUID(), name: '', description: '', tool_id: null }
}

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

export interface PracticeSkillTag {
  name: string
  packageId: string
}

export type FeedDetails = { tags: PracticeSkillTag[]; commands: PracticeCommand[] }

export async function getPracticeFeedDetails(practiceIds: string[]): Promise<Record<string, FeedDetails>> {
  if (!supabase || !practiceIds.length) return {}
  const { data, error } = await supabase
    .from('elements')
    .select('practice_id, position, options(name, description, position, tool:tools(apm_id))')
    .in('practice_id', practiceIds)
    .order('position')
  if (error) throw error

  const byPractice: Record<string, FeedDetails> = {}
  for (const element of data ?? []) {
    const details = byPractice[element.practice_id] ??= { tags: [], commands: [] }
    const options = element.options.sort((a, b) => a.position - b.position)
    details.commands.push(...optionCommands(options))
    for (const option of options) {
      const tool = Array.isArray(option.tool) ? option.tool[0] : option.tool
      const packageId = tool?.apm_id
      const name = option.name.trim()
      if (packageId && name && !details.tags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) {
        details.tags.push({ name, packageId })
      }
    }
  }
  return byPractice
}

export function toElementDrafts(elements: Element[]): ElementDraft[] {
  return elements.map((element) => ({
    id: element.id,
    name: element.name,
    description: element.description ?? '',
    require_options: element.require_options,
    reject_options: element.reject_options,
    options: element.options.map((option) => ({
      id: option.id,
      name: option.name,
      description: option.description ?? '',
      tool_id: option.tool_id,
    })),
  }))
}

/** An Element is publishable when named and offering at least two Options. */
export function elementDraftError(drafts: ElementDraft[]): string | null {
  for (const draft of drafts) {
    if (!draft.name.trim()) continue
    const named = draft.options.filter((option) => option.name.trim())
    if (named.length < 2) {
      return `Element "${draft.name.trim()}" needs at least two named options.`
    }
  }
  return null
}

/**
 * Persist the full set of a Practice's Elements and Options.
 * Replaces everything: delete-all then re-insert, using client-generated
 * stable ids so visibility rules keep referencing valid Option ids.
 */
export async function saveElements(
  practiceId: string,
  drafts: ElementDraft[],
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')

  const valid = drafts.filter((draft) => draft.name.trim().length > 0)

  const { error: deleteError } = await supabase
    .from('elements')
    .delete()
    .eq('practice_id', practiceId)
  if (deleteError) throw deleteError

  if (valid.length === 0) return

  const { error: elementsError } = await supabase.from('elements').insert(
    valid.map((draft, index) => ({
      id: draft.id,
      practice_id: practiceId,
      position: index,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      require_options: draft.require_options,
      reject_options: draft.reject_options,
    })),
  )
  if (elementsError) throw elementsError

  const rows = valid.flatMap((draft) =>
    draft.options
      .filter((option) => option.name.trim().length > 0)
      .map((option, index) => ({
        id: option.id,
        element_id: draft.id,
        position: index,
        name: option.name.trim(),
        description: option.description.trim() || null,
        tool_id: option.tool_id,
      })),
  )

  if (rows.length > 0) {
    const { error: optionsError } = await supabase
      .from('options')
      .insert(rows)
    if (optionsError) throw optionsError
  }
}
