import type { Element } from './types'
import { visibleElements, type Selection } from './visibility'

export interface CompiledPractice {
  apmIds: string[]
  command: string
  yaml: string
}

/**
 * The single test seam of the app: a pure function from
 * (Elements, reader selection) to the Compiled Practice artifacts.
 * Only visible Elements contribute; only Options with a Tool carrying an
 * APM id are included (non-tool picks are omitted from the output).
 */
export function compilePractice(
  elements: Element[],
  selection: Selection,
): CompiledPractice {
  const apmIds: string[] = []

  for (const element of visibleElements(elements, selection)) {
    const optionId = selection[element.id]
    if (!optionId) continue
    const option = element.options.find((o) => o.id === optionId)
    const apmId = option?.tool?.apm_id
    if (apmId) apmIds.push(apmId)
  }

  const unique = [...new Set(apmIds)]
  const command =
    unique.length > 0
      ? `apm add ${unique.join(' ')}`
      : '# pick options referencing tools to compile an install command'
  const yaml =
    'dependencies:\n  apm:\n' +
    (unique.length > 0
      ? unique.map((id) => `    - ${id}`).join('\n') + '\n'
      : '    []\n')

  return { apmIds: unique, command, yaml }
}
