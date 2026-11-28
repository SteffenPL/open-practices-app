import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { downloadRepositoryArchive } from '../lib/skillsArchive'
import { loadGitHubSkills, pushGitHubSkills } from '../lib/githubSkillsSync'
import { MySkillsPage } from './MySkillsPage'
import { loadMySkills, saveMySkills, type MySkillsConfig } from '../lib/mySkillsService'

vi.mock('../auth/useAuth', () => ({useAuth:()=>({session:{user:{id:'author'}},loading:false})}))
vi.mock('../lib/catalogService', () => ({listTools:async()=>[{name:'Notes',apm_id:'catalog/notes'},{name:'Website',apm_id:null}]}))
vi.mock('../lib/mySkillsService',async importOriginal => ({...await importOriginal<object>(),loadMySkills:vi.fn(),saveMySkills:vi.fn()}))
vi.mock('../lib/skillsArchive',()=>({downloadRepositoryArchive:vi.fn()}))
vi.mock('../lib/githubSkillsSync',()=>({loadGitHubSkills:vi.fn(),pushGitHubSkills:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear()})
const config:MySkillsConfig = {repo:'writer/skills',selected_packages:[],drafts:[]}

it('exports a portable ZIP with authored skills and catalog selections without a GitHub repository', async () => {
  vi.mocked(loadMySkills).mockResolvedValue({config:{...config,repo:''},version:2})
  vi.mocked(saveMySkills).mockImplementation(async config=>({config,version:3}))
  render(<MemoryRouter initialEntries={['/my-skills?add=catalog%2Fnotes']}><MySkillsPage/></MemoryRouter>)
  expect((await screen.findByRole('checkbox',{name:/Notes/}) as HTMLInputElement).checked).toBe(true)
  expect(saveMySkills).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Add a skill'}))
  fireEvent.change(screen.getByLabelText('Skill name 1'),{target:{value:'review-notes'}})
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Read the notes.'}})
  fireEvent.change(screen.getByLabelText('Instructions'),{target:{value:'Check the draft carefully.'}})
  const path='.apm/skills/review-notes/SKILL.md'
  fireEvent.click(screen.getByRole('button',{name:'Download ZIP'}))
  expect(downloadRepositoryArchive).toHaveBeenCalledWith('',expect.arrayContaining([expect.objectContaining({path,content:expect.stringContaining('Check the draft carefully.')}),expect.objectContaining({path:'apm.yml',content:expect.stringContaining('catalog/notes')})]))
  expect(screen.queryByRole('button',{name:'Import from GitHub'})).toBeNull()
  expect(screen.queryByLabelText('GitHub token')).toBeNull()
  expect(screen.getByRole('link',{name:'API access'}).getAttribute('href')).toBe('/agents?scope=my-skills')
  expect(loadGitHubSkills).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Save collection'}))
  await waitFor(()=>expect(saveMySkills).toHaveBeenCalledWith(expect.objectContaining({selected_packages:['catalog/notes'],drafts:[expect.objectContaining({name:'review-notes',body:'Check the draft carefully.'})]}),2))
})

it('keeps unavailable previously saved packages and ignores unknown package deep links', async () => {
  vi.mocked(loadMySkills).mockResolvedValue({config:{...config,selected_packages:['legacy/hidden']},version:1})
  render(<MemoryRouter initialEntries={['/my-skills?add=unknown%2Fpackage']}><MySkillsPage/></MemoryRouter>)
  expect((await screen.findByRole('checkbox',{name:/legacy\/hidden/}) as HTMLInputElement).checked).toBe(true)
  expect((screen.getByRole('button',{name:'Save collection'}) as HTMLButtonElement).disabled).toBe(true)
})


it('offers import alone without a token, and publishes only after an opted-in successful save', async()=>{
  vi.mocked(loadMySkills).mockResolvedValue({config,version:1})
  vi.mocked(saveMySkills).mockImplementation(async changed=>({config:changed,version:2}))
  vi.mocked(loadGitHubSkills).mockResolvedValue({repo:config.repo,branch:'main',sha:'a'.repeat(40),files:[]})
  vi.mocked(pushGitHubSkills).mockRejectedValue(new Error('The GitHub branch changed.'))
  render(<MemoryRouter><MySkillsPage/></MemoryRouter>)
  await screen.findByRole('button',{name:'Import from GitHub'})
  expect(screen.queryByRole('button',{name:'Publish to GitHub'})).toBeNull()
  expect(screen.queryByRole('checkbox',{name:'Publish when I save'})).toBeNull()
  fireEvent.change(screen.getByLabelText('GitHub token'),{target:{value:'fixture-token'}})
  expect(screen.getByRole('button',{name:'Publish to GitHub'})).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox',{name:'Publish when I save'}))
  fireEvent.click(screen.getByRole('checkbox',{name:/Notes/}))
  expect(loadGitHubSkills).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Save and publish'}))
  await screen.findByText('Saved to your account. GitHub has not been updated.')
  expect(pushGitHubSkills).toHaveBeenCalledTimes(1)
  expect(saveMySkills).toHaveBeenCalledTimes(1)
  expect(Object.values(localStorage)).not.toContain('fixture-token')
  fireEvent.change(screen.getByLabelText('GitHub token'),{target:{value:''}})
  expect(screen.queryByRole('button',{name:'Publish to GitHub'})).toBeNull()
})
