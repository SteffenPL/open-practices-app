# Practice Definition

Repository import, Sync and the agent API share a Markdown format. Start with a title in frontmatter and write the key message below it. The optional `image` field is an absolute HTTP or HTTPS image URL. Repository imports retain the source file for future Sync.

~~~markdown
---
title: Check the figures in a PDF
---

I use #pdf to extract the text. I ask “Which figures changed?” and compare the result with `figures.txt`.
~~~

A tool mention uses the catalog handle, such as `#pdf`. Repeated mentions of one tool share one setup entry. Backticks delimit code, and paired straight or curly double quotes delimit prompts. Hashes inside either span stay literal.

## Optional install commands and notes

Append a `## Tool setup` section when the author wants to publish setup instructions. Identify each tool with its handle. Either field may be omitted.

~~~markdown
## Tool setup

### #pdf
command: apm install anthropics/skills/skills/pdf
notes: Keep the original document next to the extracted text.
~~~

The command belongs to this practice. An update to the catalog's suggested command does not alter the published command.

## Compatibility

Older definitions can contain `## Element:` headings with option tables or subsections. Import accepts these and preserves the alternatives as notes. Linked tools can be mentioned in the resulting practice. Importing a list of alternatives does not add their commands to the install list.
