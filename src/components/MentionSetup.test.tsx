import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InstallList } from './MentionSetup'

afterEach(cleanup)

it('limits feed previews to three command lines, copies the full block and shows all lines in the practice', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText} })
  const text = 'first\nsecond\nthird\nfourth'
  const props = { mentions:[], title:'Example', overrides:{windows:text, macos:'mac command', linux:''} }
  const view = render(<InstallList {...props} compact />)
  fireEvent.click(screen.getByRole('button',{name:'Windows'}))
  expect(screen.getByLabelText('Install list').textContent).toBe('first\nsecond\nthird')
  fireEvent.click(screen.getByRole('button',{name:'Copy all commands for Example'}))
  expect(writeText).toHaveBeenCalledWith(text)
  view.rerender(<InstallList {...props}/>)
  expect(screen.getByLabelText('Install list').textContent).toBe(text)
  fireEvent.click(screen.getByRole('button',{name:'Linux'}))
  expect(screen.queryByLabelText('Install list')).toBeNull()
  expect(screen.getByText('No command for Linux')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'macOS'}))
  expect(screen.getByLabelText('Install list').textContent).toBe('mac command')
})

it('uses linked catalog commands for legacy options, with universal fallback and deduplication', () => {
  const tool = {id:'one',slug:'one',name:'One',install_command:'install one',install_commands:{windows:'winget one'}}
  render(<InstallList mentions={[]} legacyTools={[tool,tool]} title="Original practice"/>)
  fireEvent.click(screen.getByRole('button',{name:'Windows'}))
  expect(screen.getByLabelText('Install list').textContent).toBe('winget one')
  fireEvent.click(screen.getByRole('button',{name:'Linux'}))
  expect(screen.getByLabelText('Install list').textContent).toBe('install one')
})

it('omits the entire block when no platform has instructions', () => {
  const view=render(<InstallList title="Empty" mentions={[]}/>)
  expect(view.container.firstChild).toBeNull()
})
