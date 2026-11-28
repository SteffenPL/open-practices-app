import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GitHubSkillsPanel, type GitHubSkillsPanelHandle } from './GitHubSkillsPanel'
import { loadGitHubSkills, pushGitHubSkills } from '../lib/githubSkillsSync'
import { planSkillsChanges, importSkillsRepository } from '../lib/skillsSyncPlan'
import type { MySkillsConfig } from '../lib/mySkillsService'

vi.mock('../lib/githubSkillsSync',()=>({loadGitHubSkills:vi.fn(),pushGitHubSkills:vi.fn()}))
vi.mock('../lib/skillsSyncPlan',()=>({planSkillsChanges:vi.fn(),importSkillsRepository:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks();vi.restoreAllMocks()})

const local:MySkillsConfig={repo:'writer/skills',selected_packages:['local/pkg'],drafts:[]}
const remote:MySkillsConfig={...local,selected_packages:['remote/pkg']}
const snapshot={repo:local.repo,branch:'feature/edit',sha:'a'.repeat(40),files:[{path:'apm.yml',content:'current'}]}
function mount(options:{token?:string;dirty?:boolean;autoSync?:boolean}={}) {
  const onImport=vi.fn(), onAutoSyncChange=vi.fn()
  const ref=createRef<GitHubSkillsPanelHandle>()
  vi.mocked(loadGitHubSkills).mockResolvedValue(snapshot)
  vi.mocked(importSkillsRepository).mockReturnValue(remote)
  vi.mocked(planSkillsChanges).mockReturnValue([{path:'apm.yml',before:'current',after:'updated'}])
  vi.mocked(pushGitHubSkills).mockResolvedValue('b'.repeat(40))
  const panel=(config:MySkillsConfig)=><GitHubSkillsPanel ref={ref} config={config} branch={snapshot.branch} token="" dirty={false} autoSync={false}
    onAutoSyncChange={onAutoSyncChange} onImport={onImport} {...options}/>
  const view=render(panel(local))
  return {ref,onImport,rerender:(config:MySkillsConfig)=>view.rerender(panel(config))}
}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))

it('imports public branches with no credential or write controls and confirms only dirty changes',async()=>{
  const {onImport}=mount({dirty:true})
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  click('Import from GitHub')
  expect(loadGitHubSkills).not.toHaveBeenCalled()
  click('Import from GitHub')
  await waitFor(()=>expect(onImport).toHaveBeenCalledWith(remote))
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(loadGitHubSkills).toHaveBeenCalledWith(local.repo,snapshot.branch,undefined)
  expect(screen.queryByRole('button',{name:'Publish to GitHub'})).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
})

it('publishes without a prior pull using an additive baseline',async()=>{
  const {onImport}=mount({token:'example'})
  click('Publish to GitHub')
  await screen.findByRole('link',{name:/View commit/})
  expect(planSkillsChanges).toHaveBeenCalledWith(local,snapshot.files,undefined)
  expect(pushGitHubSkills).toHaveBeenCalledWith(snapshot,[{path:'apm.yml',content:'updated'}],'Update my skills collection','example')
  expect(onImport).not.toHaveBeenCalled()
})

it('publishes automatically only through explicit saved collection callback and blocks duplicates',async()=>{
  const {ref,rerender}=mount({token:'example',autoSync:true})
  const edited={...local,selected_packages:[]}
  rerender(edited)
  expect(loadGitHubSkills).not.toHaveBeenCalled()
  await act(async()=>{
    const pending=ref.current!.syncSaved(edited)
    await expect(ref.current!.syncSaved(edited)).rejects.toThrow('in progress')
    await pending
  })
  expect(planSkillsChanges).toHaveBeenCalledWith(edited,snapshot.files,undefined)
  expect(pushGitHubSkills).toHaveBeenCalledTimes(1)
})

it('preserves a stale baseline and pauses automatic publishing after branch conflict',async()=>{
  const {ref}=mount({token:'example',autoSync:true})
  vi.mocked(pushGitHubSkills).mockRejectedValueOnce(new Error('The GitHub branch changed.'))
  await act(async()=>{await expect(ref.current!.syncSaved(local)).rejects.toThrow('branch changed')})
  expect(screen.getByRole('alert').textContent).toContain('branch changed')
  await act(async()=>{await expect(ref.current!.syncSaved(local)).rejects.toThrow('paused')})
  expect(loadGitHubSkills).toHaveBeenCalledTimes(1)
  expect(pushGitHubSkills).toHaveBeenCalledTimes(1)
  click('Import from GitHub')
  await screen.findByText('Pulled feature/edit into the editor.')
  await act(async()=>{await ref.current!.syncSaved(local)})
  expect(planSkillsChanges).toHaveBeenLastCalledWith(local,snapshot.files,remote)
})
