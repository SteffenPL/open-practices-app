import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGitHubSkills, pushGitHubSkills, type GitHubSkillsSnapshot } from './githubSkillsSync'

const base = 'a'.repeat(40), root = 'b'.repeat(40), blob = 'c'.repeat(40), tree = 'd'.repeat(40), commit = 'e'.repeat(40)
const ref = {object:{sha:base,type:'commit'}}
const repo = 'team/skills', branch = 'work/notes'
const starter: GitHubSkillsSnapshot = {repo,branch,sha:base,files:[{path:'apm.yml',content:'old manifest'}]}
const entry = (path:string, type='blob', mode='100644') => ({path,type,mode,sha:blob,size:2})
function mockGitHub(...responses: (object | Response)[]) {
  const fetcher = vi.fn<typeof fetch>(async () => {
    const result = responses.shift()
    if (!result) throw new Error('Unexpected GitHub request')
    return result instanceof Response ? result : Response.json(result)
  })
  vi.stubGlobal('fetch',fetcher)
  return fetcher
}
afterEach(() => vi.unstubAllGlobals())

describe('GitHub skill synchronization', () => {
  it('loads only managed files in stable order from the exact commit', async () => {
    const manifest = entry('apm.yml')
    const note = entry('.apm/skills/notes/SKILL.md')
    const b64 = {size:2,encoding:'base64',content:btoa('ok')}
    const fetcher = mockGitHub(ref,{tree:{sha:root}},{truncated:false,tree:[note,entry('README.md'),manifest]},b64,b64)
    const snapshot = await loadGitHubSkills(repo,branch,'fake-token')
    expect(snapshot).toEqual({repo,branch,sha:base,files:[{path:'apm.yml',content:'ok'},{path:note.path,content:'ok'}]})
    expect(fetcher.mock.calls.map(([path]) => String(path).split('/git/')[1])).toEqual(['ref/heads/work/notes','commits/'+base,'trees/'+root+'?recursive=1','blobs/'+blob,'blobs/'+blob])
    for (const [url,options] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.github\.com\//)
      expect(options).toMatchObject({headers:{Authorization:'Bearer fake-token'},credentials:'omit',redirect:'error'})
    }
  })

  it('recovers a truncated recursive listing by walking only relevant directories', async () => {
    const nested = (path:string) => entry(path,'tree','040000')
    const fetcher = mockGitHub(ref,{tree:{sha:root}},{truncated:true,tree:[]},
      {tree:[nested('other'),nested('.apm')]},{tree:[nested('skills')]},{tree:[nested('notes')]},
      {tree:[entry('SKILL.md')]},{encoding:'base64',size:2,content:btoa('ok')})
    const {files} = await loadGitHubSkills(repo,branch)
    expect(files.map(f => f.path)).toEqual(['.apm/skills/notes/SKILL.md'])
    expect(fetcher).toHaveBeenCalledTimes(8)
  })

  it('refuses incomplete listings, oversized files, symlinks, and case variants', async () => {
    mockGitHub(ref,{tree:{sha:root}},{truncated:true,tree:[]},{truncated:true,tree:[]})
    await expect(loadGitHubSkills(repo,branch)).rejects.toThrow('incomplete directory')
    for (const [row,reason] of [
      [{...entry('apm.yml'),size:1048577},'1 MiB'],
      [entry('apm.yml','blob','120000'),'regular file'],
      [entry('.apm/skills','blob','120000'),'directory'],
      [entry('.apm/skills/demo/skill.md'),'Rename'],
    ] as const) {
      mockGitHub(ref,{tree:{sha:root}},{tree:[row]})
      await expect(loadGitHubSkills(repo,branch)).rejects.toThrow(reason)
    }
  })

  it('uses one non-forced branch update and retains omitted files and executable mode', async () => {
    const fetcher = mockGitHub(ref,{tree:{sha:root}},{tree:[entry('apm.yml','blob','100755'),entry('README.md')]},{sha:tree},{sha:commit},{node_id:'repo-node'},{data:{updateRefs:{clientMutationId:null}}})
    expect(await pushGitHubSkills(starter,[{path:'apm.yml',content:'new manifest'}],'Sync skills','test')).toBe(commit)
    const writes = fetcher.mock.calls.filter(([,options]) => options?.method !== 'GET')
    expect(writes.map(([url]) => url)).toEqual([
      'https://api.github.com/repos/team/skills/git/trees','https://api.github.com/repos/team/skills/git/commits','https://api.github.com/graphql',
    ])
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({base_tree:root,tree:[{path:'apm.yml',content:'new manifest',mode:'100755',type:'blob'}]})
    expect(JSON.parse(String(writes[1][1]?.body))).toEqual({message:'Sync skills',tree,parents:[base]})
    expect(JSON.parse(String(writes[2][1]?.body)).variables.input).toEqual({repositoryId:'repo-node',refUpdates:[
      {name:'refs/heads/work/notes',beforeOid:base,afterOid:commit,force:false},
    ]})
  })

  it('rejects stale pull snapshots and changes between commit creation and branch update', async () => {
    const advanced = {object:{sha:commit,type:'commit'}}
    let fetcher = mockGitHub(advanced)
    const changed = [{path:'apm.yml',content:'updated'}]
    await expect(pushGitHubSkills(starter,changed,'Sync','test')).rejects.toThrow('branch changed')
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher = mockGitHub(ref,{tree:{sha:root}},{tree:[]},{sha:tree},{sha:commit},{node_id:'repo-node'},{errors:[{message:'stale'}]},{object:{type:'commit',sha:root}})
    await expect(pushGitHubSkills(starter,changed,'Sync','test')).rejects.toThrow('branch changed')
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://api.github.com/graphql')).toHaveLength(1)
  })

  it('confirms a successful compare-and-swap after a response failure', async () => {
    mockGitHub(ref,{tree:{sha:root}},{tree:[]},{sha:tree},{sha:commit},{node_id:'repo-node'},new Response(null,{status:502}),{object:{type:'commit',sha:commit}})
    expect(await pushGitHubSkills(starter,[{path:'apm.yml',content:'updated'}],'Sync','test')).toBe(commit)
  })

  it('never writes paths outside the managed collection and skips unchanged content', async () => {
    const fetcher = mockGitHub(ref)
    await expect(pushGitHubSkills(starter,[{path:'../outside',content:'changed'}],'Sync','test')).rejects.toThrow('managed')
    expect(await pushGitHubSkills(starter,starter.files,'Sync','test')).toBe(base)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
