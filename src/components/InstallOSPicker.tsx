import { installOSLabels, useInstallOS, type InstallOS } from '../lib/installCommands'
import './install-block.css'

const platforms: InstallOS[] = ['windows', 'macos', 'linux']

export function InstallOSPicker() {
  const [os, setOS] = useInstallOS()
  return <span className="install-platforms" role="group" aria-label="Operating system">
    {platforms.map(platform => <button type="button" key={platform}
      aria-pressed={os === platform} onClick={() => setOS(platform)}>{installOSLabels[platform]}</button>)}
  </span>
}
