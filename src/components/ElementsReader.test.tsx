import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElementsReader } from './ElementsReader'
import type { Element } from '../lib/types'

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
    { id: 'option-1', element_id: 'element-1', position: 0, name: 'First tool', description: 'First description', tool_id: null, tool: null },
    { id: 'option-2', element_id: 'element-1', position: 1, name: 'Second tool', description: 'Second description', tool_id: null, tool: null },
  ],
}

describe('ElementsReader', () => {
  it('keeps legacy card rendering even if an old element has the guided label', () => {
    render(<ElementsReader elements={[element]} selection={{}} onSelect={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Elements' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /First tool/ })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'First tool' })).toBeNull()
  })

  it('renders tool options as one-at-a-time tabs for marked guided practices', () => {
    const onSelect = vi.fn()
    render(<ElementsReader elements={[element]} selection={{}} onSelect={onSelect} guidedPractice />)

    expect(screen.getByRole('heading', { name: 'Tools for this practice' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Second tool' }))
    expect(screen.getByRole('tabpanel').textContent).toContain('Second description')
    expect(onSelect).toHaveBeenCalledWith('element-1', 'option-2')
  })
})
