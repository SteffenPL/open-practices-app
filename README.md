# open-practices-app

The web app for [Open Practices](https://github.com/SteffenPL/open-practices) —
a community platform where people publish their (mostly AI) working practices.
See the parent repository's `GLOSSARY.md` for the domain vocabulary
(Practice, Element, Option, Tool, Compiled Practice).

Stack: React SPA (Vite + TypeScript), Supabase (auth, database, storage),
served from [the share VM](https://steffenpl-share.exe.xyz/open-practices/) behind its sign-in gate.

## Local development

```sh
npm install
cp .env.example .env.local   # fill in your Supabase credentials
npm run dev
```

## One-time setup (human steps)

1. **Create a Supabase project** at supabase.com.
2. **Run the migration**: open the SQL editor in the Supabase dashboard and
   execute `supabase/migrations/0001_profiles.sql` (creates the `profiles`
   table, RLS policies, and the auto-provision trigger).
3. **Enable Google sign-in**:
   - In the Supabase dashboard, under Authentication → Providers, enable
     Google. It needs a Google Cloud OAuth client ID and secret.
   - In Google Cloud Console, create an OAuth client (Web application) and add
     the redirect URL shown by Supabase (ends with
     `/auth/v1/callback`).
   - Add your site URLs (local: `http://localhost:5173`, production:
     `https://steffenpl-share.exe.xyz/open-practices/`) to the Supabase
     Authentication → URL configuration as allowed redirect URLs.
4. **Deployment** uses the systemd units and updater in `scripts/share-vm/`.
   The share VM checks GitHub `main` every two minutes. For each new revision
   it installs dependencies, runs tests and builds with Node 24. A successful
   build replaces the static release behind `127.0.0.1:3108/open-practices/`.
   The previous release keeps serving if tests or compilation fail. The VM's
   reverse proxy handles access control. GitHub Pages redirects old bookmarks.
   Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in the VM's
   `/etc/open-practices.env`.

## Project layout

- `src/lib` — Supabase client and shared types
- `src/auth` — session state and Google sign-in
- `src/components` — UI building blocks
- `supabase/migrations` — SQL migrations to run in the Supabase SQL editor

## Agent API

AI agents can create, read, and update a user's Practices by submitting a
[Practice Definition](./docs/practice-definition.md) in Markdown.

**How a user grants access**: on their profile page, they click
*Agent access (expires after 1h)* — this copies the current session token.
Hand that token to the agent; it is valid for about one hour and grants the
agent the user's full powers for that window (see
[ADR 0001](https://github.com/SteffenPL/open-practices/blob/main/docs/adr/0001-agent-access-via-session-grants.md)).

**The three calls** (base URL:
`https://ynehkcayahsquszsfcdb.supabase.co/functions/v1/agent`,
header `Authorization: Bearer <token>`):

```sh
# Create a practice from a definition
curl -X POST "$BASE/practices" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"definition": "---\ntitle: My setup\n---\n\nProse…\n\n## Element: Which skill?\n\n| Option | Why/when | Tool |\n| --- | --- | --- |\n| a | because | mattpocock/skills |\n| b | otherwise | |\n"}'
# -> { "id": "…", "url": "https://steffenpl.github.io/open-practices-app/#/practice/…" }

# Read a practice back as a definition
curl "$BASE/practices/<id>" -H "Authorization: Bearer $TOKEN"
# -> { "id": "…", "url": "…", "definition": "---\ntitle: …" }

# Update a practice (significant=false by default: silent, no timeline bump)
curl -X PATCH "$BASE/practices/<id>" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"definition": "…", "significant": true}'
```

Only the token owner's practices are writable. No delete, no comments on
this path.

## Repository import

Users can also publish a Practice from a Markdown file in a public GitHub
repository (default `practice.md`, fallback `README.md`) via
*New practice → Import from GitHub*. The same
[Practice Definition](./docs/practice-definition.md) format applies, and the
author can re-pull changes with **Sync now** on the practice page.
