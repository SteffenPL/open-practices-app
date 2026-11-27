// Run with Node 22+ and APM installed. Verification does not install the packages.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sql = readFileSync(new URL('../supabase/migrations/20261127000002_catalog_seed.sql', import.meta.url), 'utf8')
const packages = []
for (const line of sql.split('\n').filter(line => line.startsWith('  ('))) {
  const fields = [...line.matchAll(/'((?:[^']|'')*)'/g)].map(match => match[1].replaceAll("''", "'"))
  const [, , id, source, command] = fields
  const [, owner, repo, rev, path] = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([\da-f]{40})\/(.+)$/) || []
  assert.equal(id, [owner,repo,path].join('/'))
  assert.equal(command, 'apm install ' + id)
  const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${rev}/${path}/SKILL.md`)
  assert.equal(response.status, 200, id)
  const manifest = (await response.text()).split(/^---\s*$/m)[1] ?? ''
  assert.match(manifest, /^name:\s*\S/m, id)
  assert.match(manifest, /^description:\s*\S/m, id)
  packages.push(id)
}
assert.ok(packages.length >= 50)
assert.equal(new Set(packages).size, packages.length)
const cwd = mkdtempSync(join(tmpdir(), 'verify-practice-tools-'))
try {
  execFileSync('apm', ['install', '--dry-run', '--target', 'codex', ...packages], { cwd, stdio: 'inherit' })
} finally {
  rmSync(cwd, { recursive: true, force: true })
}
console.log(`Verified ${packages.length} pinned manifests and install identifiers.`)
