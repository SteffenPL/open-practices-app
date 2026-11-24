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

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
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
  body?: { definition?: string; significant?: boolean }
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

/** Same provisioning rules as the app's tool service, on the user client. */
async function resolveToolId(
  client: SupabaseClient,
  input: string,
): Promise<string | null> {
  // Normalize: a GitHub URL becomes owner/repo; identifiers must be
  // filter-safe (mirrors the app's normalizeToolIdentifier).
  let id = input.trim().replace(/\/+$/, '')
  const urlMatch = id.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (urlMatch) id = `${urlMatch[1]}/${urlMatch[2]}`
  if (!/^[\w@.-]+\/[\w@.-]+$/.test(id)) return null

  const repoUrl = `https://github.com/${id}`
  const filter = `apm_id.eq.${id},repo_url.eq.${repoUrl}`

  const { data: existing } = await client
    .from('tools')
    .select('id')
    .or(filter)
    .maybeSingle()
  if (existing) return existing.id as string

  let name = id
  let description: string | null = null
  try {
    const res = await fetch(`https://api.github.com/repos/${id}`)
    if (res.ok) {
      const repo = await res.json()
      if (repo.name) name = repo.name
      if (repo.description) description = repo.description
    }
  } catch {
    // best-effort metadata
  }

  const { data: tool, error } = await client
    .from('tools')
    .insert({ apm_id: id, repo_url: repoUrl, name, description })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      // Lost a provisioning race: use the row that won.
      const { data: raced } = await client
        .from('tools')
        .select('id')
        .or(filter)
        .maybeSingle()
      if (raced) return raced.id as string
    }
    return null
  }
  return tool.id as string
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

async function persistElements(
  client: SupabaseClient,
  practiceId: string,
  definition: PracticeDefinition,
): Promise<void> {
  const { error: deleteError } = await client
    .from('elements')
    .delete()
    .eq('practice_id', practiceId)
  if (deleteError) throw new Error(deleteError.message)

  const rows = []
  for (const [index, element] of definition.elements.entries()) {
    rows.push({
      id: element.id,
      practice_id: practiceId,
      position: index,
      name: element.name,
      description: element.description || null,
      require_options: element.require_options,
      reject_options: element.reject_options,
    })
  }
  if (rows.length > 0) {
    const { error } = await client.from('elements').insert(rows)
    if (error) throw new Error(error.message)
  }

  const optionRows = []
  for (const element of definition.elements) {
    for (const [index, option] of element.options.entries()) {
      optionRows.push({
        id: option.id,
        element_id: element.id,
        position: index,
        name: option.name,
        description: option.description || null,
        tool_id: option.toolIdentifier
          ? await resolveToolId(client, option.toolIdentifier)
          : null,
      })
    }
  }
  if (optionRows.length > 0) {
    const { error } = await client.from('options').insert(optionRows)
    if (error) throw new Error(error.message)
  }
}

function siteUrl(id: string): string {
  return `https://steffenpl.github.io/open-practices-app/#/practice/${id}`
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

  try {
    if (req.method === 'POST' && segments[0] === 'practices' && segments.length === 1) {
      const definition = parseDefinition(body.definition ?? '')
      const { data: practice, error } = await client
        .from('practices')
        .insert({
          author_id: userId,
          title: definition.title,
          body: definition.body,
          image_path: definition.image,
          source_url: definition.source
            ? toFetchableSourceUrl(definition.source)
            : null,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      await persistElements(client, practice.id as string, definition)
      return json(201, { id: practice.id, url: siteUrl(practice.id as string) })
    }

    if (req.method === 'PATCH' && segments[0] === 'practices' && segments.length === 2) {
      const id = segments[1]
      const { data: practice, error: fetchError } = await client
        .from('practices')
        .select('id, author_id')
        .eq('id', id)
        .single()
      if (fetchError || !practice) {
        return json(404, { error: 'Practice not found.' })
      }
      if (practice.author_id !== userId) {
        return json(403, { error: 'Not your practice.' })
      }
      const definition = parseDefinition(body.definition ?? '')
      const now = new Date().toISOString()
      const { error } = await client
        .from('practices')
        .update({
          title: definition.title,
          body: definition.body,
          image_path: definition.image,
          source_url: definition.source
            ? toFetchableSourceUrl(definition.source)
            : null,
          updated_at: now,
          ...(body.significant ? { last_significant_at: now } : {}),
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await persistElements(client, id, definition)
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
        options: ((element.options as unknown[]) ?? [])
          .slice()
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            (a.position as number) - (b.position as number),
          ),
      }))
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
