/**
 * Turn a thrown error from a save path (Supabase Postgrest/Storage error,
 * plain Error, or anything else) into a readable one-line diagnostic for
 * the editor's error area.
 */
export function describeSaveError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  const e = error as {
    message?: unknown
    code?: unknown
    hint?: unknown
    statusCode?: unknown
  }
  if (typeof e.message === 'string' && e.message) {
    const parts: string[] = []
    if (typeof e.code === 'string' && e.code) parts.push(`code ${e.code}`)
    else if (typeof e.statusCode === 'number') parts.push(`status ${e.statusCode}`)
    if (typeof e.hint === 'string' && e.hint) parts.push(`hint: ${e.hint}`)
    return parts.length > 0 ? `${e.message} (${parts.join(', ')})` : e.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}
