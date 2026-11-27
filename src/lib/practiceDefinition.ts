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
  /** Ordered body occurrences. Setup is shared by repeated occurrences. */
  mentions?: { token: string; slug: string; toolIdentifier?: string | null; installCommand: string | null; notes: string | null }[]
  /** Legacy alternatives are retained as ordinary prose in the new format. */
  legacyNotes?: string
}

import { tokenizePracticeText } from './practiceText.ts'

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

export function legacyAlternativeNotes(elements: DefinitionElement[]): string {
  const legacyOptionNameById = new Map(elements.flatMap((element) => element.options.map((option) => [option.id, option.name] as const)))
  return elements.map((element) => {
    const options = element.options.map((option) => {
      const toolMention = option.toolIdentifier ? ` #${option.toolIdentifier.split('/').pop()}` : ''
      return `- **${option.name}**${toolMention}${option.description ? ` — ${option.description}` : ''}`
    }).join('\n')
    const rules = [
      element.require_options.length ? `Shown when: ${element.require_options.map((id) => legacyOptionNameById.get(id) ?? 'an earlier option').join(', ')}.` : '',
      element.reject_options.length ? `Hidden when: ${element.reject_options.map((id) => legacyOptionNameById.get(id) ?? 'an earlier option').join(', ')}.` : '',
    ].filter(Boolean).join(' ')
    return `### ${element.name}\n${element.description ? `${element.description}\n\n` : ''}${rules ? `${rules}\n\n` : ''}${options}`
  }).join('\n\n')
}

export function parseDefinition(markdown: string): PracticeDefinition {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const { meta, rest: originalRest } = parseFrontmatter(lines)
  // V2 keeps optional per-tool setup in a separate Markdown section. This
  // section is metadata and is excluded from the practice's displayed body.
  let rest = originalRest
  let setupIndex = -1
  let fence: string | null = null
  for (let i = 0; i < rest.length; i++) {
    const fenceLine = rest[i].match(/^\s*(`{3,}|~{3,})/)
    if (fenceLine) {
      if (!fence) fence = fenceLine[1]
      else if (fenceLine[1][0] === fence[0] && fenceLine[1].length >= fence.length) fence = null
      continue
    }
    if (!fence && /^## Tool setup\s*$/i.test(rest[i].trim())) { setupIndex = i; break }
  }
  const setups = new Map<string, { installCommand: string | null; notes: string | null }>()
  if (setupIndex >= 0) {
    const setupLines = rest.slice(setupIndex + 1)
    rest = rest.slice(0, setupIndex)
    let slug = ''
    let command: string | null = null
    let notes: string[] = []
    let inNotes = false
    let inCommand = false
    const finish = () => {
      if (slug) setups.set(slug, { installCommand: command, notes: notes.join('\n').trim() || null })
      slug = ''; command = null; notes = []; inNotes = false; inCommand = false
    }
    for (const line of setupLines) {
      const heading = line.match(/^###\s+#?([\w-]+)\s*$/)
      if (heading) { finish(); slug = heading[1].toLowerCase(); continue }
      if (!slug) continue
      if (line.startsWith('  ') && (inCommand || inNotes)) {
        const content = line.slice(2)
        if (inCommand) command = command === '' ? content : command + '\n' + content
        else notes.push(content)
        continue
      }
      if (!line.trim()) continue
      const commandLine = line.match(/^\s*command:\s*(.*)$/i)
      const notesLine = line.match(/^\s*notes:\s*(.*)$/i)
      if (commandLine) { inCommand = commandLine[1] === '|'; command = inCommand ? '' : commandLine[1].trim() || null; inNotes = false; continue }
      if (notesLine) { inNotes = true; inCommand = false; if (notesLine[1] && notesLine[1] !== '|') notes.push(notesLine[1]); continue }
      if (inNotes) notes.push(line.replace(/^\s{2,}/, ''))
      else if (inCommand) command = [command, line.replace(/^\s{2,}/, '')].filter(Boolean).join('\n')
    }
    finish()
  }

  const title = (meta.title ?? '').trim()
  if (!title) {
    throw new DefinitionError(
      'Frontmatter needs a title, e.g. "title: My practice".',
    )
  }

  const image = meta.image?.trim() ?? ''
  if (image && !/^https?:\/\//.test(image)) {
    throw new DefinitionError(
      'Frontmatter image must be a full URL (https://…); relative paths are not supported.',
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

  // Resolve visibility directives: option names -> ids. Directives may only
  // reference options of this or an EARLIER element; forward references
  // are rejected with an actionable error.
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

  const body = parseBody(bodyParts)
  // Legacy alternatives remain visible as plain notes. Their linked tool
  // identifiers become body mentions, but never carry inferred setup data.
  const legacyNotes = legacyAlternativeNotes(elements)
  const importBody = [body, legacyNotes ? `## Alternatives\n\n${legacyNotes}` : ''].filter(Boolean).join('\n\n')
  const legacyTools = elements.flatMap((element) => element.options.filter((option) => option.toolIdentifier).map((option) => ({
    slug: option.toolIdentifier!.split('/').pop()!.toLowerCase(), identifier: option.toolIdentifier,
  })))
  const legacySeen = new Map<string, number>()
  const mentions = tokenizePracticeText(importBody).filter((token) => token.kind === 'mention').map((token) => {
    const slug = token.text.slice(1).toLowerCase()
    const setup = setups.get(slug)
    const legacyIndex = legacySeen.get(slug) ?? 0
    const match = legacyTools.filter((item) => item.slug === slug)[legacyIndex]
    legacySeen.set(slug, legacyIndex + 1)
    return { token: token.text, slug, toolIdentifier: match?.identifier ?? null, installCommand: setup?.installCommand ?? null, notes: setup?.notes ?? null }
  })

  return {
    title,
    image: image || null,
    source: meta.source?.trim() || null,
    body: importBody,
    elements,
    mentions,
    legacyNotes,
  }
}

export function renderDefinition(definition: PracticeDefinition): string {
  const frontmatter: string[] = ['---', `title: ${definition.title}`]
  if (definition.image) frontmatter.push(`image: ${definition.image}`)
  if (definition.source) frontmatter.push(`source: ${definition.source}`)
  frontmatter.push('---')

  const parts: string[] = [frontmatter.join('\n'), definition.body]

  if (definition.mentions?.some((mention) => mention.installCommand || mention.notes)) {
    const seen = new Set<string>()
    const setups: string[] = []
    for (const mention of definition.mentions) {
      if (seen.has(mention.slug)) continue
      seen.add(mention.slug)
      if (!mention.installCommand && !mention.notes) continue
      setups.push(`### #${mention.slug}`)
      if (mention.installCommand) setups.push(`command: |\n${mention.installCommand.split('\n').map((line) => `  ${line}`).join('\n')}`)
      if (mention.notes) setups.push(`notes: |\n${mention.notes.split('\n').map((line) => `  ${line}`).join('\n')}`)
    }
    if (setups.length) parts.push(`## Tool setup\n\n${setups.join('\n\n')}`)
  }

  // Legacy options have already been converted to body notes by parseDefinition.
  // Do not append the legacy structure again on export.
  if (definition.legacyNotes !== undefined || definition.mentions?.length) {
    return parts.filter((part) => part.trim()).join('\n\n') + '\n'
  }

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
