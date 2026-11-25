# open-practices-app

## Secrets

`.env.local` holds `SUPABASE_DB_URL` and `SUPABASE_ACCESS_TOKEN` (real secrets). It is gitignored and must stay uncommitted. Never copy secret values into issues, agent briefs, PR bodies, comments, or command output that gets posted anywhere.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (SteffenPL/open-practices-app) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage label vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
