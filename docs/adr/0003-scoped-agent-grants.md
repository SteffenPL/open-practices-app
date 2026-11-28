# Scoped, revocable agent grants

Supersedes ADR 0001. A signed-in user selects the agent's scope and explicitly generates a bearer grant. The browser keeps the returned grant in memory for copying. Prompts contain the environment variable name only.

The agent Edge Function validates the underlying user identity on each request and checks the grant row against its owner and expiry. Read, practice contribution and catalog contribution can be granted separately or together. Only an authenticated browser session can issue, list or revoke a grant. Revoking removes its database row. Practice writes use the user's RLS context.

The opaque bearer contains the user's current access token encrypted with AES-GCM under an Edge-only key derived with HKDF. The client never receives a refresh token through this flow. Grant lifetime is the shorter of 15 minutes and the original session lifetime. The database stores the generated grant UUID, owner, scope and expiry. Existing clients that already hold a Supabase user access token can continue using the API.
