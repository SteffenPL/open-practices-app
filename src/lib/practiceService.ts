import { supabase } from './supabase'
import type { Element, Practice } from './types'

export const PRACTICE_IMAGES_BUCKET = 'practice-images'

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

export function imageUrl(path: string | null): string | null {
  if (!path) return null
  if (!supabase) return path
  const { data } = supabase.storage
    .from(PRACTICE_IMAGES_BUCKET)
    .getPublicUrl(path)
  return data.publicUrl
}

export async function listPractices(
  from = 0,
  count = 10,
): Promise<Practice[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('practices')
    .select('*, author:profiles(display_name, avatar_url)')
    .order('last_significant_at', { ascending: false })
    .range(from, from + count - 1)
  if (error) throw error
  return (data ?? []) as Practice[]
}

export async function getPractice(id: string): Promise<Practice | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('practices')
    .select('*, author:profiles(display_name, avatar_url)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Practice
}

export interface PracticeInput {
  title: string
  body: string
  image_path: string | null
}

export async function createPractice(
  authorId: string,
  input: PracticeInput,
): Promise<Practice> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('practices')
    .insert({ author_id: authorId, ...input })
    .select('*, author:profiles(display_name, avatar_url)')
    .single()
  if (error) throw error
  return data as Practice
}

export async function updatePractice(
  id: string,
  input: PracticeInput,
  significant: boolean,
): Promise<Practice> {
  if (!supabase) throw new Error('Supabase is not configured')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('practices')
    .update({
      ...input,
      updated_at: now,
      ...(significant ? { last_significant_at: now } : {}),
    })
    .eq('id', id)
    .select('*, author:profiles(display_name, avatar_url)')
    .single()
  if (error) throw error
  return data as Practice
}

export async function deletePractice(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('practices').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPracticeImage(
  file: File,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const path = `${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage
    .from(PRACTICE_IMAGES_BUCKET)
    .upload(path, file)
  if (error) throw error
  return path
}

export async function deletePracticeImage(path: string): Promise<void> {
  if (!supabase) return
  await supabase.storage.from(PRACTICE_IMAGES_BUCKET).remove([path])
}

export function isSignificantUpdate(practice: Practice): boolean {
  return (
    new Date(practice.last_significant_at).getTime() >
    new Date(practice.published_at).getTime()
  )
}

// --- Elements & Options ---

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

  const optionRows = valid.flatMap((draft) =>
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

  if (optionRows.length > 0) {
    const { error: optionsError } = await supabase
      .from('options')
      .insert(optionRows)
    if (optionsError) throw optionsError
  }
}
