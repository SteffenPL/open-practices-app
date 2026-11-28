import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { MySkillsPage } from './MySkillsPage'
import { loadMySkills, saveMySkills, type MySkillsConfig } from '../lib/mySkillsService'

vi.mock('../auth/useAuth', () => ({useAuth:()=>({session:{user:{id:'author'}},loading:false})}))
vi.mock('../lib/catalogService', () => ({listTools:async()=>[{name:'Notes',apm_id:'catalog/notes'},{name:'Website',apm_id:null}]}))
vi.mock('../lib/mySkillsService',async importOriginal => ({...await importOriginal<object>(),loadMySkills:vi.fn(),saveMySkills:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const config:MySkillsConfig = {repo:'writer/skills',selected_packages:[],drafts:[]}

it('preselects a catalog link without saving, and previews authored files for an explicit commit', async () => {
  vi.mocked(loadMySkills).mockResolvedValue({config,version:2})
  vi.mocked(saveMySkills).mockImplementation(async config=>({config,version:3}))
  render(<MemoryRouter initialEntries={['/my-skills?add=catalog%2Fnotes']}><MySkillsPage/></MemoryRouter>)
  expect((await screen.findByRole('checkbox',{name:/Notes/}) as HTMLInputElement).checked).toBe(true)
  expect(saveMySkills).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Add a skill'}))
  fireEvent.change(screen.getByLabelText('Skill name 1'),{target:{value:'review-notes'}})
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Read the notes.'}})
  fireEvent.change(screen.getByLabelText('Instructions'),{target:{value:'Check the draft carefully.'}})
  const path='.apm/skills/review-notes/SKILL.md'
  const details=screen.getByText(path,{selector:'summary'}).closest('details')!
  expect(details.querySelector('pre')?.textContent).toContain('Check the draft carefully.')
  fireEvent.change(screen.getByLabelText('GitHub branch'),{target:{value:'trunk'}})
  const url=new URL(details.querySelector('a')!.href)
  expect(url.pathname).toBe('/writer/skills/new/trunk')
  expect(url.searchParams.get('filename')).toBe(path)
  expect(url.searchParams.get('value')).toBe(details.querySelector('pre')!.textContent)
  fireEvent.click(screen.getByRole('button',{name:'Save collection'}))
  await waitFor(()=>expect(saveMySkills).toHaveBeenCalledWith(expect.objectContaining({selected_packages:['catalog/notes'],drafts:[expect.objectContaining({name:'review-notes',body:'Check the draft carefully.'})]}),2))
})

it('keeps unavailable previously saved packages and ignores unknown package deep links', async () => {
  vi.mocked(loadMySkills).mockResolvedValue({config:{...config,selected_packages:['legacy/hidden']},version:1})
  render(<MemoryRouter initialEntries={['/my-skills?add=unknown%2Fpackage']}><MySkillsPage/></MemoryRouter>)
  expect((await screen.findByRole('checkbox',{name:/legacy\/hidden/}) as HTMLInputElement).checked).toBe(true)
  expect((screen.getByRole('button',{name:'Save collection'}) as HTMLButtonElement).disabled).toBe(true)
})
