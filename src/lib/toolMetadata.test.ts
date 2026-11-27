import {afterEach,describe,expect,it,vi} from 'vitest'
import {readToolMetadata} from './toolMetadata'

afterEach(() => vi.unstubAllGlobals())

describe('source lookup', () => {
  it('reads an upstream skill manifest and preserves its exact install path', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({name:'demo',default_branch:'main'}))
      .mockResolvedValueOnce(Response.json({size:90,content:btoa('---\nname: My Tool\ndescription: >\n  Useful for\n  code review.\n---\n') }))
    vi.stubGlobal('fetch',fetcher)
    const result = await readToolMetadata('owner/demo/skills/MyTool','')
    expect(result).toMatchObject({name:'My Tool',description:'Useful for code review.',install_command:'apm install owner/demo/skills/MyTool'})
    expect(fetcher.mock.calls[1][0]).toContain('skills/MyTool/SKILL.md?ref=main')
  })
  it('does not contact an arbitrary host supplied as the source URL', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch',fetcher)
    await expect(readToolMetadata('','https://unrelated.example/test')).rejects.toThrow('GitHub')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
