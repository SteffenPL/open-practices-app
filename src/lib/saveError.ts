/**
 * Turn a thrown error from a save path (Supabase Postgrest/Storage error,
 * plain Error, or anything else) into a readable one-line diagnostic for
 * the editor's error area.
 */
export function describeSaveError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const e = error as { message?: unknown; code?: unknown; hint?: unknown }
  if (typeof e.message === 'string' && e.message) {
    const parts: string[] = []
    if (typeof e.code === 'string' && e.code) parts.push(`code ${e.code}`)
    if (typeof e.hint === 'string' && e.hint) parts.push(`hint: ${e.hint}`)
    return parts.length > 0 ? `${e.message} (${parts.join(', ')})` : e.message
  }
  return String(error)
}
