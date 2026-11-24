import { supabase } from './supabase'
import type { Comment, CommentVersion } from './types'

export async function listComments(practiceId: string): Promise<Comment[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles(display_name, avatar_url)')
    .eq('practice_id', practiceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Comment[]
}

export async function createComment(
  practiceId: string,
  authorId: string,
  body: string,
): Promise<Comment> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('comments')
    .insert({ practice_id: practiceId, author_id: authorId, body })
    .select('*, author:profiles(display_name, avatar_url)')
    .single()
  if (error) throw error
  return data as Comment
}

export async function updateComment(
  comment: Comment,
  newBody: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error: versionError } = await supabase
    .from('comment_versions')
    .insert({ comment_id: comment.id, body: comment.body })
  if (versionError) throw versionError

  const { error } = await supabase
    .from('comments')
    .update({ body: newBody, updated_at: new Date().toISOString() })
    .eq('id', comment.id)
  if (error) throw error
}

export async function deleteComment(commentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

export async function listCommentVersions(
  commentId: string,
): Promise<CommentVersion[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('comment_versions')
    .select('*')
    .eq('comment_id', commentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CommentVersion[]
}
