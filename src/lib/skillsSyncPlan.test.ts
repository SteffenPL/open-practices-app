import {describe,it,expect} from 'vitest'
import {parse} from 'yaml'
import {importSkillsRepository,planSkillsChanges} from './skillsSyncPlan'

const repo='me/skills'
const path='.apm/skills/review/SKILL.md'
const skill='---\r\nname: review\r\n# custom\r\ndescription: old\r\nmetadata:\r\n  audience: team\r\nallowed-tools: Read\r\n---\r\n\r\n# Review\r\n'
const manifest='# team\nname: collection\nscripts: {check: build}\ndependencies:\n  apm:\n    - org/plain\n    - Org/pinned#v2\n    - git: org/filtered\n      skills: [one]\n    - git: https://git.example.org/unrecognized.git\n  mcp: [server]\n'
const files=[{path:'apm.yml',content:manifest},{path,content:skill},{path:'README.md',content:'Unmanaged'}]
describe('repository sync planning',()=>{
  it('imports selections and stable drafts and roundtrips byte-identically',()=>{
    const config=importSkillsRepository(repo,files)
    expect(config.selected_packages).toEqual(['org/plain','Org/pinned#v2','org/filtered'])
    expect(config.drafts).toEqual([{id:path,name:'review',description:'old',body:'\r\n# Review\r\n'}])
    expect(planSkillsChanges(config,files,config)).toEqual([])
  })
  it('removes only explicitly deselected plain packages, retaining pins, filters, unknown dependencies and metadata',()=>{
    const baseline=importSkillsRepository(repo,files)
    const config={...baseline,selected_packages:['Org/pinned#v2','org/filtered','org/new/Case']}
    const [result]=planSkillsChanges(config,files,baseline)
    expect(result.before).toBe(manifest)
    expect(parse(result.after).dependencies).toEqual({apm:['Org/pinned#v2',{git:'org/filtered',skills:['one']},{git:'https://git.example.org/unrecognized.git'},'org/new/Case'],mcp:['server']})
    expect(result.after).toContain('# team')
    expect(parse(result.after).scripts).toEqual({check:'build'})
    expect(parse(planSkillsChanges(config,files)[0].after).dependencies.apm).toContain('org/plain')
    expect(()=>planSkillsChanges({...config,selected_packages:['org/new']},files,baseline)).toThrow(/pinned or structured/)
  })
  it('edits instructions and descriptions without replacing custom metadata or links',()=>{
    const baseline=importSkillsRepository(repo,files)
    const change={...baseline.drafts[0],body:'\r\nChanged\r\n',description:'New: description'}
    const [out]=planSkillsChanges({...baseline,drafts:[change]},files,baseline)
    expect(out.path).toBe(path)
    expect(out.after).toContain('# custom\r\n')
    expect(out.after).toContain('allowed-tools: Read')
    expect(out.after).toContain('audience: team')
    expect(out.after).toMatch(/---\r\n\r\nChanged\r\n$/)
    expect(planSkillsChanges({...baseline,drafts:[]},files,baseline)).toEqual([])
  })
  it('replanning freshly generated output is a no-op and missing loaded files are protected',()=>{
    const config={repo,selected_packages:['org/tools'],drafts:[{id:'local',name:'review',description:'Review code',body:'Do the review.'}]}
    const written=planSkillsChanges(config,[]).map(f=>({path:f.path,content:f.after}))
    expect(planSkillsChanges(config,written)).toEqual([])
    const baseline=importSkillsRepository(repo,files)
    expect(()=>planSkillsChanges(baseline,files.filter(f=>f.path!==path),baseline)).toThrow(/missing/)
  })
  it('protects colliding files, concurrent edits and conflicting pins',()=>{
    const baseline=importSkillsRepository(repo,files)
    const local={...baseline,drafts:[{...baseline.drafts[0],body:'my changes'}]}
    expect(()=>planSkillsChanges(local,files)).toThrow(/Load its contents/)
    expect(()=>planSkillsChanges(local,files.map(f=>f.path===path?{...f,content:skill.replace('# Review','# Remote')}:f),baseline)).toThrow(/changed on GitHub/)
    expect(()=>planSkillsChanges({...baseline,selected_packages:[...baseline.selected_packages,'Org/pinned#v3']},files,baseline)).toThrow(/Git ref/)
    expect(()=>planSkillsChanges(local,[{path,content:'no frontmatter'}],baseline)).toThrow()
  })
})
