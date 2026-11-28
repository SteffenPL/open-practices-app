import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { downloadRepositoryArchive } from '../lib/skillsArchive'
import { loadGitHubSkills, pushGitHubSkills } from '../lib/githubSkillsSync'
import { MySkillsPage } from './MySkillsPage'
import { listMySkillsSetups, createMySkillsSetup, renameMySkillsSetup, deleteMySkillsSetup, loadMySkills, saveMySkills, type MySkillsConfig } from '../lib/mySkillsService'

vi.mock('../auth/useAuth', () => ({useAuth:()=>({session:{user:{id:'author'}},loading:false})}))
vi.mock('../lib/catalogService', () => ({listTools:async()=>[{name:'Notes',apm_id:'catalog/notes'},{name:'Website',apm_id:null}]}))
vi.mock('../lib/mySkillsService',async importOriginal => ({...await importOriginal<object>(),loadMySkills:vi.fn(),saveMySkills:vi.fn(),listMySkillsSetups:vi.fn(),createMySkillsSetup:vi.fn(),renameMySkillsSetup:vi.fn(),deleteMySkillsSetup:vi.fn()}))
vi.mock('../lib/skillsArchive',()=>({downloadRepositoryArchive:vi.fn()}))
vi.mock('../lib/githubSkillsSync',()=>({loadGitHubSkills:vi.fn(),pushGitHubSkills:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear()})
const first={id:'default',name:'Personal',is_default:true,version:2}
const second={id:'other',name:'Lab',is_default:false,version:2}
beforeEach(()=>{vi.mocked(listMySkillsSetups).mockResolvedValue([first])})
const config:MySkillsConfig = {repo:'writer/skills',selected_packages:[],drafts:[]}

it('exports a portable ZIP with authored skills and catalog selections without a GitHub repository', async () => {
  vi.mocked(loadMySkills).mockResolvedValue({config:{...config,repo:''},version:2})
  vi.mocked(saveMySkills).mockImplementation(async config=>({config,version:3}))
  render(<MemoryRouter initialEntries={['/my-skills?add=catalog%2Fnotes']}><MySkillsPage/></MemoryRouter>)
  await waitFor(()=>expect((screen.getByRole('checkbox',{name:/Notes/}) as HTMLInputElement).checked).toBe(true))
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
  expect(screen.getByRole('link',{name:'API access'}).getAttribute('href')).toBe('/agents?scope=my-skills&setup=default')
  expect(loadGitHubSkills).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Save collection'}))
  await waitFor(()=>expect(saveMySkills).toHaveBeenCalledWith(expect.objectContaining({selected_packages:['catalog/notes'],drafts:[expect.objectContaining({name:'review-notes',body:'Check the draft carefully.'})]}),2,'default'))
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

it('opens a named setup and keeps unsaved edits and GitHub credentials tied to each setup', async()=>{
  vi.mocked(listMySkillsSetups).mockResolvedValue([first,second])
  vi.mocked(loadMySkills).mockResolvedValue({config,version:2})
  render(<MemoryRouter initialEntries={['/my-setups?setup=other&add=catalog%2Fnotes']}><MySkillsPage/></MemoryRouter>)
  const selector=await screen.findByRole('combobox',{name:'Setup'})
  expect((selector as HTMLSelectElement).value).toBe('other')
  const active=()=>within(screen.getByRole('combobox',{name:'Setup'}).closest('fieldset')!)
  fireEvent.change(active().getByLabelText('GitHub token'),{target:{value:'only-for-lab'}})
  fireEvent.click(active().getByText('Add to Lab'))
  expect((active().getByRole('checkbox',{name:/Notes/}) as HTMLInputElement).checked).toBe(true)
  fireEvent.change(selector,{target:{value:'default'}})
  await waitFor(()=>expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('default'))
  expect((active().getByLabelText('GitHub token') as HTMLInputElement).value).toBe('')
  expect((active().getByRole('checkbox',{name:/Notes/}) as HTMLInputElement).checked).toBe(false)
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'other'}})
  expect((active().getByLabelText('GitHub token') as HTMLInputElement).value).toBe('only-for-lab')
  expect((active().getByRole('checkbox',{name:/Notes/}) as HTMLInputElement).checked).toBe(true)
  expect(saveMySkills).not.toHaveBeenCalled()
})

it('creates, renames, and explicitly removes a non-default setup, returning to the single setup view',async()=>{
  vi.mocked(loadMySkills).mockResolvedValue({config,version:2})
  vi.mocked(createMySkillsSetup).mockResolvedValue(second)
  vi.mocked(renameMySkillsSetup).mockResolvedValue({...second,name:'Studio',version:3})
  vi.mocked(deleteMySkillsSetup).mockResolvedValue(undefined)
  render(<MemoryRouter><MySkillsPage/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'New setup'}))
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.change(screen.getByRole('textbox',{name:'Setup name'}),{target:{value:'Lab'}})
  fireEvent.click(screen.getByRole('button',{name:'Create setup'}))
  await screen.findByRole('combobox',{name:'Setup'})
  fireEvent.click(await screen.findByRole('button',{name:'Manage setup'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Setup name'}),{target:{value:'Studio'}})
  fireEvent.click(screen.getByRole('button',{name:'Rename setup'}))
  await screen.findByRole('option',{name:'Studio'})
  expect(renameMySkillsSetup).toHaveBeenCalledWith('other','Studio',2)
  fireEvent.click(await screen.findByRole('button',{name:'Manage setup'}))
  fireEvent.click(screen.getByRole('button',{name:'Delete setup'}))
  expect(deleteMySkillsSetup).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Confirm deletion'}))
  await waitFor(()=>expect(screen.queryByRole('combobox')).toBeNull())
  expect(deleteMySkillsSetup).toHaveBeenCalledWith('other',3)
  expect(pushGitHubSkills).not.toHaveBeenCalled()
})
