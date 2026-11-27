import type { PracticeMention } from './mentionService'

export function distinctPracticeTools(mentions: PracticeMention[]): PracticeMention[] {
  const tools = new Map<string, PracticeMention>()
  for (const mention of mentions) {
    if (!tools.has(mention.tool_id)) tools.set(mention.tool_id, mention)
  }
  return [...tools.values()]
}
