import { expect, it } from 'vitest'
import type { PracticeMention } from './mentionService'
import { generateInstallBlock } from './installCommands'

function mention(id: string, universal: string | null, windows?: string, saved?: string): PracticeMention {
  return {
    tool_id: id, install_command: saved,
    tool: { install_command: universal, install_commands: { windows } },
  } as PracticeMention
}

it('collects commands in first mention order and selects the matching variant', () => {
  const a = mention('a', 'apm install a')
  const b = mention('b', 'install b', 'windows b\nconfigure b')
  const mentions = [b, a, b, mention('c', null, 'windows c')]
  expect(generateInstallBlock(mentions, 'windows')).toBe('windows b\nconfigure b\napm install a\nwindows c')
  expect(generateInstallBlock(mentions, 'macos')).toBe('install b\napm install a')
})

it('preserves custom commands from older practices and resolves catalog defaults', () => {
  const mentions = [mention('a', 'install a', 'windows a', 'install a'), mention('b', 'install b', 'windows b', 'custom b')]
  expect(generateInstallBlock(mentions, 'windows')).toBe('windows a\ncustom b')
})
