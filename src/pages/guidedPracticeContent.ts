export const GUIDED_CLOSING_MARKER = '<!-- open-practices-guided-closing -->'
const INSTALL_COMMAND_MARKER = /<!-- practice-install-command:([^>]*) -->/

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
