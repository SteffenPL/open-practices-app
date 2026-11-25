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
const expectedTables = new Set()
const expectedColumns = new Map() // table -> Set(column)
for (const file of readdirSync(migrationDir).sort()) {
  const sql = readFileSync(path.join(migrationDir, file), 'utf8')
  for (const match of sql.matchAll(
    /create table (?:if not exists )?public\.(\w+)/g,
  )) {
    expectedTables.add(match[1])
  }
  for (const match of sql.matchAll(
    /alter table public\.(\w+) add column (?:if not exists )?(\w+)/g,
  )) {
    const columns = expectedColumns.get(match[1]) ?? new Set()
    columns.add(match[2])
    expectedColumns.set(match[1], columns)
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
        "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    }),
  },
)
if (!res.ok) {
  console.error(`Schema check failed: HTTP ${res.status}`)
  process.exit(1)
}
const existingTables = new Set()
const existingColumns = new Map() // table -> Set(column)
for (const row of await res.json()) {
  existingTables.add(row.table_name)
  const columns = existingColumns.get(row.table_name) ?? new Set()
  columns.add(row.column_name)
  existingColumns.set(row.table_name, columns)
}

const missingTables = [...expectedTables].filter(
  (table) => !existingTables.has(table),
)
const missingColumns = [...expectedColumns].flatMap(([table, columns]) =>
  [...columns]
    .filter(
      (column) => !existingColumns.get(table)?.has(column),
    )
    .map((column) => `${table}.${column}`),
)
if (missingTables.length > 0 || missingColumns.length > 0) {
  if (missingTables.length > 0) {
    console.error(`Missing tables on project ${ref}: ${missingTables.join(', ')}`)
  }
  if (missingColumns.length > 0) {
    console.error(`Missing columns on project ${ref}: ${missingColumns.join(', ')}`)
  }
  console.error('Apply migrations from supabase/migrations to the live project.')
  process.exit(1)
}
const expectedColumnCount = [...expectedColumns.values()].reduce(
  (n, columns) => n + columns.size,
  0,
)
console.log(
  `Schema OK: ${expectedTables.size} expected tables and ${expectedColumnCount} ` +
    `expected columns present on ${ref}.`,
)
