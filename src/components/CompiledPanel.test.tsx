import { PracticeCommands } from './PracticeCommands'
import { optionCommands } from '../pages/guidedPracticeContent'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompiledPanel } from './CompiledPanel'
import type { Element } from '../lib/types'
import { withInstallCommand } from '../pages/guidedPracticeContent'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const element: Element = {
  id: 'element-1',
  practice_id: 'practice-1',
  position: 0,
  name: 'Recommended tools',
  description: null,
  require_options: [],
  reject_options: [],
  options: [
    { id: 'option-1', element_id: 'element-1', position: 0, name: 'First tool', description: withInstallCommand('', 'apm install org/first'), tool_id: 'tool-1', tool: { id: 'tool-1', apm_id: 'org/first', repo_url: null, name: 'First tool', description: null } },
    { id: 'option-2', element_id: 'element-1', position: 1, name: 'Second tool', description: withInstallCommand('', 'npm install second-tool'), tool_id: null, tool: null },
  ],
}

describe('CompiledPanel', () => {
  it('copies only the selected authored command and excludes options without commands', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { container } = render(<PracticeCommands commands={optionCommands([...element.options, { name: 'Unconfigured', description: 'Only guidance' }])} />)
    expect([...container.querySelectorAll('code')].map(code => code.textContent)).toEqual([
      'apm install org/first', 'npm install second-tool',
    ])
    expect(screen.getAllByRole('button', { name: /Copy command for/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Copy command for Second tool' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('npm install second-tool'))
  })

  it('keeps legacy command output for unmarked practices', () => {
    render(<CompiledPanel elements={[element]} selection={{ 'element-1': 'option-1' }} />)

    expect(screen.getByRole('heading', { name: 'Compiled practice' })).toBeTruthy()
    expect(screen.getByText('apm add org/first')).toBeTruthy()
  })
})
