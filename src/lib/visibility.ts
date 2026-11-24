import type { Element } from './types'

/** A reader's picks: Element id -> selected Option id. */
export type Selection = Record<string, string>

/**
 * Which Elements are visible given the reader's current selection.
 * An Element is visible when every require_options id is picked and
 * no reject_options id is picked.
 */
export function visibleElements(
  elements: Element[],
  selection: Selection,
): Element[] {
  const picked = new Set(Object.values(selection))
  return elements.filter(
    (el) =>
      el.require_options.every((id) => picked.has(id)) &&
      !el.reject_options.some((id) => picked.has(id)),
  )
}
