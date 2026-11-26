import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompiledPanel } from './CompiledPanel'
import type { Element } from '../lib/types'
import { withInstallCommand } from '../pages/guidedPracticeContent'

afterEach(cleanup)

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
  it('copies every guided tool command, including arbitrary commands', () => {
    const { container } = render(<CompiledPanel elements={[element]} selection={{}} guidedPractice />)

    expect(screen.getByRole('heading', { name: 'Install commands' })).toBeTruthy()
    expect(container.querySelector('pre code')?.textContent).toBe('apm install org/first\nnpm install second-tool')
  })

  it('keeps legacy command output for unmarked practices', () => {
    render(<CompiledPanel elements={[element]} selection={{ 'element-1': 'option-1' }} />)

    expect(screen.getByRole('heading', { name: 'Compiled practice' })).toBeTruthy()
    expect(screen.getByText('apm add org/first')).toBeTruthy()
  })
})
