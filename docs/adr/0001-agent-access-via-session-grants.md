# Agent access via short-lived session grants instead of personal tokens

Superseded by [ADR 0003](./0003-scoped-agent-grants.md).

AI agents need to create and edit Practices on behalf of a user. Standard practice would issue named, hashed, revocable personal access tokens verified by a server (Edge Function). We decided instead to grant agents a copy of the user's current Supabase session token, which expires after roughly one hour: no token storage, hashing, or revocation subsystem at all — RLS already treats the bearer as the user.

## Considered Options

- **Personal access tokens** (named, hashed, revocable, verified by the Edge Function): full control, but a whole subsystem for a v1 with no moderation. Rejected as premature machinery.
- **A dedicated bot account** whose credentials the agent uses: simplest, but Practices would be authored by the bot identity, not "for a user." Rejected — breaks the requirement.
- **Short-lived session grants** (chosen): the agent is the user for one working window.

## Consequences

- Deliberate deviation from security convention ("never hand out session tokens"): the grant is a deliberate, user-initiated act with a short blast radius.
- The agent API's narrow surface (no delete, no comments) is *advisory*, not enforced — a JWT can call PostgREST directly with all the user's powers. Accepted for v1; agents are instructed to use the definition endpoint.
- One-hour windows match how agents work (one task per grant); longer autonomy would force us back to tokens.
