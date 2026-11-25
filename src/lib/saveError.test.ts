import { describe, expect, it } from 'vitest'
import { describeSaveError } from './saveError'

describe('describeSaveError', () => {
  it('includes message, code and hint of a Postgrest error', () => {
    const error = {
      name: 'PostgrestError',
      message: 'insert or update on table "practices" violates foreign key constraint',
      code: '23503',
      hint: 'No matching row in profiles.',
      details: null,
    }
    expect(describeSaveError(error)).toBe(
      'insert or update on table "practices" violates foreign key constraint ' +
        '(code 23503, hint: No matching row in profiles.)',
    )
  })

  it('omits code and hint when absent', () => {
    const error = { message: 'row-level security policy blocked the insert', code: '42501' }
    expect(describeSaveError(error)).toBe(
      'row-level security policy blocked the insert (code 42501)',
    )
  })

  it('uses the message of a plain Error', () => {
    expect(describeSaveError(new Error('Supabase is not configured'))).toBe(
      'Supabase is not configured',
    )
  })

  it('includes code and hint on Error subclasses that carry them', () => {
    const error = new Error('Bucket not found')
    Object.assign(error, { code: '404', hint: 'Create the bucket first' })
    expect(describeSaveError(error)).toBe(
      'Bucket not found (code 404, hint: Create the bucket first)',
    )
  })

  it('includes a numeric statusCode for storage errors', () => {
    const error = new Error('Bucket not found')
    Object.assign(error, { statusCode: 404 })
    expect(describeSaveError(error)).toBe('Bucket not found (status 404)')
  })

  it('renders a readable fallback for non-error values', () => {
    expect(describeSaveError(undefined)).toBe('Unknown error')
    expect(describeSaveError('boom')).toBe('boom')
  })
})
