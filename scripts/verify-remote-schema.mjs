// Verifies that every table created by supabase/migrations exists on the
// live Supabase project. Run after deploys: node scripts/verify-remote-schema.mjs
// Requires SUPABASE_ACCESS_TOKEN (and VITE_SUPABASE_URL) in the environment.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const appUrl = process.env.VITE_SUPABASE_URL
if (!token || !appUrl) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or VITE_SUPABASE_URL')
  process.exit(1)
}
const ref = new URL(appUrl).hostname.split('.')[0]

const migrationDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../supabase/migrations',
)
const expected = new Set()
for (const file of readdirSync(migrationDir).sort()) {
  const sql = readFileSync(path.join(migrationDir, file), 'utf8')
  for (const match of sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)) {
    expected.add(match[1])
  }
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query:
        "select table_name from information_schema.tables where table_schema = 'public'",
    }),
  },
)
if (!res.ok) {
  console.error(`Schema check failed: HTTP ${res.status}`)
  process.exit(1)
}
const existing = new Set(
  (await res.json()).map((row) => row.table_name),
)

const missing = [...expected].filter((table) => !existing.has(table))
if (missing.length > 0) {
  console.error(`Missing tables on project ${ref}: ${missing.join(', ')}`)
  console.error('Apply migrations from supabase/migrations to the live project.')
  process.exit(1)
}
console.log(`Schema OK: ${expected.size} expected tables present on ${ref}.`)
