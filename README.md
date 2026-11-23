# open-practices-app

The web app for [Open Practices](https://github.com/SteffenPL/open-practices) —
a community platform where people publish their (mostly AI) working practices.
See the parent repository's `GLOSSARY.md` for the domain vocabulary
(Practice, Element, Option, Tool, Compiled Practice).

Stack: React SPA (Vite + TypeScript), Supabase (auth, database, storage),
deployed as static files to GitHub Pages.

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
     `https://<user>.github.io/open-practices-app/`) to the Supabase
     Authentication → URL configuration as allowed redirect URLs.
4. **Repository secrets** for the GitHub Pages workflow:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from Project Settings →
   API).
5. Push to `main` — the deploy workflow publishes to GitHub Pages. Ensure
   Settings → Pages → Source is set to *GitHub Actions*.

## Project layout

- `src/lib` — Supabase client and shared types
- `src/auth` — session state and Google sign-in
- `src/components` — UI building blocks
- `supabase/migrations` — SQL migrations to run in the Supabase SQL editor
