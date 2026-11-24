import { supabase } from './supabase'
import { AUTHOR_SELECT } from './selects'
import type { Practice } from './types'

export const PRACTICE_IMAGES_BUCKET = 'practice-images'

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
    .select(AUTHOR_SELECT)
    .order('last_significant_at', { ascending: false })
    .range(from, from + count - 1)
  if (error) throw error
  return (data ?? []) as Practice[]
}

export async function getPractice(id: string): Promise<Practice | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('practices')
    .select(AUTHOR_SELECT)
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
    .select(AUTHOR_SELECT)
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
    .select(AUTHOR_SELECT)
    .single()
  if (error) throw error
  return data as Practice
}

export async function deletePractice(
  practice: Pick<Practice, 'id' | 'image_path'>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  if (practice.image_path) {
    await supabase.storage
      .from(PRACTICE_IMAGES_BUCKET)
      .remove([practice.image_path])
  }
  const { error } = await supabase
    .from('practices')
    .delete()
    .eq('id', practice.id)
  if (error) throw error
}

export async function uploadPracticeImage(file: File): Promise<string> {
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
