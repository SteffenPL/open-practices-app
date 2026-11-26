import type { ElementDraft, OptionDraft } from '../lib/elementService'

export const GUIDED_TOOLS_ELEMENT_NAME = 'Recommended tools'
export const GUIDED_CLOSING_MARKER = '<!-- open-practices-guided-closing -->'
const INSTALL_COMMAND_MARKER = /<!-- practice-install-command:([^>]*) -->/

export function composeGuidedPracticeBody(
  opening: string,
  endingKind: string,
  ending: string,
  endingImageMarkdown = '',
): string {
  const closing = [
    endingKind.trim() ? `### ${endingKind.trim()}` : '',
    ending.trim(),
    endingImageMarkdown,
  ].filter(Boolean).join('\n\n')
  return [opening.trim(), GUIDED_CLOSING_MARKER, closing].filter(Boolean).join('\n\n')
}

export function splitGuidedPracticeBody(body: string): {
  opening: string
  closing: string
  guided: boolean
} {
  const markerIndex = body.indexOf(GUIDED_CLOSING_MARKER)
  if (markerIndex < 0) return { opening: body, closing: '', guided: false }
  return {
    opening: body.slice(0, markerIndex).trim(),
    closing: body.slice(markerIndex + GUIDED_CLOSING_MARKER.length).trim(),
    guided: true,
  }
}

export function withInstallCommand(description: string, command: string): string {
  const marker = `<!-- practice-install-command:${encodeURIComponent(command.trim())} -->`
  return [description.trim(), marker].filter(Boolean).join('\n\n')
}

export function getInstallCommand(description: string | null | undefined): string | null {
  if (!description) return null
  const marker = description.match(INSTALL_COMMAND_MARKER)
  if (!marker) return null
  try {
    return decodeURIComponent(marker[1])
  } catch {
    return null
  }
}

export function cleanOptionDescription(description: string | null | undefined): string {
  return (description ?? '').replace(INSTALL_COMMAND_MARKER, '').trim()
}

/** Return an APM package id only for the exact supported install form. */
export function apmPackageIdFromCommand(command: string): string | null {
  const match = command.trim().match(/^apm\s+install\s+([\w@.-]+\/[\w@.-]+)$/i)
  return match?.[1] ?? null
}

export function suggestApmInstallCommand(input: string): string {
  const raw = input.trim().replace(/^apm\s+install\s+/i, '').replace(/\s+/g, '-')
  const githubPath = raw.match(/^(?:https?:\/\/)?github\.com\/([^/]+\/[^/]+)/i)?.[1]
  const guessedId = githubPath ?? (raw.includes('/') ? raw : raw.toLowerCase())
  return `apm install ${guessedId || 'owner/repo'}`
}

export function suggestedToolName(input: string): string {
  const command = suggestApmInstallCommand(input)
  const identifier = command.replace(/^apm\s+install\s+/i, '')
  return identifier.split('/').at(-1) || input.trim()
}

export function makeGuidedElementDraft(options: OptionDraft[]): ElementDraft {
  return {
    id: crypto.randomUUID(),
    name: GUIDED_TOOLS_ELEMENT_NAME,
    description: '',
    require_options: [],
    reject_options: [],
    options,
  }
}
