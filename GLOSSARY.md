# Open Practices

A community platform where people publish working practices and maintain a shared catalog of the tools they use.

## Language

**Practice**:
A published title and key message describing how someone works. The author can mention Tools and customize the generated install script.

**Tool**:
A shared catalog entry for a tool people use in their Practices. Its identity includes a name, optional aliases and package handle, and ordered links. The first URL is primary. A tool can list commands that a Practice uses.

**Tool Mention**:
An inline reference such as `#tool-name` or `#owner/package::command` connecting the text of a Practice to a Tool or one of its commands.

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
A short-lived, revocable credential permitting specific Open Practices API operations on behalf of a signed-in contributor.
