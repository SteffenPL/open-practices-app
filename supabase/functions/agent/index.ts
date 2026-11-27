// Agent API: lets an AI agent holding an Agent Access token (the user's
// Supabase session token, see ADR 0001) create, read, and update that
// user's Practices by submitting a Practice Definition in Markdown.
//
//   POST   /practices      { definition }          -> { id, url }
//   GET    /practices/:id                           -> { definition }
//   PATCH  /practices/:id  { definition, significant? = false } -> { id, url }
//
// All writes go through the user-scoped client, so RLS enforces ownership
// on every call. No delete, no comments on this path.

import { normalizeToolIdentifier } from '../../../src/lib/toolIdentifier.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  legacyAlternativeNotes,
  parseDefinition,
  renderDefinition,
  type PracticeDefinition,
} from '../../../src/lib/practiceDefinition.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
}

interface Route {
  method: string
  segments: string[]
  body?: { definition?: string; significant?: boolean; request_id?: string }
}

async function resolveDefinitionMentions(client: SupabaseClient, definition: PracticeDefinition) {
  const result = []
  for (const mention of definition.mentions ?? []) {
    let tool: { id: string; slug: string; merged_into: string | null } | null = null
    if (mention.toolIdentifier) {
      const id = normalizeToolIdentifier(mention.toolIdentifier)
      const byPackage = await client.from('tools').select('id,slug,merged_into').eq('apm_id', id).maybeSingle()
      tool = byPackage.data
      if (!tool) continue // unknown legacy package stays a plain-text hashtag
    } else {
      const bySlug = await client.from('tools').select('id,slug,merged_into').eq('slug', mention.slug).maybeSingle()
      tool = bySlug.data
    }
    if (!tool) throw new Error(`Tool #${mention.slug} is not in the catalog.`)
    result.push({ tool_id: tool.merged_into ?? tool.id, token: mention.token, install_command: mention.installCommand, notes: mention.notes })
  }
  return result
}

async function saveDefinition(client: SupabaseClient, definition: PracticeDefinition, options: {
  id?: string; significant?: boolean; requestId?: string; sourceUrl?: string | null
}) {
  const mentions = await resolveDefinitionMentions(client, definition)
  const args: Record<string, unknown> = {
    p_title: definition.title, p_body: definition.body,
    p_image_path: definition.image, p_mentions: mentions,
  }
  const operation = !options.id && options.requestId
    ? client.rpc('create_mention_practice_once', {
        ...args, p_request_id: options.requestId, p_source_url: options.sourceUrl ?? null,
      })
    : client.rpc('save_mention_practice', {
        ...args, p_id: options.id ?? null,
        p_significant: options.significant ?? false, p_source_url: options.sourceUrl ?? null,
      })
  const { data, error } = await operation
  if (error) throw new Error(error.message)
  return data as { id: string }
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function userClient(req: Request): Promise<
  { client: SupabaseClient; userId: string } | null
> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return { client, userId: data.user.id }
}

/**
 * The raw file URL a practice's definition is fetched from (Sync).
 * Frontmatter `source` may be a repo URL or a repo blob URL; derive the
 * raw default-branch file URL from it.
 */
function toFetchableSourceUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\/raw\.githubusercontent\.com\//.test(trimmed)) return trimmed
  const blob = trimmed.match(
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/]+\/(.+)$/,
  )
  if (blob) {
    return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/HEAD/${blob[3]}`
  }
  const repo = trimmed.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (repo) {
    return `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/HEAD/practice.md`
  }
  return trimmed
}

function siteUrl(id: string): string {
  return `https://steffenpl-share.exe.xyz/open-practices/#/practice/${id}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean).slice(1) // after /agent
  let body: Route['body'] = {}
  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      body = await req.json()
    } catch {
      return json(400, { error: 'Body must be JSON.' })
    }
  }
  const auth = await userClient(req)
  if (!auth) {
    return json(401, {
      error:
        'Missing or invalid Authorization: Bearer grant. Get an Agent Access grant from the user (expires after ~1 hour).',
    })
  }
  const { client, userId } = auth
  const requestBody = body ?? {}

  try {
    if (req.method === 'POST' && segments[0] === 'practices' && segments.length === 1) {
      const definition = parseDefinition(requestBody.definition ?? '')
      const practice = await saveDefinition(client, definition, {
        requestId: requestBody.request_id,
        sourceUrl: definition.source ? toFetchableSourceUrl(definition.source) : null,
      })
      return json(201, { id: practice.id, url: siteUrl(practice.id as string) })
    }

    if (req.method === 'PATCH' && segments[0] === 'practices' && segments.length === 2) {
      const id = segments[1]
      const { data: existingPractice, error: fetchError } = await client
        .from('practices')
        .select('id, author_id')
        .eq('id', id)
        .single()
      if (fetchError || !existingPractice) {
        return json(404, { error: 'Practice not found.' })
      }
      if (existingPractice.author_id !== userId) {
        return json(403, { error: 'Not your practice.' })
      }
      const definition = parseDefinition(requestBody.definition ?? '')
      await saveDefinition(client, definition, {
        id, significant: requestBody.significant,
        sourceUrl: definition.source ? toFetchableSourceUrl(definition.source) : null,
      })
      return json(200, { id, url: siteUrl(id) })
    }

    if (req.method === 'GET' && segments[0] === 'practices' && segments.length === 2) {
      const id = segments[1]
      const { data: practice, error } = await client
        .from('practices')
        .select('*')
        .eq('id', id)
        .single()
      if (error || !practice) {
        return json(404, { error: 'Practice not found.' })
      }
      const { data: elements } = await client
        .from('elements')
        .select('*, options(*, tool:tools(*))')
        .eq('practice_id', id)
        .order('position', { ascending: true })
      const sorted = (elements ?? []).map((element: Record<string, unknown>) => ({
        ...element,
        options: ((element.options as Record<string, unknown>[]) ?? [])
          .slice()
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            (a.position as number) - (b.position as number),
          ),
      }))
      const { data: mentionRows, error: mentionError } = await client.from('practice_tool_mentions')
        .select('token,tool_id,position,tool:tools(slug,apm_id),setup:practice_tool_setups(install_command,notes)')
        .eq('practice_id', id).order('position')
      if (mentionError) throw new Error(mentionError.message)
      const definition: PracticeDefinition = {
        title: practice.title as string,
        // Definitions promise full URLs; editor-uploaded storage paths
        // don't conform, so they are omitted rather than emitted broken.
        image:
          practice.image_path && /^https?:\/\//.test(practice.image_path as string)
            ? (practice.image_path as string)
            : null,
        source: (practice.source_url as string | null) ?? null,
        body: practice.body as string,
        elements: sorted.map((element: Record<string, unknown>) => ({
          id: element.id as string,
          name: element.name as string,
          description: (element.description as string | null) ?? '',
          require_options: (element.require_options as string[]) ?? [],
          reject_options: (element.reject_options as string[]) ?? [],
          options: ((element.options as Record<string, unknown>[]) ?? []).map(
            (option) => ({
              id: option.id as string,
              name: option.name as string,
              description: (option.description as string | null) ?? '',
              toolIdentifier:
                (option.tool as Record<string, unknown> | null)?.apm_id as
                  | string
                  | null ?? null,
            }),
          ),
        })),
        mentions: (mentionRows ?? []).map((row: Record<string, unknown>) => {
          const tool = row.tool as Record<string, unknown> | null
          const setup = row.setup as Record<string, unknown> | null
          return { token: row.token as string, slug: String(row.token).slice(1).toLowerCase(), toolIdentifier: (tool?.apm_id as string) ?? null,
            installCommand: (setup?.install_command as string | null) ?? null, notes: (setup?.notes as string | null) ?? null }
        }),
        legacyNotes: practice.mention_format ? '' : undefined,
      }
      // Editing a historical practice keeps its old alternative records as readable notes.
      if (practice.mention_format && definition.elements.length) {
        const notes = legacyAlternativeNotes(definition.elements)
        if (notes && !definition.body.includes(notes)) {
          definition.body += '\n\n## Alternatives\n\n' + notes
        }
      }
      return json(200, {
        id,
        url: siteUrl(id),
        definition: renderDefinition(definition),
      })
    }

    return json(404, {
      error: 'Unknown route. Use POST/GET/PATCH /practices[/:id].',
    })
  } catch (e) {
    return json(400, {
      error: e instanceof Error ? e.message : 'Request failed.',
    })
  }
})
