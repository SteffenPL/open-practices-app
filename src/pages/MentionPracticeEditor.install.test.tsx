import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { MentionPracticeEditor } from './MentionPracticeEditor'
import { saveMentionPractice } from '../lib/mentionService'
import { useInstallOS } from '../lib/installCommands'

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({session:{user:{id:'writer'}}, loading:false}) }))
vi.mock('../lib/catalogService', () => ({listTools: async () => [{id:'tool', name:'Demo', slug:'demo', install_commands:{windows:'install windows', linux:'install linux'}}]}))
vi.mock('../lib/mentionService', () => ({saveMentionPractice: vi.fn()}))
afterEach(() => {cleanup(); vi.resetAllMocks(); localStorage.clear()})

function TestSelector() {
  const [, select] = useInstallOS()
  return <><button onClick={() => select('linux')}>Linux</button><button onClick={() => select('windows')}>Windows</button></>
}
function editor() {
  return <MemoryRouter initialEntries={['/new']}><TestSelector/><Routes>
    <Route path="/new" element={<MentionPracticeEditor/>}/>
    <Route path="/practice/:id" element={<span>Saved practice</span>}/>
  </Routes></MemoryRouter>
}

it('keeps OS overrides independent, restores generation, and saves an intentionally empty override', async () => {
  vi.mocked(saveMentionPractice).mockResolvedValue({id:'saved'} as Awaited<ReturnType<typeof saveMentionPractice>>)
  render(editor())
  fireEvent.click(screen.getByRole('button',{name:'Windows'}))
  fireEvent.change(await screen.findByLabelText('Title'), {target:{value:'A practice'}})
  fireEvent.change(screen.getByLabelText('Key message'), {target:{value:'Using #demo.'}})
  const field = (name:string) => screen.getByLabelText(name + ' install block') as HTMLTextAreaElement
  expect(field('Windows').value).toBe('install windows')
  fireEvent.change(field('Windows'), {target:{value:'custom windows'}})
  fireEvent.click(screen.getByText('Preview', {selector:'summary'}))
  expect(screen.getByLabelText('Install list').textContent).toBe('custom windows')
  fireEvent.click(screen.getByRole('button',{name:'Linux'}))
  expect(field('Linux').value).toBe('install linux')
  fireEvent.change(field('Linux'), {target:{value:''}})
  expect(screen.queryByLabelText('Install list')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Windows'}))
  expect(field('Windows').value).toBe('custom windows')
  fireEvent.click(screen.getByRole('button',{name:'Use generated commands'}))
  expect(field('Windows').value).toBe('install windows')
  fireEvent.click(screen.getByRole('button',{name:'Publish practice'}))
  await waitFor(() => expect(saveMentionPractice).toHaveBeenCalledWith(expect.objectContaining({install_overrides:{linux:''}})))
})
