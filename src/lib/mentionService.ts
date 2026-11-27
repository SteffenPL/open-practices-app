import { supabase } from './supabase'
import type { CatalogTool } from './catalogService'
import type { Practice } from './types'

export interface MentionInput {
  tool_id: string
  token: string
  install_command?: string | null
  notes?: string | null
}

export interface PracticeMention extends MentionInput {
  position: number
  tool: CatalogTool
}

export interface MentionPracticeInput {
  id?: string
  request_id?: string
  title: string
  body: string
  image_path: string | null
  mentions: MentionInput[]
  significant?: boolean
  source_url?: string | null
}

export async function saveMentionPractice(input: MentionPracticeInput): Promise<Practice> {
  if (!supabase) throw new Error('Supabase is not configured')
  const fields = {
    p_title: input.title, p_body: input.body, p_image_path: input.image_path,
    p_mentions: input.mentions, p_source_url: input.source_url ?? null,
  }
  const operation = !input.id && input.request_id
    ? supabase.rpc('create_mention_practice_once', { ...fields, p_request_id: input.request_id })
    : supabase.rpc('save_mention_practice', {
        ...fields, p_id: input.id ?? null, p_significant: input.significant ?? false,
      })
  const { data, error } = await operation.single()
  if (error) throw error
  return data as Practice
}

interface MentionRow {
  practice_id: string
  tool_id: string
  position: number
  token: string
  tool: CatalogTool
  setup: { install_command: string | null; notes: string | null }
}

export async function listFeedMentions(ids: string[]): Promise<Record<string, PracticeMention[]>> {
  if (!supabase || !ids.length) return {}
  const byPractice: Record<string, PracticeMention[]> = {}
  // A feed page can contain more mentions than the default PostgREST row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('practice_tool_mentions')
      .select('practice_id,position,tool_id,token,tool:tools(*),setup:practice_tool_setups(install_command,notes)')
      .in('practice_id', ids).order('practice_id').order('position').range(offset, offset + 499)
    if (error) throw error
    for (const row of data as unknown as MentionRow[]) {
      const { practice_id, setup, ...mention } = row
      ;(byPractice[practice_id] ??= []).push({ ...mention, ...setup })
    }
    if (data.length < 500) return byPractice
  }
}

export async function listPracticeMentions(id: string): Promise<PracticeMention[]> {
  return (await listFeedMentions([id]))[id] ?? []
}
