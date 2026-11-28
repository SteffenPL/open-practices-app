import { useSyncExternalStore } from 'react'
import type { CatalogTool } from './catalogService'
import type { PracticeMention } from './mentionService'
import { distinctPracticeTools } from './distinctPracticeTools'

export const installOSLabels = { windows: 'Windows', macos: 'macOS', linux: 'Linux' } as const
export type InstallOS = keyof typeof installOSLabels
export type InstallCommands = Partial<Record<InstallOS, string>>

export function toolInstallCommand(tool: Pick<CatalogTool, 'install_command'> & { install_commands?: InstallCommands }, os: InstallOS): string {
  return tool.install_commands?.[os]?.trim() || tool.install_command?.trim() || ''
}

export function generateInstallBlock(mentions: PracticeMention[], os: InstallOS): string {
  const commands = distinctPracticeTools(mentions).map(mention => {
    const saved = mention.install_command?.trim()
    if (saved && saved !== mention.tool.install_command?.trim()) return saved
    return toolInstallCommand(mention.tool, os)
  })
  return [...new Set(commands.filter(Boolean))].join('\n')
}

const preferenceKey = 'open-practices-install-os'
const preferenceEvent = 'open-practices-install-os-changed'
let memoryPreference: InstallOS | undefined

function preferredOS(): InstallOS {
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (saved && Object.hasOwn(installOSLabels, saved)) return saved as InstallOS
  } catch { /* Browser storage is optional. */ }
  if (memoryPreference) return memoryPreference
  const platform = navigator.platform || navigator.userAgent
  if (/win/i.test(platform)) return 'windows'
  if (/mac|iphone|ipad/i.test(platform)) return 'macos'
  return 'linux'
}

function selectOS(os: InstallOS) {
  memoryPreference = os
  try { localStorage.setItem(preferenceKey, os) } catch { /* Keep the in-memory choice. */ }
  window.dispatchEvent(new Event(preferenceEvent))
}

function subscribe(callback: () => void) {
  window.addEventListener(preferenceEvent, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(preferenceEvent, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useInstallOS(): readonly [InstallOS, typeof selectOS] {
  return [useSyncExternalStore(subscribe, preferredOS, () => 'linux' as const), selectOS]
}
