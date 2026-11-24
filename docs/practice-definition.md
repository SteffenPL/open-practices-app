# Practice Definition

The Practice Definition is the canonical Markdown format for a Practice. It is
used by [repository import](../README.md), by **Sync**, and by the
[agent API](../README.md#agent-api). One format, three entry points.

## Layout

A definition is a Markdown file:

```
---
title: My orchestration setup
image: https://example.com/banner.png   # optional, full URL
source: https://github.com/me/my-repo   # optional, enables "Sync now"
---

Free prose. Describe your practice here: when you use it, what it replaced,
anything readers should know.

## Element: Which orchestration skill?

Short prose describing this decision point (optional).

> Requires: option-a, option-b
> Incompatible: option-c

| Option | Why/when | Tool |
| --- | --- | --- |
| superpowers | great for multi-step flows | mattpocock/skills |
| qwilmi | light single-task sessions | |

## Element: Which model do you run?

For longer option descriptions, use subsections instead of a table:

### haiku

Fast and cheap. Use it when the task is mechanical...

Several paragraphs are fine.

### sonnet

The default. Use it when...
```

## Reference

### Frontmatter

- `title` (**required**) — the Practice title.
- `image` (optional) — a full URL. Relative paths are not supported.
- `source` (optional) — the repository URL the definition comes from. Sets the
  "Imported from" attribution and enables the author-only "Sync now"
  re-pull.

Flat `key: value` pairs only, quoted values allowed (`title: "A: practice"`).

### Body

Everything outside frontmatter and Element sections is prose shown on the
Practice page.

### Elements

An Element starts with an `## Element: <name>` heading. Any `## ` heading other
than `## Element:` ends the Element and returns to the body.

Prose directly under the heading is the Element description.

Visibility directives (optional, one per line, directly under the heading):

- `> Requires: name, name` — the Element is only shown if all named options are
  picked.
- `> Incompatible: name` — the Element is hidden if any named option is picked.

Names must exist as Options in this or an **earlier** Element.

### Options — table form (short descriptions)

```
| Option | Why/when | Tool |
| --- | --- | --- |
| name | when to pick it | mattpocock/skills |
```

- First row is the header, second row the separator; every further row is an
  Option.
- The Tool column is optional per row (empty cell = no tool).

### Options — subsection form (long descriptions)

```
### option-name

Prose, multiple paragraphs allowed.
```

Each Element needs **at least two Options**. Within one Element use either
the table or subsections, not both.

### Tools

Tool identifiers are APM package ids or `owner/repo` GitHub references (also
accepted: full `https://github.com/owner/repo` URLs). They resolve against the
shared Tool catalog and land in the reader-compiled `apm add` command.
