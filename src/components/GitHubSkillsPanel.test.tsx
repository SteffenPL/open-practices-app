import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GitHubSkillsPanel } from './GitHubSkillsPanel'
import { loadGitHubSkills, pushGitHubSkills } from '../lib/githubSkillsSync'
import { planSkillsChanges, importSkillsRepository } from '../lib/skillsSyncPlan'
import type { MySkillsConfig } from '../lib/mySkillsService'

vi.mock('../lib/githubSkillsSync',()=>({loadGitHubSkills:vi.fn(),pushGitHubSkills:vi.fn()}))
vi.mock('../lib/skillsSyncPlan',()=>({planSkillsChanges:vi.fn(),importSkillsRepository:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})

const local:MySkillsConfig={repo:'writer/skills',selected_packages:['local/pkg'],drafts:[]}
const remote:MySkillsConfig={...local,selected_packages:['remote/pkg']}
const snapshot={repo:local.repo,branch:'feature/edit',sha:'a'.repeat(40),files:[{path:'apm.yml',content:'current'}]}
function mount() {
  const onImport=vi.fn()
  vi.mocked(loadGitHubSkills).mockResolvedValue(snapshot)
  vi.mocked(importSkillsRepository).mockReturnValue(remote)
  vi.mocked(planSkillsChanges).mockReturnValue([{path:'apm.yml',before:'current',after:'updated'}])
  const panel=(config:MySkillsConfig)=><GitHubSkillsPanel config={config} branch={snapshot.branch} dirty onImport={onImport}/>
  const view=render(panel(local))
  fireEvent.click(screen.getByText('Sync with GitHub'))
  return {onImport,rerender:(config:MySkillsConfig)=>view.rerender(panel(config))}
}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))

it('allows a public read and explicit import while protecting unsaved work', async()=>{
  const {onImport,rerender}=mount()
  click('Load from GitHub')
  await screen.findByText('Review incoming collection')
  expect(loadGitHubSkills).toHaveBeenCalledWith(local.repo,snapshot.branch,undefined)
  expect(onImport).not.toHaveBeenCalled()
  click('Replace unsaved edits with import')
  expect(onImport).toHaveBeenCalledWith(remote)
  rerender(remote)
  click('Preview changes')
  expect(planSkillsChanges).toHaveBeenCalledWith(remote,snapshot.files,remote)
  expect(pushGitHubSkills).not.toHaveBeenCalled()
})

it('previews preserved local edits, invalidates stale reviews, and only writes on explicit commit', async()=>{
  const {onImport,rerender}=mount()
  const neverPersist='test-token'
  fireEvent.change(screen.getByLabelText('Fine-grained GitHub token'),{target:{value:neverPersist}})
  click('Load from GitHub')
  await screen.findByText('Review incoming collection')
  click('Keep my editor contents')
  expect(onImport).not.toHaveBeenCalled()
  click('Preview changes')
  expect(planSkillsChanges).toHaveBeenCalledWith(local,snapshot.files,undefined)
  rerender({...local,selected_packages:[]})
  expect(screen.queryByRole('button',{name:'Commit to GitHub'})).toBeNull()
  click('Preview changes')
  expect(pushGitHubSkills).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Commit message'),{target:{value:'Update skills'}})
  vi.mocked(pushGitHubSkills).mockResolvedValue('b'.repeat(40))
  click('Commit to GitHub')
  await waitFor(()=>expect(pushGitHubSkills).toHaveBeenCalledWith(snapshot,[{path:'apm.yml',content:'updated'}],'Update skills',neverPersist))
  expect((await screen.findByRole('link',{name:/View commit/})).getAttribute('href')).toBe('https://github.com/writer/skills/commit/'+'b'.repeat(40))
  click('Disconnect')
  expect((screen.getByLabelText('Fine-grained GitHub token') as HTMLInputElement).value).toBe('')
  expect(screen.queryByRole('button',{name:'Preview changes'})).toBeNull()
})
