import type { PracticeMention } from '../lib/mentionService'
import type { PracticeToolLink } from '../lib/elementService'
import { generateInstallBlock, installOSLabels, toolInstallCommand, useInstallOS, type InstallCommands, type InstallOS } from '../lib/installCommands'
import { CopyCommandButton } from './PracticeCommands'
import { InstallOSPicker } from './InstallOSPicker'

export function InstallList({ mentions, title, overrides, legacyTools, compact = false }: {
  mentions: PracticeMention[]
  title: string
  overrides?: InstallCommands
  legacyTools?: PracticeToolLink[]
  compact?: boolean
}) {
  const [os] = useInstallOS()
  function commandsFor(platform: InstallOS) {
    if (overrides?.[platform] !== undefined) return overrides[platform]
    if (legacyTools) return [...new Set(legacyTools.map(tool => toolInstallCommand(tool, platform)).filter(Boolean))].join('\n')
    return generateInstallBlock(mentions, platform)
  }
  const text = commandsFor(os)
  if (!text.trim() && !(Object.keys(installOSLabels) as InstallOS[]).some(platform => commandsFor(platform).trim())) return null
  const lines = text.split(/\r?\n/)
  const clipped = compact && lines.length > 3
  return <div className={compact ? 'install-block install-block-compact' : 'install-block'}>
    {text.trim()
      ? <pre aria-label="Install list">{clipped ? lines.slice(0, 3).join('\n') : text}</pre>
      : <p className="install-unavailable">No command for {installOSLabels[os]}</p>}
    <div className="install-block-actions">
      <InstallOSPicker />
      {text.trim() && <CopyCommandButton text={text} label={`Copy ${clipped ? 'all ' : ''}commands for ${title}`} />}
    </div>
  </div>
}
