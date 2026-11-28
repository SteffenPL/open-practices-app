import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { grantExpiry, isGrant, openGrant, sealGrant } from './grant.ts'

export type Scope = 'read' | 'practices' | 'catalog' | 'contribute'
export interface Access {
  client: SupabaseClient
  userId: string
  scope: Scope
  browserSession: string | null
  grantId: string | null
}
export const scopes = ['read', 'practices', 'catalog', 'contribute'] as const
export async function authenticate(req: Request): Promise<Access | null> {
  const token = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token || token.length > 20000) return null
  const delegated = isGrant(token)
  const envelope = delegated ? await openGrant(token) : null
  if (delegated && !envelope) return null
  const jwt = envelope?.session || token
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: 'Bearer ' + jwt } },
    },
  )
  const { data, error } = await client.auth.getUser(jwt)
  if (error || !data.user) return null
  if (!envelope) {
    return {
      client,
      userId: data.user.id,
      scope: 'contribute',
      browserSession: jwt,
      grantId: null,
    }
  }
  const grant = await client.from('agent_grants').select('scope,expires_at').eq(
    'id',
    envelope.id,
  ).eq('owner_id', data.user.id).maybeSingle()
  if (
    grant.error || !grant.data ||
    Date.parse(grant.data.expires_at) <= Date.now()
  ) return null
  return {
    client,
    userId: data.user.id,
    scope: grant.data.scope,
    browserSession: null,
    grantId: envelope.id,
  }
}
export async function issueGrant(access: Access, scope: Scope) {
  const jwt = access.browserSession!
  const expires = grantExpiry(jwt)
  if (!Number.isFinite(expires) || expires < Date.now() + 10_000) {
    throw Error('Sign in again before issuing a grant.')
  }
  const result = await access.client.from('agent_grants').insert({
    scope,
    expires_at: new Date(expires).toISOString(),
  }).select('id,scope,expires_at').single()
  if (result.error) throw Error(result.error.message)
  return {
    ...result.data,
    token: await sealGrant({ id: result.data.id, session: jwt, expires }),
  }
}
