/**
 * The Practice Definition: the canonical Markdown interchange format for a
 * Practice, shared by repository Import, Sync, and the agent API.
 *
 * Format (see docs/practice-definition.md):
 * - YAML frontmatter: title (required), image (full URL), source (repo URL)
 * - Free prose body
 * - Elements as "## Element: <name>" headings, containing either
 *   - an options table: | Option | Why/when | Tool |
 *   - or "### <option name>" subsections
 * - Visibility directives under the element heading:
 *   "> Requires: a, b" and "> Incompatible: c" (option names, comma-separated)
 *
 * Pure module: no dependencies, no I/O. Used by the app and the agent
 * Edge Function; tested table-driven in practiceDefinition.test.ts.
 */

export interface DefinitionOption {
  id: string
  name: string
  description: string
  toolIdentifier: string | null
}

export interface DefinitionElement {
  id: string
  name: string
  description: string
  require_options: string[]
  reject_options: string[]
  options: DefinitionOption[]
}

export interface PracticeDefinition {
  title: string
  image: string | null
  source: string | null
  body: string
  elements: DefinitionElement[]
}

export class DefinitionError extends Error {}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isSeparatorRow(line: string): boolean {
  return /^\|?[\s:-]*-[\s:|-]*\|?$/.test(line.trim()) && line.includes('-')
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(
  lines: string[],
): { meta: Record<string, string>; rest: string[] } {
  if (lines[0]?.trim() !== '---') {
    throw new DefinitionError(
      'Definition must start with YAML frontmatter: a line "---", keys, then "---".',
    )
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end === -1) {
    throw new DefinitionError(
      'Frontmatter is never closed: add a "---" line after the keys.',
    )
  }
  const meta: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (!match) {
      throw new DefinitionError(
        `Cannot parse frontmatter line: "${line}" — expected "key: value".`,
      )
    }
    meta[match[1]] = unquote(match[2])
  }
  return { meta, rest: lines.slice(end + 1) }
}

function optionFromCells(cells: string[]): DefinitionOption {
  const [name, description, tool] = cells
  if (!name) {
    throw new DefinitionError('Table row has an empty Option name.')
  }
  return {
    id: crypto.randomUUID(),
    name,
    description: description ?? '',
    toolIdentifier: tool ? tool : null,
  }
}

function parseBody(lines: string[]): PracticeDefinition['body'] {
  return lines.join('\n').trim()
}

export function parseDefinition(markdown: string): PracticeDefinition {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const { meta, rest } = parseFrontmatter(lines)

  const title = (meta.title ?? '').trim()
  if (!title) {
    throw new DefinitionError(
      'Frontmatter needs a title, e.g. "title: My practice".',
    )
  }

  const bodyParts: string[] = []
  const elements: DefinitionElement[] = []
  let current: DefinitionElement | null = null
  let currentProse: string[] = []
  let currentOption: DefinitionOption | null = null
  let optionProse: string[] = []
  let tableLines: string[] = []
  

  const finishOption = () => {
    if (current && currentOption) {
      currentOption.description = optionProse.join('\n').trim()
      current.options.push(currentOption)
    }
    currentOption = null
    optionProse = []
  }

  const finishTable = () => {
    if (!current || tableLines.length === 0) return
    if (tableLines.length < 2 || !isSeparatorRow(tableLines[1])) {
      throw new DefinitionError(
        `Element "${current.name}": options table needs a header row and a "| --- |" separator row.`,
      )
    }
    // Rows after the header and separator are options.
    for (const row of tableLines.slice(2)) {
      if (isSeparatorRow(row)) continue
      current.options.push(optionFromCells(splitCells(row)))
    }
    tableLines = []
  }

  const finishElement = () => {
    finishTable()
    finishOption()
    if (current) {
      current.description = currentProse.join('\n').trim()
      if (current.options.length < 2) {
        throw new DefinitionError(
          `Element "${current.name}" needs at least two options — add table rows or "### <name>" subsections.`,
        )
      }
      elements.push(current)
    }
    current = null
    currentProse = []
  }

  const endAll = () => {
    finishElement()
  }

  for (const line of rest) {
    const elementHeading = line.match(/^##\s+Element:\s*(.+?)\s*$/)
    const heading = line.match(/^##\s+(.*)$/)
    const optionHeading = line.match(/^###\s+(.+?)\s*$/)

    if (elementHeading) {
      finishElement()
      current = {
        id: crypto.randomUUID(),
        name: elementHeading[1],
        description: '',
        require_options: [],
        reject_options: [],
        options: [],
      }
      continue
    }

    if (heading) {
      // Any other h2 ends the element section and returns to the body.
      finishElement()
      bodyParts.push(line)
      continue
    }

    if (current) {
      const requires = line.match(/^>\s*Requires:\s*(.+)$/i)
      const incompatible = line.match(/^>\s*Incompatible:\s*(.+)$/i)
      if (requires) {
        current.require_options.push(...requires[1].split(',').map((n) => n.trim()).filter(Boolean))
        continue
      }
      if (incompatible) {
        current.reject_options.push(...incompatible[1].split(',').map((n) => n.trim()).filter(Boolean))
        continue
      }
      if (optionHeading) {
        finishTable()
        finishOption()
        currentOption = {
          id: crypto.randomUUID(),
          name: optionHeading[1],
          description: '',
          toolIdentifier: null,
        }
        continue
      }
      if (line.trim().startsWith('|')) {
        if (currentOption) {
          throw new DefinitionError(
            `Element "${current.name}": a table row appeared inside the "### ${currentOption.name}" subsection.`,
          )
        }
        tableLines.push(line)
        continue
      }
      if (currentOption) {
        optionProse.push(line)
        continue
      }
      if (tableLines.length > 0 && line.trim() === '') {
        finishTable()
        continue
      }
      currentProse.push(line)
      continue
    }

    bodyParts.push(line)
  }

  endAll()

  // Resolve visibility directives: option names -> ids of earlier elements.
  const idByName = new Map<string, string>()
  for (const element of elements) {
    for (const option of element.options) {
      idByName.set(option.name, option.id)
    }
    const resolve = (names: string[], directive: string) =>
      names.map((name) => {
        const id = idByName.get(name)
        if (!id) {
          throw new DefinitionError(
            `Element "${element.name}": ${directive} "${name}" — there is no such option in this or an earlier element.`,
          )
        }
        return id
      })
    element.require_options = resolve(element.require_options, 'Requires')
    element.reject_options = resolve(element.reject_options, 'Incompatible')
  }

  return {
    title,
    image: meta.image?.trim() || null,
    source: meta.source?.trim() || null,
    body: parseBody(bodyParts),
    elements,
  }
}

export function renderDefinition(definition: PracticeDefinition): string {
  const frontmatter: string[] = ['---', `title: ${definition.title}`]
  if (definition.image) frontmatter.push(`image: ${definition.image}`)
  if (definition.source) frontmatter.push(`source: ${definition.source}`)
  frontmatter.push('---')

  const parts: string[] = [frontmatter.join('\n'), definition.body]

  const nameById = new Map<string, string>()
  for (const element of definition.elements) {
    for (const option of element.options) {
      nameById.set(option.id, option.name)
    }
  }

  for (const element of definition.elements) {
    const block: string[] = [`## Element: ${element.name}`]
    if (element.description) block.push(element.description)
    if (element.require_options.length > 0) {
      block.push(
        `> Requires: ${element.require_options.map((id) => nameById.get(id)).join(', ')}`,
      )
    }
    if (element.reject_options.length > 0) {
      block.push(
        `> Incompatible: ${element.reject_options.map((id) => nameById.get(id)).join(', ')}`,
      )
    }

    const longForm = element.options.some(
      (option) => option.description.includes('\n') || option.description.length > 100,
    )
    if (longForm) {
      for (const option of element.options) {
        block.push(`### ${option.name}`)
        if (option.description) block.push(option.description)
      }
    } else {
      block.push('| Option | Why/when | Tool |')
      block.push('| --- | --- | --- |')
      for (const option of element.options) {
        block.push(
          `| ${option.name} | ${option.description || '—'} | ${option.toolIdentifier ?? ''} |`,
        )
      }
    }
    parts.push(block.join('\n'))
  }

  return parts.filter((part) => part.trim().length > 0).join('\n\n') + '\n'
}
