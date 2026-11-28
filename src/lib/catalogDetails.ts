import type { ToolCommand } from './types'

export function uniqueValues(values: string[], ignoreCase = false) {
  const keys = new Set<string>()
  return values.map(value => value.trim()).filter(value => {
    const key = ignoreCase ? value.toLowerCase() : value
    if (!key || keys.has(key)) return false
    keys.add(key)
    return true
  })
}

export function uniqueCommands(commands: ToolCommand[]) {
  const names = new Set<string>()
  return commands.filter(command => {
    const key = command.name.toLowerCase()
    if (names.has(key)) return false
    names.add(key)
    return true
  })
}

export function toolURLs(tool: { urls?: string[]; website_url?: string | null; repo_url?: string | null }) {
  return tool.urls ?? uniqueValues([tool.website_url ?? '', tool.repo_url ?? ''])
}

export function describeCommands(commands: ToolCommand[]) {
  return commands.map(command => command.name + (command.description ? ' — ' + command.description : '')).join('\n')
}
