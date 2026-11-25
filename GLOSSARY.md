# Open Practices

A community platform where people publish descriptions of their (mostly AI) working practices as articles, optionally containing an interactive tool combination that readers walk through to compile a setup.

## Language

**Practice**:
An article published by a user: title, rich-text description, optional image, a list of Elements, plus comments.
_Avoid_: Post, blog post, article

**Element**:
One decision point within a Practice (e.g. "which orchestration skill?"). An Element can be about anything — a skill, a practice, a model, a tool — not just installables. It offers Options and can be shown or hidden by other Elements' Options.
_Avoid_: Ingredient, step, node, combination
_Avoid_: Step, node

**Option**:
One selectable choice within an Element, with a name, description, an optional Tool identity, and rules for showing or hiding later Elements.

**Tool**:
An external, installable thing referenced by an Option; identified by an APM package ID and/or a GitHub repository as fallback. Tools have shared identity across Practices.
_Avoid_: Skill, plugin (when referring to the catalog entity)

**Compiled Practice**:
The generated output of a reader's picked Options: a copy-paste terminal command and/or an APM YAML file.
_Avoid_: Compiled command, install script

**Practice Definition**:
The canonical Markdown-based interchange format for a Practice: frontmatter (title, image), prose body, and Element tables. Used both by repository Import and by the agent API.
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
