# Open Practices

A community platform where people publish working practices and maintain a shared catalog of the tools they use.

## Language

**Practice**:
A published title and key message describing how someone works. The author can mention Tools and include install commands and setup notes.

**Tool**:
A shared catalog entry for a tool people use in their Practices. Its identifiers can include an APM package, a GitHub link, and a project website.

**Tool Mention**:
An inline reference such as `#tool-name` connecting the text of a Practice to a Tool.

**Install List**:
A copyable block generated from the mentioned Tools in order of first appearance for the reader’s operating system. An author can replace the block for any one operating system.

**Practice Definition**:
The Markdown format for exchanging a Practice through repository Import, Sync, and the agent API.
_Avoid_: Practice file (when meaning the format, not a concrete file)

**Import**:
Publishing a Practice from a Practice Definition in an external source (a GitHub repository), keeping the source URL visible for attribution. No ownership of the source is claimed.
_Avoid_: Fork, mirror

**Sync**:
Manually re-pulling a Practice's definition from its source, overwriting the platform copy. The source is canonical for imported Practices.
_Avoid_: Webhook, auto-sync

**Agent Access**:
A short-lived copy of the user's current session token, deliberately granted to an AI agent for a single working window (~1 hour). Full account scope; expires on its own.
_Avoid_: Agent token, API key, password
